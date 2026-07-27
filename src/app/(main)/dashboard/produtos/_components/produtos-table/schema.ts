import z from "zod";

export const productStatusValues = ["draft", "active", "paused", "out_of_stock"] as const;
export const productSourceValues = ["manual", "kaiross"] as const;

const productSchema = z.object({
  id: z.string(),
  name: z.string(),
  category: z.string(),
  price: z.number(),
  stock: z.number(),
  status: z.enum(productStatusValues),
  source: z.enum(productSourceValues),
  createdAt: z.string(),
  image: z.string().nullable().optional(),
  cost: z.number().optional(),
  sku: z.string().optional(),
  brand: z.string().optional(),
  description: z.string().optional(),
  tags: z.array(z.string()).optional(),
  salesCount: z.number().optional(),
  salesHistory: z.array(z.number()).optional(),
  link: z.string().optional(),
  freteCobrado: z.number().optional(),
  custoFrete: z.number().optional(),
  clientePagaFrete: z.boolean().optional(),
});

export const productsSchema = z.array(productSchema);

export type ProductRow = z.infer<typeof productSchema>;
export type ProductStatus = (typeof productStatusValues)[number];
export type ProductSource = (typeof productSourceValues)[number];
