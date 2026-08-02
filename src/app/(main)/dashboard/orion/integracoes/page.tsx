import { Link2, RefreshCw, UserCog } from "lucide-react";
import type { Metadata } from "next";

import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";

export const metadata: Metadata = {
  title: "Órion · Integrações",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Integrações</h1>
        <p className="text-muted-foreground text-sm">
          Contas vinculadas ao Órion e sincronização de dados entre sistemas.
        </p>
      </div>

      <Empty className="rounded-xl border">
        <EmptyHeader>
          <EmptyMedia variant="icon">
            <Link2 />
          </EmptyMedia>
          <EmptyTitle>Integrações ainda não conectadas</EmptyTitle>
          <EmptyDescription>
            Esta tela vai mostrar as contas (owners) vinculadas ao Órion e permitir disparar manualmente a sincronização
            de produtos entre o AdKairos e o Órion.
          </EmptyDescription>
        </EmptyHeader>
        <EmptyContent>
          <div className="flex flex-wrap items-center justify-center gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <UserCog className="size-3.5" />
              Contas vinculadas
            </span>
            <span className="flex items-center gap-1.5">
              <RefreshCw className="size-3.5" />
              Sincronização de produtos
            </span>
          </div>
        </EmptyContent>
      </Empty>
    </div>
  );
}
