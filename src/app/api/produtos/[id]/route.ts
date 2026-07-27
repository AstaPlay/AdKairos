import { NextResponse, type NextRequest } from "next/server";
import { firebaseAdminFirestore } from "@/firebase/admin";
import { requireAuthenticatedUser } from "@/lib/require-authenticated-user";
import { mapProductToRow } from "@/lib/map-product-row";
import { toSafeApiErrorMessage } from "@/utils/to-safe-api-error-message";
import type { Product, ProductStatus } from "@/types/product.types";

const PRODUCTS_COLLECTION = "products";
const VALID_STATUSES: ProductStatus[] = ["draft", "active", "paused", "out_of_stock"];

interface UpdateBody {
  status?: ProductStatus;
  price?: number;
  tags?: string[];
  freteCobrado?: number;
  custoFrete?: number;
  clientePagaFrete?: boolean;
}

async function loadOwnedProduct(id: string, ownerId: string) {
  const ref = firebaseAdminFirestore.collection(PRODUCTS_COLLECTION).doc(id);
  const snapshot = await ref.get();
  if (!snapshot.exists) return { ref, data: null };
  const data = snapshot.data() as Product;
  if (data.ownerId !== ownerId) return { ref, data: null }; // nunca revela que o doc existe se não for do dono
  return { ref, data };
}

/**
 * PATCH — atualização parcial (status e/ou preço) vinda do card de produto
 * (pausar/ativar) e do sheet de detalhe (ajuste de preço + "Salvar
 * alterações"). Sempre confirma `ownerId` antes de escrever — o id vem do
 * client, então tratamos como não confiável.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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

  const body = (await request.json().catch(() => ({}))) as Partial<UpdateBody>;
  const updates: Partial<Product> = {};

  if (body.status !== undefined) {
    if (!VALID_STATUSES.includes(body.status)) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_status", message: "Status inválido." } },
        { status: 400 },
      );
    }
    updates.status = body.status;
  }
  if (body.price !== undefined) {
    if (typeof body.price !== "number" || !Number.isFinite(body.price) || body.price <= 0) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_price", message: "Preço inválido." } },
        { status: 400 },
      );
    }
    updates.price = body.price;
  }
  if (body.tags !== undefined) {
    if (!Array.isArray(body.tags) || !body.tags.every((tag) => typeof tag === "string")) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_tags", message: "Palavras-chave inválidas." } },
        { status: 400 },
      );
    }
    updates.tags = body.tags.map((tag) => tag.trim()).filter(Boolean);
  }
  if (body.freteCobrado !== undefined) {
    if (typeof body.freteCobrado !== "number" || !Number.isFinite(body.freteCobrado) || body.freteCobrado < 0) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_frete_cobrado", message: "Valor de frete cobrado inválido." } },
        { status: 400 },
      );
    }
    updates.freteCobrado = body.freteCobrado;
  }
  if (body.custoFrete !== undefined) {
    if (typeof body.custoFrete !== "number" || !Number.isFinite(body.custoFrete) || body.custoFrete < 0) {
      return NextResponse.json(
        { success: false, error: { code: "invalid_custo_frete", message: "Custo de frete inválido." } },
        { status: 400 },
      );
    }
    updates.custoFrete = body.custoFrete;
  }
  if (body.clientePagaFrete !== undefined) {
    if (typeof body.clientePagaFrete !== "boolean") {
      return NextResponse.json(
        { success: false, error: { code: "invalid_cliente_paga_frete", message: "Valor inválido para quem paga o frete." } },
        { status: 400 },
      );
    }
    updates.clientePagaFrete = body.clientePagaFrete;
  }
  if (Object.keys(updates).length === 0) {
    return NextResponse.json(
      { success: false, error: { code: "empty_update", message: "Nenhuma alteração enviada." } },
      { status: 400 },
    );
  }

  try {
    const { ref, data } = await loadOwnedProduct(id, user.uid);
    if (!data) {
      return NextResponse.json(
        { success: false, error: { code: "not_found", message: "Produto não encontrado." } },
        { status: 404 },
      );
    }

    updates.updatedAt = new Date().toISOString();
    await ref.update(updates);

    return NextResponse.json({
      success: true,
      data: { product: mapProductToRow(id, { ...data, ...updates }) },
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "update_failed", message: toSafeApiErrorMessage(error, "Não foi possível salvar as alterações agora.") },
      },
      { status: 502 },
    );
  }
}

/**
 * DELETE — remoção manual pelo usuário (menu do card ou sheet de detalhe).
 * Só apaga o documento local; não desafilia nada na Kairóss (isso já é
 * tratado pela rota de sincronização quando o produto some do lado deles).
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

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
    const { ref, data } = await loadOwnedProduct(id, user.uid);
    if (!data) {
      return NextResponse.json(
        { success: false, error: { code: "not_found", message: "Produto não encontrado." } },
        { status: 404 },
      );
    }

    await ref.delete();
    return NextResponse.json({ success: true, data: { id } });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "delete_failed", message: toSafeApiErrorMessage(error, "Não foi possível remover o produto agora.") },
      },
      { status: 502 },
    );
  }
}
