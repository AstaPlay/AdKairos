import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { disconnectInstagramConnection, getInstagramConnectionStatus } from "@/lib/orion-client.server";
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

export async function GET(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const status = await getInstagramConnectionStatus(auth.user.uid);
    return NextResponse.json({ success: true, status });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível buscar o status da conexão com Instagram agora."),
        },
      },
      { status: 502 },
    );
  }
}

export async function DELETE(request: NextRequest) {
  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    await disconnectInstagramConnection(auth.user.uid);
    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "orion_request_failed",
          message: toSafeApiErrorMessage(error, "Não foi possível desconectar o Instagram agora."),
        },
      },
      { status: 502 },
    );
  }
}
