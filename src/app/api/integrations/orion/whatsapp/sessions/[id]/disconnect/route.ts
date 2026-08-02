import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { disconnectWhatsAppSession } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Pede logout intencional da sessão (não exclui do banco — fica pronta
 * para reconectar com novo QR/pairing code).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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
    await disconnectWhatsAppSession(user.uid, sessionId);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível desconectar a sessão agora."),
        },
      },
      { status: 502 },
    );
  }
}
