import type { Metadata } from "next";

import { EscaladasClient } from "./_components/escaladas-client";

export const metadata: Metadata = {
  title: "Escaladas",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Escaladas</h2>
        <p className="text-muted-foreground text-sm">
          Conversas que o assistente automático passou para um atendente humano.
        </p>
      </div>
      <EscaladasClient />
    </div>
  );
}
