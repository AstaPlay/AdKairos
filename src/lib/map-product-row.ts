import "server-only";
import type { Product } from "@/types/product.types";

/**
 * Formato usado pelas telas de Produtos (card, KPIs, sheet de detalhe) —
 * mais "achatado" que o `Product` do Firestore (uma imagem só, custo direto,
 * sem variantes). Mantido aqui (em vez de duplicado no schema.ts) porque a
 * validação zod em produtos-table/schema.ts é a fonte da verdade do shape;
 * este objeto só precisa bater com ela.
 *
 * Campos que o Firestore não guarda hoje (salesCount, salesHistory) são
 * omitidos de propósito — nunca inventamos número de vendas fake aqui. A UI
 * já trata esses campos como opcionais e degrada bem na ausência deles.
 */
export function mapProductToRow(id: string, product: Product) {
  return {
    id,
    name: product.name,
    category: product.category,
    price: product.price,
    stock: product.stock,
    status: product.status,
    source: product.source,
    createdAt: product.createdAt,
    updatedAt: product.updatedAt,
    image: product.images?.[0] ?? null,
    cost: product.kaiross?.cost,
    sku: product.sku,
    brand: product.brand,
    description: product.description,
    tags: product.tags,
    link: product.link,
    freteCobrado: product.freteCobrado,
    custoFrete: product.custoFrete,
    clientePagaFrete: product.clientePagaFrete,
  };
}
