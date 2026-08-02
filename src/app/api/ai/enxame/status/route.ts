import { type NextRequest, NextResponse } from "next/server";

import { getEnxameHealth, getEnxamePoolStats, getEnxameUsage, isEnxameConfigured } from "@/lib/enxame-client";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * GET — status agregado do Enxame para a tela "Central de IA": saúde do
 * serviço, estatísticas do pool de chaves e uso recente (24h). Uma única
 * rota para evitar 3 round-trips separados do client — todas as chamadas
 * reais ao Enxame acontecem aqui, server-side, com a ENXAME_API_KEY nunca
 * exposta ao navegador.
 */
export async function GET(request: NextRequest) {
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

  if (!isEnxameConfigured()) {
    return NextResponse.json({
      success: true,
      data: { configured: false, health: null, pool: null, usage: null },
    });
  }

  const [health, pool, usage] = await Promise.all([getEnxameHealth(), getEnxamePoolStats(), getEnxameUsage(24)]);

  return NextResponse.json({
    success: true,
    data: {
      configured: true,
      health,
      pool: pool.ok ? pool.data : null,
      poolError: pool.ok ? null : pool.error,
      usage: usage.ok ? usage.data : null,
      usageError: usage.ok ? null : usage.error,
    },
  });
}
