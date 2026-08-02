import { type NextRequest, NextResponse } from "next/server";

import { getKairoossSession, kairoossCacheKey, readCachedValue, writeCachedValue } from "@/lib/kaiross-proxy.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { fetchPedidosKaiross, type KairoossPedidoRaw } from "@/services/kaiross-integration.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Formato completo de UM pedido para a tela de detalhe — ao contrário da
 * lista (`kaiross/pedidos/route.ts`), aqui expomos os dados de contato do
 * comprador (`clienteContato`), porque:
 * 1. Quem acessa é o próprio vendedor autenticado, vendo um pedido que é dele;
 * 2. É o mesmo dado que a Kairóss já mostra pro vendedor na própria plataforma;
 * 3. Sem isso não dá pra vender este pedido pro cliente por telefone/WhatsApp,
 *    nem sustentar a página de cliente (histórico) ou o rastreio público.
 * Ainda assim omitimos `vendedorId`/`fornecedorId`/`clienteId` (IDs internos
 * da Kairóss sem uso nesta tela) e nunca expomos isso em rota pública.
 */
function mapPedidoDetalhado(raw: KairoossPedidoRaw) {
  return {
    id: raw.id,
    numeroPedido: raw.numeroPedido,
    dataCriacao: raw.dataCriacao,
    dataPagamento: raw.dataPagamento ?? null,
    dataEnvio: raw.dataEnvio ?? null,
    cliente: {
      nome: raw.clienteNome,
      email: raw.clienteContato?.email ?? null,
      telefone: raw.clienteContato?.telefone ?? null,
      documento: raw.clienteContato?.documento ?? null,
      endereco: raw.clienteContato
        ? {
            cep: raw.clienteContato.cep ?? null,
            logradouro: raw.clienteContato.endereco ?? null,
            numero: raw.clienteContato.numero ?? null,
            bairro: raw.clienteContato.bairro ?? null,
            complemento: raw.clienteContato.complemento ?? null,
            cidade: raw.clienteContato.cidade ?? null,
            uf: raw.clienteContato.uf ?? null,
          }
        : null,
    },
    pagamento: {
      forma: raw.formaPagamento ?? null,
      status: raw.statusPagamento,
      dataPagamento: raw.dataPagamento ?? null,
    },
    fornecedor: {
      nome: raw.fornecedor ?? null,
      status: raw.statusFornecedor ?? null,
      integrado: raw.integrado ?? null,
    },
    envio: {
      codigoRastreio: raw.codigoRastreio ?? null,
      dataEnvio: raw.dataEnvio ?? null,
    },
    itens: raw.itens.map((item) => ({
      id: item.id,
      produtoId: item.produtoId ?? null,
      nome: item.produtoNome,
      codigo: item.produtoCodigo ?? null,
      imagem: item.imagemPrincipalUrl ?? null,
      quantidade: item.quantidade,
      valorUnitario: item.valorUnitario,
      valorTotal: item.valorTotal,
    })),
    valores: {
      quantidadeTotal: raw.quantidadeTotal,
      bruto: raw.valorBruto,
      liquidoVendedor: raw.valorLiquidoVendedor,
      imposto: raw.valorImposto ?? null,
      taxa: raw.valorTaxa ?? null,
      frete: raw.valorFrete ?? null,
      vendedorAssumeFrete: raw.vendedorAssumeFrete ?? false,
      custoFornecedor: raw.custoFornecedorTotal ?? null,
    },
  };
}

export type PedidoDetalhado = ReturnType<typeof mapPedidoDetalhado>;

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
      { success: false, error: { code: "kaiross_not_connected", message: "Conta Kairóss não conectada." } },
      { status: 409 },
    );
  }

  try {
    // Reaproveita o mesmo cache que a lista de pedidos já preenche — evita
    // uma segunda chamada de rede à Kairóss só para abrir um detalhe que
    // acabou de ser listado.
    const pedidosCacheKey = kairoossCacheKey(user.uid, "vendas_pedidos");
    let rawPedidos = await readCachedValue<KairoossPedidoRaw[]>(pedidosCacheKey);
    if (!rawPedidos) {
      rawPedidos = await fetchPedidosKaiross(session);
      if (rawPedidos) await writeCachedValue(pedidosCacheKey, rawPedidos);
    }

    if (!rawPedidos) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "pedidos_fetch_failed", message: "Não foi possível buscar seus pedidos agora." },
        },
        { status: 502 },
      );
    }

    const found = rawPedidos.find((pedido) => pedido.id === id || pedido.numeroPedido === id);
    if (!found) {
      return NextResponse.json(
        { success: false, error: { code: "not_found", message: "Pedido não encontrado." } },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, data: mapPedidoDetalhado(found) });
  } catch (error) {
    const status = (error as { status?: number })?.status;
    if (status === 401) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "kaiross_session_expired", message: "Sessão Kairóss expirada. Conecte novamente." },
        },
        { status: 401 },
      );
    }
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "pedido_fetch_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar este pedido agora."),
        },
      },
      { status: 502 },
    );
  }
}
