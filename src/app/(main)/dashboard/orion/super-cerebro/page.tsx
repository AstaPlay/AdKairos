import { FileText, LineChart, Sparkles, Wand2 } from "lucide-react";
import type { Metadata } from "next";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Órion · Super Cérebro",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Super Cérebro</h1>
        <p className="text-muted-foreground text-sm">
          Diagnóstico estratégico e geração de conteúdo com IA a partir dos dados do Órion.
        </p>
      </div>

      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Sparkles />
          </EmptyMedia>
          <EmptyTitle>Super Cérebro ainda não conectado</EmptyTitle>
          <EmptyDescription>
            Esta tela vai reunir os recursos de IA do Órion: diagnóstico estratégico do negócio, análise de desempenho
            do Instagram e dos Ads, e geração de conteúdo e roteiros para redes sociais.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <LineChart className="size-3.5" />
              Diagnóstico estratégico
            </span>
            <span className="flex items-center gap-1.5">
              <Wand2 className="size-3.5" />
              Análise de performance
            </span>
            <span className="flex items-center gap-1.5">
              <FileText className="size-3.5" />
              Conteúdo &amp; roteiros
            </span>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
