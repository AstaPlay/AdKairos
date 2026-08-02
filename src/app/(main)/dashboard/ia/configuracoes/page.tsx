"use client";

import Link from "next/link";

import { ArrowLeft } from "lucide-react";

import { Button } from "@/components/ui/button";

import { KeysTable } from "./_components/keys-table";
import { useEnxameKeys } from "./_components/use-enxame-keys";

export default function Page() {
  const { keys, loading, configured, error, addKey, toggleKey, removeKey, mutatingId } = useEnxameKeys();

  return (
    <div className="@container/main flex flex-col gap-4 md:gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Button asChild variant="ghost" size="icon" className="size-7">
              <Link href="/dashboard/ia">
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="font-semibold text-2xl tracking-tight">Configurações do Enxame</h1>
          </div>
          <p className="text-muted-foreground text-sm">Gerencie as chaves de API do pool de IA (Groq e Gemini).</p>
        </div>
      </div>

      {!configured && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3 text-amber-700 text-sm dark:text-amber-400">
          O Enxame não está configurado neste ambiente — defina{" "}
          <code className="rounded bg-muted px-1 py-0.5 text-xs">ENXAME_API_KEY</code> para gerenciar chaves.
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-destructive text-sm">
          {error}
        </div>
      )}

      <KeysTable
        keys={keys}
        loading={loading}
        mutatingId={mutatingId}
        onAdd={addKey}
        onToggle={toggleKey}
        onRemove={removeKey}
      />
    </div>
  );
}
