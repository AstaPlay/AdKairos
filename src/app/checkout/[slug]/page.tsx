import { notFound } from "next/navigation";

import { findProductByCheckoutSlug, toPublicCheckoutProduct } from "@/lib/checkout-product-index.server";

import { CheckoutClient } from "./_components/checkout-client";

export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const produto = await findProductByCheckoutSlug(slug);

  if (!produto) notFound();

  return <CheckoutClient produto={toPublicCheckoutProduct(produto)} slug={slug} />;
}
