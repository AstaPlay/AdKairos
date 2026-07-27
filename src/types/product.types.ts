export type ProductStatus = "draft" | "active" | "paused" | "out_of_stock";

export type ProductSource = "manual" | "kaiross";

export interface ProductVariant {
  id: string;
  label: string;
  sku?: string;
  priceDelta?: number;
  stock?: number;
}

/** Rastreamento de origem quando o produto veio de uma afiliação da Kairóss. */
export interface ProductKairoossOrigin {
  productId: string;
  sellerProductId?: string;
  checkoutSlug?: string;
  /** Custo de aquisição informado pela Kairóss — referência para cálculo de margem. */
  cost: number;
}

export interface Product {
  id: string;
  ownerId: string;
  name: string;
  description: string;
  category: string;
  tags: string[];
  price: number;
  stock: number;
  status: ProductStatus;
  images: string[];
  link?: string;
  sku?: string;
  brand?: string;
  variants: ProductVariant[];
  source: ProductSource;
  kaiross?: ProductKairoossOrigin;
  /** Valor cobrado do cliente pelo frete, quando ele assume esse custo. */
  freteCobrado?: number;
  /** Custo real do frete pago pelo vendedor (ex: quando ele assume o envio). */
  custoFrete?: number;
  /** true = cliente paga o frete no checkout; false = vendedor assume o custo. */
  clientePagaFrete?: boolean;
  createdAt: string;
  updatedAt: string;
}
