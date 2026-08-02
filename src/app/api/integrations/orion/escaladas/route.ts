import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { fetchOpenHandoffTickets } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Proxy autenticado para a fila de escaladas do Órion. A tela do
 * dashboard nunca fala com o Órion diretamente — sempre por aqui, que
 * troca a sessão Firebase do usuário pelo `externalUserId` (uid) que o
 * Órion entende, e mantém `ORION_SERVICE_API_KEY` só no servidor.
 */
export async function GET(request: NextRequest) {
  let user: DecodedIdToken | null;
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

  try {
    const tickets = await fetchOpenHandoffTickets(user.uid);
    return NextResponse.json({ success: true, tickets });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(
            error,
            "Não foi possível buscar a fila de escaladas agora. Tente novamente em instantes.",
          ),
        },
      },
      { status: 502 },
    );
  }
}
