import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Checkout seguro",
  description: "Finalize sua compra com pagamento protegido.",
};

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
  return <div className="bg-background min-h-svh">{children}</div>;
}
