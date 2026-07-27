import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";
import { findPedidosByDocumento } from "@/lib/pedido-tracking-index.server";
import { checkRateLimit } from "@/lib/rate-limit.server";

/**
 * Rota PÚBLICA (sem autenticação) de rastreio de pedido para o cliente
 * final — réplica do fluxo já existente na Kairóss (confirmado via captura
 * real de `GET https://app.kaiross.com.br/rastreio`: CPF obrigatório + nº do
 * pedido opcional). Como é pública, nunca expõe dados sensíveis além do
 * necessário para o cliente acompanhar a própria compra: sem endereço
 * completo, sem e-mail, sem nome completo do comprador (só as iniciais do
 * sobrenome), sem valores financeiros de margem/custo do vendedor.
 *
 * Consulta o índice próprio do AdKairos (`pedidos_tracking_index`), não um
 * endpoint da Kairóss — ver decisão registrada em conversa: o endpoint real
 * de rastreio da Kairóss nunca foi confirmado (só a página HTML pública),
 * então depender dele seria fingir uma integração que pode não existir.
 */
const rastreioSchema = z.object({
  cpf: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 11, "CPF inválido.")
    .optional(),
  telefone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length >= 10 && value.length <= 11, "Telefone inválido.")
    .optional(),
  numeroPedido: z.string().trim().min(1).max(32).optional(),
});

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]!.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

export async function POST(request: NextRequest) {
  const ip = getClientIp(request);

  // Janela apertada para conter tentativas de força bruta de CPF a partir
  // de um único IP, sem travar um cliente legítimo que erra a digitação
  // algumas vezes seguidas.
  const rateLimit = await checkRateLimit(`rastreio_publico__${ip}`, { limit: 8, windowMs: 5 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "rate_limited",
          message: "Muitas tentativas. Aguarde alguns minutos antes de tentar novamente.",
        },
      },
      { status: 429 },
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = rastreioSchema.safeParse(body);
  if (!parsed.success || (!parsed.data.cpf && !parsed.data.telefone)) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_input", message: "Informe um CPF ou telefone válido." } },
      { status: 400 },
    );
  }

  const encontrados = await findPedidosByDocumento(parsed.data);

  // Resposta idêntica em formato para "não encontrado" e "encontrado vazio"
  // — não confirma nem nega a existência de cadastro para aquele
  // CPF/telefone além do necessário, e nunca lança erro 404 que poderia
  // ajudar alguém a enumerar documentos válidos por tentativa e erro.
  return NextResponse.json({
    success: true,
    data: encontrados.map((pedido) => ({
      numeroPedido: pedido.numeroPedido,
      clienteNomeParcial: pedido.clienteNomeParcial,
      statusPagamento: pedido.statusPagamento,
      statusFornecedor: pedido.statusFornecedor,
      codigoRastreio: pedido.codigoRastreio,
      dataCriacao: pedido.dataCriacao,
      dataEnvio: pedido.dataEnvio,
      itensResumo: pedido.itensResumo,
      atualizadoEm: pedido.updatedAt,
    })),
  });
}
