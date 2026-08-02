import { type NextRequest, NextResponse } from "next/server";

import { firebaseAdminFirestore } from "@/firebase/admin";
import { getKairoossSession } from "@/lib/kaiross-proxy.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import {
  fetchMeusSellerProdutos,
  type KairoossRawProduct,
  kairoossRequest,
  mapKairoossProduct,
} from "@/services/kaiross-integration.service";
import type { Product } from "@/types/product.types";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

const PRODUCTS_COLLECTION = "products";
const CHECKOUT_BASE_URL = "https://pay.kaiross.com.br";
// Limite rígido do Firestore por batch — mesmo teto usado na rota de import.
const FIRESTORE_BATCH_LIMIT = 500;

interface SyncSummary {
  checked: number;
  removedRemotely: number;
  updated: number;
  unchanged: number;
  addedFromKaiross: number;
  details: Array<{
    productId: string;
    name: string;
    change: "removed_remotely" | "updated" | "added_from_kaiross";
  }>;
}

async function commitInBatches(ops: Array<(batch: FirebaseFirestore.WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < ops.length; i += FIRESTORE_BATCH_LIMIT) {
    const batch = firebaseAdminFirestore.batch();
    ops.slice(i, i + FIRESTORE_BATCH_LIMIT).forEach((op) => {
      op(batch);
    });
    await batch.commit();
  }
}

/**
 * POST — sincroniza o catálogo local com o estado real da vitrine Kairóss,
 * cruzando `GET /seller-produtos` (afiliações — confirmado em produção, ver
 * meus-produtos-output.json) com `GET /produtos` (catálogo completo, para
 * nome/imagem/categoria de produtos ainda não conhecidos localmente).
 *
 * Três efeitos possíveis:
 *
 * 1) Produto local não existe mais na lista de afiliações (excluído ou
 *    bloqueado direto no painel da Kairóss) → apagamos o produto local
 *    também. O usuário pediu esse comportamento explicitamente; por isso
 *    é apagar de verdade, não só pausar.
 * 2) Afiliação existe na Kairóss mas não há produto local correspondente
 *    (afiliado direto no painel deles, sem passar pelo fluxo de import
 *    daqui) → criamos o produto local automaticamente, mesmo formato do
 *    import manual.
 * 3) Produto existe nos dois lados → preço/link/estoque/status seguem a
 *    Kairóss como fonte de verdade.
 *
 * Produtos locais com `kaiross.productId` mas sem `sellerProductId` (import
 * feito antes dessa gravação existir) são "curados" aqui: cruzados por
 * productId contra a lista remota antes de decidir o que fazer com eles.
 */
