import { type NextRequest, NextResponse } from "next/server";

import type { DecodedIdToken } from "firebase-admin/auth";

import { findProductIdByExternalId } from "@/lib/orion-client.server";
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

/** Resolve o productId (UUID Supabase/Órion) a partir do id do documento Firestore do produto no AdKairos. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ externalId: string }> }) {
  const { externalId } = await params;

  const auth = await authenticate(request);
  if ("errorResponse" in auth) return auth.errorResponse;

  try {
    const productId = await findProductIdByExternalId(auth.user.uid, externalId);
    return NextResponse.json({ success: true, productId });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: {
          code: "product_not_synced",
          message: toSafeApiErrorMessage(error, "Este produto ainda não foi sincronizado com o Órion."),
        },
      },
      { status: 502 },
    );
  }
}
