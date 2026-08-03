import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { getBotConfig, type UpdateBotConfigInput, updateBotConfig } from "@/lib/orion-client.server";
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

/** Config do bot de atendimento do dono autenticado. Devolve defaults se ainda não configurado. */
export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const config = await getBotConfig(auth.user.uid);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar a configuração do bot agora."),
        },
      },
      { status: 502 },
    );
  }
}

/**
 * Substitui a configuração inteira (upsert). Validação de shape/limites
 * é feita no Órion (Zod) — aqui só garante que o corpo é JSON válido,
 * sem duplicar as regras de negócio nesta borda.
 */
export async function PUT(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  let body: UpdateBotConfigInput;
  try {
    body = (await request.json()) as UpdateBotConfigInput;
  } catch {
    return NextResponse.json(
      { success: false, error: { code: "invalid_body", message: "Corpo da requisição inválido." } },
      { status: 400 },
    );
  }

  try {
    const config = await updateBotConfig(auth.user.uid, body);
    return NextResponse.json({ success: true, config });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível salvar a configuração do bot agora."),
        },
      },
      { status: 502 },
    );
  }
}
