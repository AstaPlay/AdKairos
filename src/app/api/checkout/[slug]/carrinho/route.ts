import { type NextRequest, NextResponse } from "next/server";

import { z } from "zod";

import { findProductByCheckoutSlug } from "@/lib/checkout-product-index.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { criarCarrinhoKaiross } from "@/services/kaiross-checkout.service";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

const carrinhoSchema = z.object({
  quantidade: z.number().int().min(1).max(9),
  nome: z.string().trim().min(3).max(120),
  email: z.string().trim().email(),
  documento: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length === 11 || value.length === 14, "Documento inválido."),
  telefone: z
    .string()
    .trim()
    .transform((value) => value.replace(/\D/g, ""))
    .refine((value) => value.length >= 10 && value.length <= 11, "Telefone inválido."),
});

/**
 * POST público — passo 1 do checkout real: reserva o carrinho na Kairóss
 * (`POST pay.kaiross.com.br/backend/vendas/carrinhos`) e devolve o
 * `sessionToken` que o client vai precisar nos passos seguintes
 * (tokenização do cartão e confirmação do pedido).
 *
 * Fica no servidor (não é chamado direto do navegador do comprador) para
 * não expor a URL real da Kairóss nem depender de CORS liberado por eles
 * para esse domínio.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = getClientIp(request);

  const rateLimit = await checkRateLimit(`checkout_carrinho__${ip}`, { limit: 20, windowMs: 5 * 60 * 1000 });
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
  const parsed = carrinhoSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_input", message: "Confira os dados de contato informados." } },
      { status: 400 },
    );
  }

  try {
    const resultado = await criarCarrinhoKaiross({
      slugCheckout: produto.checkoutSlug,
      ...parsed.data,
    });
    return NextResponse.json({ success: true, data: resultado });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "kaiross_error",
          message: toSafeApiErrorMessage(error, "Não foi possível reservar seu pedido agora. Tente novamente."),
        },
      },
      { status: 502 },
    );
  }
}
