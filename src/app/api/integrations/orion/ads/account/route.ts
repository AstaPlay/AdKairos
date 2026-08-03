import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { configureAdAccount } from "@/lib/orion-client.server";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";

async function authenticate(request: NextRequest): Promise<{ user: DecodedIdToken } | { errorResponse: NextResponse }> {
  let user: DecodedIdToken | null;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return {
      errorResponse: NextResponse.json(
        {
          success: false,
          error: {
            code: "auth_check_failed",
            message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão."),
          },
        },
        { status: 500 },
      ),
    };
  }
  if (!user) {
    return {
      errorResponse: NextResponse.json(
        { success: false, error: { code: "unauthenticated", message: "Sessão inválida." } },
        { status: 401 },
      ),
    };
  }
  return { user };
}

/**
 * Configura o Ad Account (formato "act_<id>") do dono autenticado.
 * Validação de shape é feita no Órion (Zod); aqui só garante corpo
 * JSON válido.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: { adAccountId?: string };
  try {
    body = (await request.json()) as { adAccountId?: string };
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  if (!body.adAccountId) {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "adAccountId é obrigatório." } },
      { status: 400 },
    );
  }

  try {
    const result = await configureAdAccount(auth.user.uid, body.adAccountId);
    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível salvar a conta de anúncios agora."),
        },
      },
      { status: 502 },
    );
  }
}
