import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getWhatsAppSession } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * GET do status de uma sessão (+ QR/pairing code, se válidos). Alvo do
 * polling da tela enquanto a sessão está em PENDING_QR/CONNECTING.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: sessionId } = await params;

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
    const session = await getWhatsAppSession(user.uid, sessionId);
    return NextResponse.json({ success: true, session });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar o status da sessão agora."),
        },
      },
      { status: 502 },
    );
  }
}
