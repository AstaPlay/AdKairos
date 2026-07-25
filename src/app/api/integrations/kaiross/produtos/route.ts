import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdminFirestore } from "@/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { getKairoossSession } from "@/lib/kaiross-proxy.server";
import { readCachedValue, writeCachedValue, kairoossCacheKey } from "@/lib/kaiross-proxy.server";
import {
  kairoossRequest,
  mapKairoossProduct,
  fetchMaisVendidos,
  type KairoossRawProduct,
} from "@/services/kaiross-integration.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";
import type { Product } from "@/types/product.types";

type MappedProduct = ReturnType<typeof mapKairoossProduct>;

async function fetchCatalogFresh(session: Parameters<typeof kairoossRequest>[1]): Promise<KairoossRawProduct[]> {
  const response = await kairoossRequest("/produtos", session, { method: "GET" });
  if (!response.ok) {
    throw Object.assign(new Error(`API Kairóss retornou ${response.status}`), { status: response.status });
  }
  const raw: unknown = await response.json().catch(() => []);
  if (Array.isArray(raw)) return raw as KairoossRawProduct[];
  const body = raw as { produtos?: KairoossRawProduct[]; data?: KairoossRawProduct[] };
  return body.produtos ?? body.data ?? [];
}

/**
 * GET — catálogo real da Kairóss, com número de vendas cruzado a partir de
 * `/produtos/mais-vendidos` (confirmado em produção — ver kaiross-integration.service).
 * Cacheado 10 min por usuário; parâmetros de filtro/busca são aplicados aqui
 * sobre o catálogo já cruzado, sem round-trip extra à Kairóss.
 *
 * Query params: tipo=internacional|nacional, categoria, busca, maisVendidos=true,
 * apenasEstoque=false (default true).
 */
export async function GET(request: NextRequest) {
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
      { success: false, error: { code: "kaiross_not_connected", message: "Conta Kairóss não conectada." } },
      { status: 409 },
    );
  }

  try {
    const catalogCacheKey = kairoossCacheKey(user.uid, "catalogo");
    const rankingCacheKey = kairoossCacheKey(user.uid, "ranking");

    // Catálogo, ranking e "o que já tenho localmente" são independentes entre
    // si — buscados em paralelo. O terceiro é o que permite ao card do catálogo
    // saber, ANTES do clique, que um produto já foi afiliado (e evitar a
    // segunda tentativa de afiliação que a Kairóss rejeita com erro).
    const [rawProducts, vendasMap, localByKairoossId] = await Promise.all([
      (async () => {
        const cached = await readCachedValue<KairoossRawProduct[]>(catalogCacheKey);
        if (cached) return cached;
        const fresh = await fetchCatalogFresh(session);
        await writeCachedValue(catalogCacheKey, fresh);
        return fresh;
      })(),
      (async () => {
        const cachedEntries = await readCachedValue<[string, number][]>(rankingCacheKey);
        if (cachedEntries) return new Map(cachedEntries);
        const fresh = await fetchMaisVendidos(session);
        await writeCachedValue(rankingCacheKey, Array.from(fresh.entries()));
        return fresh;
      })(),
      (async () => {
        const snapshot = await firebaseAdminFirestore
          .collection("products")
          .where("ownerId", "==", user.uid)
          .where("source", "==", "kaiross")
          .get();
        const map = new Map<string, string>();
        snapshot.docs.forEach((doc) => {
          const kairoossProductId = (doc.data() as Product).kaiross?.productId;
          if (kairoossProductId) map.set(String(kairoossProductId), doc.id);
        });
        return map;
      })(),
    ]);

    const { searchParams } = new URL(request.url);
    const isInternational = searchParams.get("tipo") === "internacional";
    const categoria = searchParams.get("categoria") ?? "";
    const busca = searchParams.get("busca")?.toLowerCase() ?? "";
    const apenasMaisVendidos = searchParams.get("maisVendidos") === "true";
    const apenasEstoque = searchParams.get("apenasEstoque") !== "false";

    let mapped: Array<MappedProduct & { localProductId: string | null }> = rawProducts
      .filter((raw) => Boolean(raw.internacional) === isInternational)
      .map((raw) => {
        const product = mapKairoossProduct(raw, vendasMap);
        return { ...product, localProductId: localByKairoossId.get(String(product.kairoossProductId)) ?? null };
      });

    if (apenasEstoque) {
      mapped = mapped.filter((product) => product.isActive && (product.isInternational || product.stock > 0));
    }
    if (categoria && categoria !== "Todos") {
      mapped = mapped.filter((product) => product.category.startsWith(categoria));
    }
    if (busca) {
      mapped = mapped.filter((product) =>
        [product.name, product.brand, product.sku, product.category]
          .filter(Boolean)
          .some((field) => String(field).toLowerCase().includes(busca)),
      );
    }
    if (apenasMaisVendidos) {
      mapped = mapped.filter((product) => product.salesCount > 0).sort((a, b) => b.salesCount - a.salesCount);
    }

    const maxSalesCount = mapped.reduce((max, product) => Math.max(max, product.salesCount), 0);

    return NextResponse.json({
      success: true,
      data: {
        products: mapped,
        total: mapped.length,
        maxSalesCount,
      },
    });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      return NextResponse.json(
        { success: false, error: { code: "kaiross_session_expired", message: "Sessão Kairóss expirada. Conecte novamente." } },
        { status: 401 },
      );
    }

    return NextResponse.json(
      {
        success: false,
        error: { code: "catalog_fetch_failed", message: toSafeApiErrorMessage(error, "Não foi possível buscar o catálogo agora.") },
      },
      { status: 502 },
    );
  }
}
