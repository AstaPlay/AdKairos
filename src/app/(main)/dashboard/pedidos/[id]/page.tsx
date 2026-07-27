import type { Metadata } from "next";

import { PedidoDetailClient } from "./_components/pedido-detail-client";

export const metadata: Metadata = {
  title: "Detalhe do pedido",
};

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PedidoDetailClient pedidoId={id} />;
}
