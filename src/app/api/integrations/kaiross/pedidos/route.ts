import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { getKairoossSession, readCachedValue, writeCachedValue, kairoossCacheKey } from "@/lib/kaiross-proxy.server";
import { fetchVendasResumo, fetchPedidosKaiross, type KairoossPedidoRaw } from "@/services/kaiross-integration.service";
import { upsertPedidosIndex } from "@/lib/pedido-tracking-index.server";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Formato enxuto de pedido devolvido ao front — mantém os campos que a
 * tabela/KPIs realmente usam, sem replicar todo o payload bruto da Kairóss
 * (que inclui dados sensíveis do cliente como CPF e endereço completo,
 * desnecessários para esta tela).
 */
function mapPedido(raw: KairoossPedidoRaw) {
  return {
    id: raw.id,
    numeroPedido: raw.numeroPedido,
    dataCriacao: raw.dataCriacao,
    clienteNome: raw.clienteNome,
    formaPagamento: raw.formaPagamento ?? null,
    valorBruto: raw.valorBruto,
    valorLiquidoVendedor: raw.valorLiquidoVendedor,
    statusPagamento: raw.statusPagamento,
    statusFornecedor: raw.statusFornecedor ?? null,
    codigoRastreio: raw.codigoRastreio ?? null,
    produtos: raw.itens.map((item) => item.produtoNome),
  };
}

/**
 * GET — pedidos/vendas do vendedor na Kairóss.
 *
 * Dois endpoints confirmados em produção (capturados via DevTools Network
 * em 2026-07-26, sessão real):
 * - `/vendas/relatorio` → contadores agregados (resumo)
 * - `/vendas/pedidos` → lista completa de pedidos, sem paginação nem filtro
 *   no servidor (um GET simples devolveu o histórico inteiro do vendedor)
 *
 * `statusPagamento` só foi observado com o valor "PENDENTE" no payload de
 * exemplo — ver comentário em `fetchPedidosKaiross`. Por isso os KPIs abaixo
 * evitam qualquer comparação contra um valor de "pago" adivinhado; os
 * valores em R$ somam TODOS os pedidos e são rotulados de forma a deixar
 * isso claro, em vez de fingir que já são "receita confirmada".
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
    const resumoCacheKey = kairoossCacheKey(user.uid, "vendas_resumo");
    const pedidosCacheKey = kairoossCacheKey(user.uid, "vendas_pedidos");

    const [resumo, rawPedidos] = await Promise.all([
      (async () => {
        const cached = await readCachedValue<Awaited<ReturnType<typeof fetchVendasResumo>>>(resumoCacheKey);
        if (cached) return cached;
        const fresh = await fetchVendasResumo(session);
        if (fresh) await writeCachedValue(resumoCacheKey, fresh);
        return fresh;
      })(),
      (async () => {
        const cached = await readCachedValue<KairoossPedidoRaw[]>(pedidosCacheKey);
        if (cached) return cached;
        const fresh = await fetchPedidosKaiross(session);
        if (fresh) {
          await writeCachedValue(pedidosCacheKey, fresh);
          // Fire-and-forget: mantém o índice de rastreio público atualizado
          // sem atrasar a resposta desta tela. Falha de indexação nunca
          // deve impedir o vendedor de ver seus próprios pedidos.
          void upsertPedidosIndex(user.uid, fresh);
        }
        return fresh;
      })(),
    ]);

    const orders = rawPedidos ? rawPedidos.map(mapPedido).sort((a, b) => (a.dataCriacao < b.dataCriacao ? 1 : -1)) : null;

    return NextResponse.json({
      success: true,
      data: { resumo, orders },
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
        error: { code: "pedidos_fetch_failed", message: toSafeApiErrorMessage(error, "Não foi possível buscar seus pedidos agora.") },
      },
      { status: 502 },
    );
  }
}
