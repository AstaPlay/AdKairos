import type { Metadata } from "next";

import { AtendimentoClient } from "./_components/atendimento-client";

export const metadata: Metadata = {
  title: "Órion · Atendimento",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground text-sm">
          Configuração do bot de atendimento automático do Órion: persona, horário de funcionamento, vendas e segurança.
        </p>
      </div>

      <AtendimentoClient />
    </div>
  );
}
