import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { createWhatsAppSession, listWhatsAppSessions } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Proxy autenticado para sessões WhatsApp do Órion. Mesmo padrão de
 * `../escaladas/route.ts`: a tela nunca fala com o Órion diretamente,
 * a sessão Firebase vira `externalUserId` (uid) e as credenciais de
 * serviço do Órion continuam só no servidor.
 */
async function authenticate(request: NextRequest): Promise<DecodedIdToken | NextResponse> {
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
  return user;
}

export async function GET(request: NextRequest) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;

  try {
    const sessions = await listWhatsAppSessions(user.uid);
    return NextResponse.json({ success: true, sessions });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar as sessões do WhatsApp agora."),
        },
      },
      { status: 502 },
    );
  }
}

export async function POST(request: NextRequest) {
  const user = await authenticate(request);
  if (user instanceof NextResponse) return user;

  try {
    const session = await createWhatsAppSession(user.uid);
    return NextResponse.json({ success: true, session }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível criar a sessão do WhatsApp agora."),
        },
      },
      { status: 502 },
    );
  }
}
