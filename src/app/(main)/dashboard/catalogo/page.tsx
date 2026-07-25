import type { Metadata } from "next";

import { CatalogSection } from "./_components/catalog-section";

export const metadata: Metadata = {
  title: "Catálogo",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Catálogo Kairóss</h2>
        <p className="text-muted-foreground text-sm">
          Conecte sua conta, escolha produtos do catálogo real da Kairóss e afilie ao seu painel de Produtos.
        </p>
      </div>
      <CatalogSection />
    </div>
  );
}
