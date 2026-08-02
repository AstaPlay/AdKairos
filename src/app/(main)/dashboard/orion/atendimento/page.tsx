import Link from "next/link";

import { Bot, Clock, MessagesSquare, Route, Shield } from "lucide-react";
import type { Metadata } from "next";

import { Button } from "@/components/ui/button";
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Órion · Atendimento",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Atendimento</h1>
        <p className="text-muted-foreground text-sm">
          Configuração do bot de atendimento automático do Órion: horários, roteamento, botões e segurança.
        </p>
      </div>

      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Bot />
          </EmptyMedia>
          <EmptyTitle>Configurações do bot ainda não conectadas</EmptyTitle>
          <EmptyDescription>
            Aqui você vai configurar como o bot do Órion se comporta: mensagens padrão, horário de funcionamento, para
            onde encaminha cada assunto, os botões de menu que ele oferece e os padrões de segurança que ele aplica
            automaticamente.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <Clock className="size-3.5" />
              Horário de funcionamento
            </span>
            <span className="flex items-center gap-1.5">
              <Route className="size-3.5" />
              Roteamento de intenção
            </span>
            <span className="flex items-center gap-1.5">
              <MessagesSquare className="size-3.5" />
              Botões de menu
            </span>
            <span className="flex items-center gap-1.5">
              <Shield className="size-3.5" />
              Padrões de segurança
            </span>
          </div>
          <Button asChild variant="outline" size="sm">
            <Link href="/dashboard/escaladas">Ver tickets escalados para atendente humano</Link>
          </Button>
        </EmptyContent>
      </Empty>
    </div>
  );
}
