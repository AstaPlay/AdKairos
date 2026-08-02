import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Rastrear pedido",
  description: "Acompanhe o status e o rastreio da sua compra.",
};

export default function RastreioLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-svh bg-background">{children}</div>;
}
