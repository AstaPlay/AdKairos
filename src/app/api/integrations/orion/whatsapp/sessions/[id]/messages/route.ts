import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { listSentMessages, sendWhatsAppMessage } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

/**
 * Histórico de envios de uma sessão. Mesmo padrão de proxy dos demais
 * endpoints de sessão — a tela nunca fala com o Órion diretamente.
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
    const messages = await listSentMessages(user.uid, sessionId);
    return NextResponse.json({ success: true, messages });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar o histórico de mensagens agora."),
        },
      },
      { status: 502 },
    );
  }
}

/**
 * Envia uma mensagem de texto pela sessão. Mesmo padrão de proxy —
 * nunca expõe ORION_SERVICE_API_KEY nem o Bearer token ao client.
 * V1: só `type: "text"` (ver `sendWhatsAppMessage`).
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  const { toJid, content } = (body ?? {}) as { toJid?: unknown; content?: unknown };
  if (
    typeof toJid !== "string" ||
    toJid.trim().length === 0 ||
    typeof content !== "string" ||
    content.trim().length === 0
  ) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "toJid e content são obrigatórios." } },
      { status: 400 },
    );
  }

  try {
    await sendWhatsAppMessage(user.uid, sessionId, toJid, content);
    return NextResponse.json({ success: true }, { status: 202 });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível enviar a mensagem agora."),
        },
      },
      { status: 502 },
    );
  }
}
