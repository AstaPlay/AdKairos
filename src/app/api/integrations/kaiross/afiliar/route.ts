import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdminFirestore } from "@/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { getKairoossSession, kairoossCacheKey, invalidateCachedValues } from "@/lib/kaiross-proxy.server";
import { kairoossRequest, fetchMeusSellerProdutos } from "@/services/kaiross-integration.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";
import type { Product } from "@/types/product.types";

const PRODUCTS_COLLECTION = "products";
const CHECKOUT_BASE_URL = "https://pay.kaiross.com.br";

interface AfiliarBody {
  kairoossProductId: string;
  name: string;
  description?: string;
  category?: string;
  images?: string[];
  sku?: string;
  brand?: string;
  precoVenda: number;
  vendedorAssumeFrete: boolean;
  tags?: string[];
  stock?: number;
  custoOrigem?: number;
}

interface KairoossSellerProdutoResponse {
  id?: string;
  slugCheckout?: string;
  [key: string]: unknown;
}

/**
 * POST — afilia um produto do catálogo à vitrine do vendedor na Kairóss de
 * verdade (não é uma cópia local): `POST /seller-produtos` (afilia + preço) →
 * reforço `PUT /seller-produtos/{id}/preco` → `PUT /seller-produtos/{id}/frete`.
 * Sequência confirmada em produção (ver ModalSalvar.jsx / loja/route.js de
 * referência). Se qualquer etapa após a afiliação falhar, o produto já foi
 * criado do lado da Kairóss — salvamos localmente mesmo assim e reportamos o
 * aviso, nunca deixamos o produto "afiliado só na Kairóss e órfão aqui".
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "auth_check_failed", message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão.") } },
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

  const body = (await request.json().catch(() => ({}))) as Partial<AfiliarBody>;

  if (!body.kairoossProductId || !body.name || typeof body.precoVenda !== "number" || body.precoVenda <= 0) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_request", message: "Produto e preço de venda são obrigatórios." } },
      { status: 400 },
    );
  }

  const precoVenda = body.precoVenda;
  const vendedorAssumeFrete = Boolean(body.vendedorAssumeFrete);
  let sellerProductId: string | null = null;
  let checkoutSlug: string | null = null;
  let warning: string | null = null;

  // Defesa antes de qualquer chamada à Kairóss: se este produto já existe no
  // catálogo local do usuário, não tenta afiliar de novo (a Kairóss rejeitaria
  // e o erro genérico anterior não dizia por quê). Isso cobre o caso comum —
  // o card do catálogo já deveria ter travado o clique antes de chegar aqui,
  // mas um clique em outra aba/dispositivo pode chegar de qualquer forma.
  const existingLocal = await firebaseAdminFirestore
    .collection(PRODUCTS_COLLECTION)
    .where("ownerId", "==", user.uid)
    .where("kaiross.productId", "==", body.kairoossProductId)
    .limit(1)
    .get();

  const existingLocalDoc = existingLocal.docs[0];
  if (!existingLocal.empty && existingLocalDoc) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "already_affiliated",
          message: "Este produto já está no seu catálogo.",
          existingProductId: existingLocalDoc.id,
        },
      },
      { status: 409 },
    );
  }

  try {
    const afiliarResponse = await kairoossRequest("/seller-produtos", session, {
      method: "POST",
      body: JSON.stringify({ produtoId: body.kairoossProductId, precoVenda }),
    });
    const afiliarData = (await afiliarResponse.json().catch(() => ({}))) as KairoossSellerProdutoResponse;

    if (!afiliarResponse.ok || !afiliarData.id) {
      // A Kairóss recusou a afiliação porque este produto já está afiliado
      // do lado deles (feito direto no painel deles, sem produto local
      // correspondente ainda — sincronização não teve chance de cruzar isso).
      // Detecção não depende só do status 409: a mensagem de erro devolvida
      // no corpo também é checada, já que não temos confirmação de que a
      // Kairóss usa exatamente esse código para este caso específico.
      const errorText = String(
        (afiliarData as { message?: string; erro?: string; error?: string }).message ??
          (afiliarData as { erro?: string }).erro ??
          (afiliarData as { error?: string }).error ??
          "",
      ).toLowerCase();
      const looksLikeConflict =
        afiliarResponse.status === 409 ||
        (errorText.includes("já") && (errorText.includes("afiliad") || errorText.includes("existe") || errorText.includes("cadastrad")));

      if (looksLikeConflict) {
        const remoteAffiliations = await fetchMeusSellerProdutos(session).catch(() => null);
        const existingRemote = remoteAffiliations?.find(
          (item) => String(item.produtoId) === String(body.kairoossProductId),
        );
        return NextResponse.json(
          {
            success: false,
            error: {
              code: "already_affiliated_remotely",
              message: existingRemote
                ? "Este produto já está afiliado na sua conta Kairóss. Sincronize para trazê-lo ao seu catálogo."
                : "A Kairóss recusou a afiliação — este produto pode já estar vinculado à sua conta.",
            },
          },
          { status: 409 },
        );
      }

      return NextResponse.json(
        {
          success: false,
          error: {
            code: "kaiross_affiliate_failed",
            message: "Não foi possível afiliar este produto na Kairóss agora.",
          },
        },
        { status: 502 },
      );
    }

    sellerProductId = String(afiliarData.id);
    checkoutSlug = afiliarData.slugCheckout ?? null;

    // Reforço de preço — a afiliação já envia precoVenda, esta chamada garante
    // consistência caso a origem ignore o preço no POST inicial.
    const precoResponse = await kairoossRequest(`/seller-produtos/${sellerProductId}/preco`, session, {
      method: "PUT",
      body: JSON.stringify({ precoVenda }),
    });
    const precoData = (await precoResponse.json().catch(() => ({}))) as KairoossSellerProdutoResponse;
    if (precoResponse.ok && precoData.slugCheckout) checkoutSlug = precoData.slugCheckout;
    if (!precoResponse.ok) {
      warning = "Produto afiliado, mas o reforço de preço falhou — confira o valor no painel da Kairóss.";
    }

    const freteResponse = await kairoossRequest(`/seller-produtos/${sellerProductId}/frete`, session, {
      method: "PUT",
      body: JSON.stringify({ vendedorAssumeFrete }),
    });
    const freteData = (await freteResponse.json().catch(() => ({}))) as KairoossSellerProdutoResponse;
    if (freteResponse.ok && freteData.slugCheckout) checkoutSlug = freteData.slugCheckout;
    if (!freteResponse.ok) {
      warning = "Produto afiliado, mas a configuração de frete falhou — confira no painel da Kairóss.";
    }
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "kaiross_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível conectar com a Kairóss agora."),
        },
      },
      { status: 502 },
    );
  }

  // A partir daqui o produto já existe na Kairóss — sempre persistimos
  // localmente, mesmo que preço/frete tenham só parcialmente funcionado.
  try {
    const now = new Date().toISOString();
    const productRef = firebaseAdminFirestore.collection(PRODUCTS_COLLECTION).doc();
    const link = checkoutSlug ? `${CHECKOUT_BASE_URL}/${checkoutSlug}` : undefined;

    const product: Omit<Product, "id"> = {
      ownerId: user.uid,
      name: body.name,
      description: body.description ?? "",
      category: body.category ?? "",
      tags: body.tags ?? [],
      price: precoVenda,
      stock: typeof body.stock === "number" && body.stock >= 0 ? body.stock : 0,
      status: "active",
      images: body.images ?? [],
      ...(body.sku ? { sku: body.sku } : {}),
      ...(body.brand ? { brand: body.brand } : {}),
      ...(link ? { link } : {}),
      variants: [],
      source: "kaiross",
      kaiross: {
        productId: body.kairoossProductId,
        sellerProductId: sellerProductId ?? undefined,
        checkoutSlug: checkoutSlug ?? undefined,
        cost: typeof body.custoOrigem === "number" && body.custoOrigem >= 0 ? body.custoOrigem : 0,
      },
      createdAt: now,
      updatedAt: now,
    };

    await productRef.set(product);

    // Invalida o cache de catálogo/ranking — a próxima leitura do modal deve
    // já refletir que este produto está afiliado (evita mostrar "Salvar" de
    // novo em um item que acabou de ser confirmado).
    await invalidateCachedValues([
      kairoossCacheKey(user.uid, "catalogo"),
      kairoossCacheKey(user.uid, "ranking"),
    ]);

    return NextResponse.json({
      success: true,
      data: { productId: productRef.id, sellerProductId, checkoutSlug, link: link ?? null, warning },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "local_save_failed",
          message: toSafeApiErrorMessage(
            error,
            "Produto afiliado na Kairóss, mas não foi possível salvar localmente. Tente sincronizar novamente.",
          ),
        },
      },
      { status: 502 },
    );
  }
}
