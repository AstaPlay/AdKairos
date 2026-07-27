import { NextResponse, type NextRequest } from "next/server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { getKairoossSession, readCachedValue, writeCachedValue, kairoossCacheKey } from "@/lib/kaiross-proxy.server";
import { fetchPedidosKaiross, type KairoossPedidoRaw } from "@/services/kaiross-integration.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Página de cliente (histórico de pedidos de UM comprador dentro da base
 * do vendedor logado) — identificado pelo documento (CPF) na URL. Não
 * existe conceito de "cliente" persistente na Kairóss/AdKairos hoje, então
 * construímos isso agregando, em memória, todos os pedidos do vendedor que
 * batem com o mesmo CPF — 100% dado real, sem tabela nova de clientes.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ documento: string }> }) {
  const { documento } = await params;
  const documentoDigits = decodeURIComponent(documento).replace(/\D/g, "");

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
    return NextResponse.json({ success: false, error: { code: "unauthenticated", message: "Sessão inválida." } }, { status: 401 });
  }

  const session = await getKairoossSession(user.uid);
  if (!session) {
    return NextResponse.json(
      { success: false, error: { code: "kaiross_not_connected", message: "Conta Kairóss não conectada." } },
      { status: 409 },
    );
  }

  try {
    const pedidosCacheKey = kairoossCacheKey(user.uid, "vendas_pedidos");
    let rawPedidos = await readCachedValue<KairoossPedidoRaw[]>(pedidosCacheKey);
    if (!rawPedidos) {
      rawPedidos = await fetchPedidosKaiross(session);
      if (rawPedidos) await writeCachedValue(pedidosCacheKey, rawPedidos);
    }
    if (!rawPedidos) {
      return NextResponse.json(
        { success: false, error: { code: "pedidos_fetch_failed", message: "Não foi possível buscar seus pedidos agora." } },
        { status: 502 },
      );
    }

    const pedidosDoCliente = rawPedidos.filter(
      (pedido) => pedido.clienteContato?.documento?.replace(/\D/g, "") === documentoDigits,
    );

    if (pedidosDoCliente.length === 0) {
      return NextResponse.json({ success: false, error: { code: "not_found", message: "Cliente não encontrado." } }, { status: 404 });
    }

    const primeiro = pedidosDoCliente[0]!;
    const totalGasto = pedidosDoCliente.reduce((acc, pedido) => acc + pedido.valorBruto, 0);
    const pedidosPagos = pedidosDoCliente.filter((pedido) => pedido.statusPagamento?.toUpperCase() !== "PENDENTE").length;

    return NextResponse.json({
      success: true,
      data: {
        nome: primeiro.clienteNome,
        email: primeiro.clienteContato?.email ?? null,
        telefone: primeiro.clienteContato?.telefone ?? null,
        documento: primeiro.clienteContato?.documento ?? null,
        endereco: primeiro.clienteContato
          ? {
              cep: primeiro.clienteContato.cep ?? null,
              logradouro: primeiro.clienteContato.endereco ?? null,
              numero: primeiro.clienteContato.numero ?? null,
              bairro: primeiro.clienteContato.bairro ?? null,
              cidade: primeiro.clienteContato.cidade ?? null,
              uf: primeiro.clienteContato.uf ?? null,
            }
          : null,
        resumo: {
          totalPedidos: pedidosDoCliente.length,
          pedidosPagos,
          totalGasto,
          primeiraCompra: pedidosDoCliente.map((pedido) => pedido.dataCriacao).sort()[0]!,
        },
        pedidos: pedidosDoCliente
          .map((pedido) => ({
            id: pedido.id,
            numeroPedido: pedido.numeroPedido,
            dataCriacao: pedido.dataCriacao,
            statusPagamento: pedido.statusPagamento,
            statusFornecedor: pedido.statusFornecedor ?? null,
            valorBruto: pedido.valorBruto,
            itens: pedido.itens.map((item) => item.produtoNome),
          }))
          .sort((a, b) => (a.dataCriacao < b.dataCriacao ? 1 : -1)),
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
      { success: false, error: { code: "cliente_fetch_failed", message: toSafeApiErrorMessage(error, "Não foi possível buscar este cliente agora.") } },
      { status: 502 },
    );
  }
}
