import type { Metadata } from "next";

import { AdsClient } from "./_components/ads-client";

export const metadata: Metadata = {
  title: "Órion · Ads",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Ads</h1>
        <p className="text-muted-foreground text-sm">Desempenho das campanhas de anúncios monitoradas pelo Órion.</p>
      </div>

      <AdsClient />
    </div>
  );
}
