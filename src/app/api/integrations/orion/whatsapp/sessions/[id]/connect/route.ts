import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { connectWhatsAppSession } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

interface ConnectBody {
  phoneNumber?: unknown;
}

/**
 * Dispara a conexão da sessão. Sem `phoneNumber` no corpo: gera QR
 * code. Com `phoneNumber`: gera pairing code em vez de QR.
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

  let body: ConnectBody = {};
  try {
    const raw = await request.text();
    if (raw.trim().length > 0) body = JSON.parse(raw) as ConnectBody;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  if (
    body.phoneNumber !== undefined &&
    (typeof body.phoneNumber !== "string" || body.phoneNumber.trim().length === 0)
  ) {
    return NextResponse.json(
      { success: false, error: { code: "validation_error", message: "Telefone inválido." } },
      { status: 400 },
    );
  }

  try {
    await connectWhatsAppSession(user.uid, sessionId, body.phoneNumber as string | undefined);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível conectar a sessão agora."),
        },
      },
      { status: 502 },
    );
  }
}
