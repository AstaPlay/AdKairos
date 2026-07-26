import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdminFirestore } from "@/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { mapProductToRow } from "@/lib/map-product-row";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";
import type { Product } from "@/types/product.types";

const PRODUCTS_COLLECTION = "products";

/**
 * GET — catálogo local real do usuário (Firestore, coleção `products`), o
 * mesmo banco em que `afiliar` e `sincronizar` gravam. Antes desta rota, a
 * página Produtos lia um `data.json` estático — nenhuma relação com o que o
 * usuário afilia de fato no Catálogo.
 *
 * Ordenação feita em memória (não via `.orderBy` do Firestore) de propósito:
 * evita depender de índice composto para `ownerId ==` + `orderBy(updatedAt)`
 * e o volume por usuário aqui é pequeno o bastante pra isso ser seguro.
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuthenticatedUser(request);
  } catch (error) {
    return NextResponse.json(
      { success: false, error: { code: "auth_check_failed", message: toSafeApiErrorMessage(error, "Não foi possível validar sua sessão.") } },
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
    const snapshot = await firebaseAdminFirestore
      .collection(PRODUCTS_COLLECTION)
      .where("ownerId", "==", user.uid)
      .get();

    const products = snapshot.docs
      .map((doc) => mapProductToRow(doc.id, doc.data() as Product))
      .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

    return NextResponse.json({
      success: true,
      data: { products, total: products.length },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "products_fetch_failed", message: toSafeApiErrorMessage(error, "Não foi possível buscar seus produtos agora.") },
      },
      { status: 502 },
    );
  }
}
