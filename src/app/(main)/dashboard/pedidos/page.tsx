import type { Metadata } from "next";

import { PedidosClient } from "./_components/pedidos-client";

export const metadata: Metadata = {
  title: "Pedidos",
};

export default function Page() {
  return <PedidosClient />;
}