export async function POST(request: NextRequest) {
  let user: Awaited<ReturnType<typeof requireAuthenticatedUser>>;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "auth_check_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão."),
        },
      },
      { status: 500 },
    );
  }
  if (!user) {
    return NextResponse.json(
      { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
      { status: 401 },
    );
  }

  const session = await getKairoossSession(user.uid);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { code: "kaiross_not_connected", message: "Conecte sua conta Kairóss primeiro." } },
      { status: 409 },
    );
  }

  try {
    const remoteList = await fetchMeusSellerProdutos(session);
    if (remoteList === null) {
      // Falha real de rede/API — nunca interpretar como "os produtos sumiram".
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "kaiross_sync_unavailable",
            message: "Não foi possível confirmar o estado atual na Kairóss agora. Tente novamente em instantes.",
          },
        },
        { status: 502 },
      );
    }

    const remoteBySellerProductId = new Map(remoteList.map((item) => [item.id, item]));
    const remoteByProdutoId = new Map(remoteList.map((item) => [String(item.produtoId), item]));

    const localSnapshot = await firebaseAdminFirestore
      .collection(PRODUCTS_COLLECTION)
      .where("ownerId", "==", user.uid)
      .where("source", "==", "kaiross")
      .get();

    const summary: SyncSummary = {
      checked: 0,
      removedRemotely: 0,
      updated: 0,
      unchanged: 0,
      addedFromKaiross: 0,
      details: [],
    };
    const ops: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
    const now = new Date().toISOString();

    // sellerProductId de afiliações já cobertas por algum produto local —
    // o que sobrar disso ao final são as afiliações novas (feitas direto no
    // painel da Kairóss) que ainda não têm produto correspondente aqui.
    const matchedSellerProductIds = new Set<string>();

    // Produtos locais que precisam de dado do catálogo completo além do que
    // `seller-produtos` oferece — hoje: custo zerado (produto criado antes da
    // correção que preenche `cost` a partir do preço sugerido) ou sem imagem
    // salva. Resolvidos num segundo passo, junto com o catálogo já buscado
    // para as afiliações novas, para nunca pagar a chamada extra à toa.
    const pendingEnrichment: Array<{ doc: FirebaseFirestore.QueryDocumentSnapshot; produtoId: string }> = [];

    for (const doc of localSnapshot.docs) {
      const product = doc.data() as Product;
      let sellerProductId = product.kaiross?.sellerProductId;

      // Cura vínculo legado: produto sem sellerProductId gravado, mas cujo
      // productId bate com uma afiliação remota — cruza e persiste o vínculo
      // agora para que sincronizações futuras não precisem repetir esse passo.
      if (!sellerProductId && product.kaiross?.productId) {
        const matchByProdutoId = remoteByProdutoId.get(String(product.kaiross.productId));
        if (matchByProdutoId) {
          sellerProductId = matchByProdutoId.id;
          const healedSellerProductId = sellerProductId;
          ops.push((batch) =>
            batch.update(doc.ref, {
              "kaiross.sellerProductId": healedSellerProductId,
              updatedAt: now,
            }),
          );
        }
      }

      if (!sellerProductId) continue; // ainda sem como cruzar com segurança

      summary.checked++;
      const remote = remoteBySellerProductId.get(sellerProductId);

      if (!remote || remote.bloqueado) {
        // Produto sumiu ou foi bloqueado na Kairóss — apaga localmente também.
        ops.push((batch) => batch.delete(doc.ref));
        summary.removedRemotely++;
        summary.details.push({ productId: doc.id, name: product.name, change: "removed_remotely" });
        continue;
      }

      matchedSellerProductIds.add(sellerProductId);

      const remoteLink = remote.slugCheckout ? `${CHECKOUT_BASE_URL}/${remote.slugCheckout}` : product.link;
      const priceChanged = Math.abs((product.price ?? 0) - remote.precoVenda) > 0.001;
      const linkChanged = remoteLink && remoteLink !== product.link;
      const statusShouldBeActive = remote.ativo && product.status === "paused";

      if (priceChanged || linkChanged || statusShouldBeActive) {
        ops.push((batch) =>
          batch.update(doc.ref, {
            price: remote.precoVenda,
            ...(remoteLink ? { link: remoteLink } : {}),
            ...(statusShouldBeActive ? { status: "active" } : {}),
            updatedAt: now,
          } satisfies Partial<Product>),
        );
        summary.updated++;
        summary.details.push({ productId: doc.id, name: product.name, change: "updated" });
      } else {
        summary.unchanged++;
      }

      // Produto legado (afiliado antes da correção de custo, ou cuja imagem
      // nunca chegou a ser gravada) — precisa do catálogo completo para ser
      // enriquecido; marcado aqui e resolvido no passo seguinte.
      const needsCost = !product.kaiross?.cost || product.kaiross.cost <= 0;
      const needsImage = !product.images || product.images.length === 0;
      if ((needsCost || needsImage) && product.kaiross?.productId) {
        pendingEnrichment.push({ doc, produtoId: String(product.kaiross.productId) });
      }
    }

    // Afiliações remotas sem produto local correspondente — o vendedor
    // afiliou direto no painel da Kairóss. Busca o catálogo completo se
    // houver pelo menos uma pendência (afiliação nova OU produto legado sem
    // custo/imagem), para não gastar a chamada à toa.
    const newAffiliations = remoteList.filter((item) => !matchedSellerProductIds.has(item.id) && !item.bloqueado);

    if (newAffiliations.length > 0 || pendingEnrichment.length > 0) {
      const catalogResponse = await kairoossRequest("/produtos", session, { method: "GET" }).catch(() => null);
      const catalogRaw: unknown = catalogResponse?.ok ? await catalogResponse.json().catch(() => null) : null;
      const catalogList: KairoossRawProduct[] = Array.isArray(catalogRaw)
        ? catalogRaw
        : ((catalogRaw as { produtos?: KairoossRawProduct[]; data?: KairoossRawProduct[] })?.produtos ??
          (catalogRaw as { produtos?: KairoossRawProduct[]; data?: KairoossRawProduct[] })?.data ??
          []);
      const catalogById = new Map(catalogList.map((item) => [String(item.id), item]));

      const productsRef = firebaseAdminFirestore.collection(PRODUCTS_COLLECTION);

      for (const affiliation of newAffiliations) {
        const rawProduct = catalogById.get(String(affiliation.produtoId));
        if (!rawProduct) continue; // sem dados de catálogo suficientes para criar com segurança

        const mapped = mapKairoossProduct(rawProduct);
        const remoteLink = affiliation.slugCheckout ? `${CHECKOUT_BASE_URL}/${affiliation.slugCheckout}` : undefined;
        const productRef = productsRef.doc();

        const newProduct: Omit<Product, "id"> = {
          ownerId: user.uid,
          name: mapped.name,
          description: mapped.description,
          category: mapped.category,
          tags: [],
          price: affiliation.precoVenda,
          stock: mapped.stock,
          status: affiliation.ativo && mapped.stock > 0 ? "active" : mapped.stock === 0 ? "out_of_stock" : "paused",
          images: mapped.images,
          ...(remoteLink ? { link: remoteLink } : {}),
          ...(mapped.sku ? { sku: mapped.sku } : {}),
          ...(mapped.brand ? { brand: mapped.brand } : {}),
          variants: [],
          source: "kaiross",
          kaiross: {
            productId: mapped.kairoossProductId,
            sellerProductId: affiliation.id,
            checkoutSlug: affiliation.slugCheckout,
            // O catálogo da Kairóss não expõe um campo de "custo" isolado —
            // o próprio fluxo manual de afiliação (catalog-affiliate-sheet.tsx)
            // usa `product.price` (= precoSugerido do catálogo) como custo de
            // origem, já que é o valor de referência que o fornecedor cobra do
            // vendedor. Replicamos a mesma regra aqui para produtos que entram
            // via sincronização automática, senão eles nunca ganham custo e
            // ficam com o slider de preço/decomposição escondidos no sheet.
            cost: mapped.price || mapped.cost,
          },
          createdAt: now,
          updatedAt: now,
        };

        ops.push((batch) => batch.set(productRef, newProduct));
        summary.addedFromKaiross++;
        summary.details.push({ productId: productRef.id, name: newProduct.name, change: "added_from_kaiross" });
      }

      // Cura produtos legados: sem custo (afiliados antes da correção acima)
      // ou sem imagem salva (mapeamento incompleto em alguma sincronização
      // anterior). Só grava o que realmente falta — nunca sobrescreve preço,
      // nome ou qualquer campo já editado pelo vendedor.
      for (const { doc, produtoId } of pendingEnrichment) {
        const rawProduct = catalogById.get(produtoId);
        if (!rawProduct) continue;

        const mapped = mapKairoossProduct(rawProduct);
        const product = doc.data() as Product;
        const patch: Record<string, unknown> = {};

        const needsCost = !product.kaiross?.cost || product.kaiross.cost <= 0;
        if (needsCost && mapped.price > 0) {
          patch["kaiross.cost"] = mapped.price;
        }

        const needsImage = !product.images || product.images.length === 0;
        if (needsImage && mapped.images.length > 0) {
          patch.images = mapped.images;
        }

        if (Object.keys(patch).length > 0) {
          patch.updatedAt = now;
          ops.push((batch) => batch.update(doc.ref, patch));
          summary.updated++;
          summary.details.push({ productId: doc.id, name: product.name, change: "updated" });
        }
      }
    }

    if (ops.length > 0) {
      await commitInBatches(ops);
    }

    return NextResponse.json({ success: true, data: summary });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "sync_failed", message: toSafeApiErrorMessage(error, "Não foi possível sincronizar agora.") },
      },
      { status: 502 },
    );
  }
}
