import "server-only";

import { firebaseAdminFirestore } from "@/firebase/admin";
import type { Product } from "@/types/product.types";

const PRODUCTS_COLLECTION = "products";

/** Recorte interno (server-only) — inclui `ownerId`, necessário para
 * indexar o pedido depois do checkout, mas NUNCA deve ser serializado
 * direto numa resposta HTTP pública (use `toPublic` para isso). */
export interface CheckoutProductInternal {
  id: string;
  ownerId: string;
  name: string;
  images: string[];
  price: number;
  compareAtPrice: number | null;
  stock: number;
  checkoutSlug: string;
  clientePagaFrete: boolean;
  freteCobrado: number;
}

/** Recorte público do produto — o suficiente para renderizar o checkout,
 * nunca expõe custo de aquisição, margem, ownerId ou dados internos. */
export type CheckoutProductPublic = Omit<CheckoutProductInternal, "ownerId">;

function toInternal(product: Product): CheckoutProductInternal {
  const slug = product.kaiross?.checkoutSlug ?? "";
  const cost = product.kaiross?.cost;
  const compareAtPrice = cost && cost > product.price ? cost : null;

  return {
    id: product.id,
    ownerId: product.ownerId,
    name: product.name,
    images: product.images ?? [],
    price: product.price,
    compareAtPrice,
    stock: product.stock,
    checkoutSlug: slug,
    clientePagaFrete: product.clientePagaFrete ?? true,
    freteCobrado: product.freteCobrado ?? 0,
  };
}

export function toPublicCheckoutProduct(product: CheckoutProductInternal): CheckoutProductPublic {
  const { ownerId: _ownerId, ...rest } = product;
  return rest;
}

/**
 * Busca o produto ativo cujo `kaiross.checkoutSlug` bate com o slug da URL
 * pública `/checkout/[slug]`. Só retorna produtos com `status === "active"`
 * — um produto pausado ou esgotado não deve abrir checkout, mesmo que o
 * link antigo ainda circule.
 *
 * Retorna o recorte INTERNO (com `ownerId`) — quem serve isso numa resposta
 * HTTP pública deve passar por `toPublicCheckoutProduct` antes.
 */
export async function findProductByCheckoutSlug(slug: string): Promise<CheckoutProductInternal | null> {
  if (!slug) return null;

  const snapshot = await firebaseAdminFirestore
    .collection(PRODUCTS_COLLECTION)
    .where("kaiross.checkoutSlug", "==", slug)
    .where("status", "==", "active")
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const data = snapshot.docs[0]!.data() as Product;
  return toInternal(data);
}
