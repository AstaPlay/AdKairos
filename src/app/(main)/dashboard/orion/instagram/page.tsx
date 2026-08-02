import { Camera, KeyRound, Radio, TrendingUp } from "lucide-react";
import type { Metadata } from "next";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Órion · Instagram",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Instagram</h1>
        <p className="text-muted-foreground text-sm">
          Canais conectados, status dos tokens de acesso, eventos recebidos e métricas de desempenho.
        </p>
      </div>

      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Camera />
          </EmptyMedia>
          <EmptyTitle>Canais do Instagram ainda não conectados</EmptyTitle>
          <EmptyDescription>
            Esta tela vai mostrar os canais do Instagram vinculados ao Órion, a validade dos tokens de acesso, os
            eventos recebidos via webhook (mensagens e comentários) e as métricas de perfil e publicações.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <KeyRound className="size-3.5" />
              Tokens de acesso
            </span>
            <span className="flex items-center gap-1.5">
              <Radio className="size-3.5" />
              Eventos (webhook)
            </span>
            <span className="flex items-center gap-1.5">
              <TrendingUp className="size-3.5" />
              Insights
            </span>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
