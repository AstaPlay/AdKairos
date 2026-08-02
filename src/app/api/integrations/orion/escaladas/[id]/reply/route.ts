import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { replyToHandoffTicket } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

interface ReplyBody {
  text?: unknown;
}

/**
 * Proxy autenticado para responder a um ticket de escalada aberto no
 * Órion. Mesmo padrão de `../route.ts` (GET): a tela nunca fala com o
 * Órion diretamente, e `ORION_SERVICE_API_KEY` continua só no
 * servidor. `params.id` é o id do ticket, não do owner.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id: ticketId } = await params;

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

  let body: ReplyBody;
  try {
    body = (await request.json()) as ReplyBody;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  if (typeof body.text !== "string" || body.text.trim().length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "validation_error", message: "O texto da resposta é obrigatório." } },
      { status: 400 },
    );
  }

  try {
    await replyToHandoffTicket(user.uid, ticketId, body.text.trim());
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(
            error,
            "Não foi possível enviar a resposta agora. Tente novamente em instantes.",
          ),
        },
      },
      { status: 502 },
    );
  }
}
