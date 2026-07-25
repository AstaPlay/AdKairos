import type { Metadata } from "next";

import { KpiCards } from "./_components/kpi-cards";
import { ProductsSection } from "./_components/products-section";

export const metadata: Metadata = {
  title: "Produtos",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <KpiCards />
      <ProductsSection />
    </div>
  );
}
