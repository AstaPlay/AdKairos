import type { Metadata } from "next";

import { SuperCerebroClient } from "./_components/super-cerebro-client";

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

      <SuperCerebroClient />
    </div>
  );
}
