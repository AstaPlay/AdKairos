import { Target } from "lucide-react";
import type { Metadata } from "next";

import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

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

      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Target />
          </EmptyMedia>
          <EmptyTitle>Insights de campanhas ainda não conectados</EmptyTitle>
          <EmptyDescription>
            Esta tela vai mostrar os insights de campanhas de anúncios que o Órion coleta, para acompanhar desempenho
            sem sair do painel.
          </EmptyDescription>
        </EmptyHeader>
      </Empty>
    </div>
  );
}
