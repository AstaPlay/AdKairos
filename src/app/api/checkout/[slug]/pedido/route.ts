import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { findProductByCheckoutSlug } from "@/lib/checkout-product-index.server";
import { upsertPedidosIndex } from "@/lib/pedido-tracking-index.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { processarCheckoutKaiross } from "@/services/kaiross-checkout.service";
import type { KairoossPedidoRaw } from "@/services/kaiross-integration.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const clienteSchema = z.object({
  nome: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  documento: z.string().trim().transform((value) => value.replace(/\D/g, "")),
  telefone: z.string().trim().transform((value) => value.replace(/\D/g, "")),
  cep: z.string().trim().transform((value) => value.replace(/\D/g, "")),
  endereco: z.string().trim().min(1).max(160),
  numero: z.string().trim().min(1).max(20),
  bairro: z.string().trim().min(1).max(80),
  complemento: z.string().trim().max(80).nullable().default(null),
  cidade: z.string().trim().min(1).max(80),
  uf: z.string().trim().length(2),
});

const checkoutSchema = z.object({
  sessionToken: z.string().trim().min(10),
  quantidade: z.number().int().min(1).max(9),
  cliente: clienteSchema,
  formaPagamento: z.enum(["CREDITO", "PIX"]),
  parcelas: z.number().int().min(1).max(12),
  // Nunca chega número/CVV de cartão aqui — só o token gerado no client
  // pela tokenização direta com o Pagar.me (ver checkout-client.tsx).
  cartaoToken: z.string().trim().min(5).nullable(),
});

/**
 * POST público — passo 3 (final) do checkout real: confirma o pedido e
 * processa o pagamento na Kairóss (`POST
 * pay.kaiross.com.br/backend/vendas/checkout`). Recebe só o `cartaoToken`
 * (nunca número de cartão) — a tokenização acontece no navegador do
 * comprador, direto com o Pagar.me, antes desta chamada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = getClientIp(request);

  const rateLimit = await checkRateLimit(`checkout_pedido__${ip}`, { limit: 10, windowMs: 5 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: { code: "rate_limited", message: "Muitas tentativas. Aguarde alguns minutos." } },
      { status: 429 },
    );
  }

  const produto = await findProductByCheckoutSlug(slug);
  if (!produto) {
    return NextResponse.json(
      { success: false, error: { code: "not_found", message: "Este link de checkout não está disponível." } },
      { status: 404 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = checkoutSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_input", message: "Confira os dados informados antes de continuar." } },
      { status: 400 },
    );
  }

  if (parsed.data.formaPagamento === "CREDITO" && !parsed.data.cartaoToken) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_input", message: "Dados do cartão não foram processados corretamente." } },
      { status: 400 },
    );
  }

  const valorFrete = produto.clientePagaFrete ? produto.freteCobrado : 0;

  try {
    const resultado = await processarCheckoutKaiross({
      slugCheckout: produto.checkoutSlug,
      sessionToken: parsed.data.sessionToken,
      compradorEmail: parsed.data.cliente.email,
      quantidade: parsed.data.quantidade,
      cliente: { ...parsed.data.cliente, pais: "BR" },
      formaPagamento: parsed.data.formaPagamento,
      parcelas: parsed.data.parcelas,
      cartaoToken: parsed.data.cartaoToken,
      valorFrete,
      vendedorAssumeFrete: !produto.clientePagaFrete,
    });

    if (resultado.status === "recusado") {
      return NextResponse.json(
        { success: false, error: { code: "payment_declined", message: resultado.mensagem ?? "Pagamento não aprovado." } },
        { status: 402 },
      );
    }

    // Indexa no mesmo índice usado pelo rastreio público (`/rastreio`), para
    // que o comprador consiga acompanhar este pedido pelo CPF depois — sem
    // isso, um pedido feito por este checkout ficaria invisível na busca
    // pública até o vendedor abrir o painel de pedidos pelo menos uma vez.
    // Best-effort: nunca deve derrubar a resposta de sucesso ao comprador.
    if (resultado.numeroPedido) {
      const pedidoRaw: KairoossPedidoRaw = {
        id: resultado.numeroPedido,
        vendedorId: produto.ownerId,
        clienteNome: parsed.data.cliente.nome,
        quantidadeTotal: parsed.data.quantidade,
        valorBruto: produto.price * parsed.data.quantidade + valorFrete,
        valorLiquidoVendedor: produto.price * parsed.data.quantidade,
        valorFrete,
        vendedorAssumeFrete: !produto.clientePagaFrete,
        statusPagamento: resultado.status === "aprovado" ? "PAGO" : "PENDENTE",
        formaPagamento: parsed.data.formaPagamento,
        itens: [
          {
            id: produto.id,
            produtoId: produto.id,
            produtoNome: produto.name,
            imagemPrincipalUrl: produto.images[0] ?? null,
            quantidade: parsed.data.quantidade,
            valorUnitario: produto.price,
            valorTotal: produto.price * parsed.data.quantidade,
          },
        ],
        numeroPedido: resultado.numeroPedido,
        codigoRastreio: null,
        statusFornecedor: null,
        dataCriacao: new Date().toISOString(),
        dataPagamento: resultado.status === "aprovado" ? new Date().toISOString() : null,
        dataEnvio: null,
        clienteContato: {
          email: parsed.data.cliente.email,
          telefone: parsed.data.cliente.telefone,
          documento: parsed.data.cliente.documento,
          cep: parsed.data.cliente.cep,
          endereco: parsed.data.cliente.endereco,
          numero: parsed.data.cliente.numero,
          bairro: parsed.data.cliente.bairro,
          complemento: parsed.data.cliente.complemento ?? undefined,
          cidade: parsed.data.cliente.cidade,
          uf: parsed.data.cliente.uf,
        },
      };
      await upsertPedidosIndex(produto.ownerId, [pedidoRaw]);
    }

    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "kaiross_error",
          message: toSafeApiErrorMessage(error, "Não foi possível processar o pagamento agora. Tente novamente."),
        },
      },
      { status: 502 },
    );
  }
}
