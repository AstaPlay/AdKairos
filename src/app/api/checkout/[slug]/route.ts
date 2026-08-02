import { type NextRequest, NextResponse } from "next/server";

import { findProductByCheckoutSlug, toPublicCheckoutProduct } from "@/lib/checkout-product-index.server";
import { checkRateLimit } from "@/lib/rate-limit.server";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

function getClientIp(request: NextRequest): string {
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) return forwardedFor.split(",")[0]?.trim();
  return request.headers.get("x-real-ip") ?? "unknown";
}

/**
 * GET público (sem autenticação) — dados do produto para renderizar o
 * checkout com marca própria em `/checkout/[slug]`. Retorna só o recorte
 * público (`CheckoutProductPublic`): nunca custo de aquisição, margem ou
 * `ownerId`.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ip = getClientIp(request);

  const rateLimit = await checkRateLimit(`checkout_produto__${ip}`, { limit: 60, windowMs: 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { success: false, error: { code: "rate_limited", message: "Muitas requisições. Aguarde um instante." } },
      { status: 429 },
    );
  }

  try {
    const produto = await findProductByCheckoutSlug(slug);
    if (!produto) {
      return NextResponse.json(
        { success: false, error: { code: "not_found", message: "Este link de checkout não está disponível." } },
        { status: 404 },
      );
    }
    return NextResponse.json({ success: true, data: toPublicCheckoutProduct(produto) });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "internal_error",
          message: toSafeApiErrorMessage(error, "Não foi possível carregar o checkout agora."),
        },
      },
      { status: 500 },
    );
  }
}
