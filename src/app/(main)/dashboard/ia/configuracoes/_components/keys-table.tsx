"use client";

import { Trash2 } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EnxameKeyView } from "@/lib/enxame-client";
import { AddKeyDialog } from "./add-key-dialog";

const STATE_LABEL: Record<EnxameKeyView["state"], { label: string; variant: "default" | "secondary" | "destructive" }> = {
  available: { label: "Disponível", variant: "default" },
  cooldown: { label: "Em cooldown", variant: "secondary" },
  disabled: { label: "Desativada", variant: "destructive" },
};

function formatDate(iso: string | null): string {
  if (!iso) return "nunca";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

interface KeysTableProps {
  keys: EnxameKeyView[];
  loading: boolean;
  mutatingId: string | null;
  onAdd: (input: { id: string; provider: "groq" | "gemini"; apiKey: string; model?: string }) => Promise<boolean>;
  onToggle: (id: string, nextState: "available" | "disabled") => Promise<void>;
  onRemove: (id: string) => Promise<void>;
}

export function KeysTable({ keys, loading, mutatingId, onAdd, onToggle, onRemove }: KeysTableProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-start justify-between gap-3">
        <div>
          <CardTitle>Chaves do pool</CardTitle>
          <CardDescription>Groq e Gemini cadastrados no Enxame — a chave em si nunca é exibida de volta.</CardDescription>
        </div>
        <AddKeyDialog onAdd={onAdd} />
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders, ordem fixa
              <Skeleton key={i} className="h-12 w-full rounded-md" />
            ))}
          </div>
        ) : keys.length === 0 ? (
          <div className="flex h-[160px] flex-col items-center justify-center gap-2 text-center text-muted-foreground text-sm">
            <p>Nenhuma chave cadastrada ainda.</p>
            <p>Adicione a primeira chave Groq ou Gemini para ativar as features de IA.</p>
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>ID</TableHead>
                <TableHead>Provedor</TableHead>
                <TableHead>Modelo</TableHead>
                <TableHead>Chave</TableHead>
                <TableHead>Uso</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Último uso</TableHead>
                <TableHead className="text-right">Ativa</TableHead>
                <TableHead className="w-9" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {keys.map((key) => {
                const status = STATE_LABEL[key.state];
                const isMutating = mutatingId === key.id;
                return (
                  <TableRow key={key.id}>
                    <TableCell className="font-medium">{key.id}</TableCell>
                    <TableCell className="capitalize text-muted-foreground">{key.provider}</TableCell>
                    <TableCell className="text-muted-foreground">{key.model ?? "—"}</TableCell>
                    <TableCell className="font-mono text-muted-foreground text-xs">{key.apiKeyPreview ?? "—"}</TableCell>
                    <TableCell className="text-muted-foreground tabular-nums">
                      {key.totalCalls}
                      {key.totalErrors > 0 && <span className="text-destructive"> ({key.totalErrors} erros)</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant={status.variant}>{status.label}</Badge>
                    </TableCell>
                    <TableCell className="text-muted-foreground">{formatDate(key.lastUsedAt)}</TableCell>
                    <TableCell className="text-right">
                      <Switch
                        checked={key.state !== "disabled"}
                        disabled={isMutating}
                        onCheckedChange={(checked) => onToggle(key.id, checked ? "available" : "disabled")}
                        aria-label={`Ativar ou desativar a chave ${key.id}`}
                      />
                    </TableCell>
                    <TableCell>
                      <AlertDialog>
                        <AlertDialogTrigger asChild>
                          <Button variant="ghost" size="icon" className="size-8 text-muted-foreground hover:text-destructive" disabled={isMutating}>
                            <Trash2 className="size-4" />
                          </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                          <AlertDialogHeader>
                            <AlertDialogTitle>Remover chave {key.id}?</AlertDialogTitle>
                            <AlertDialogDescription>
                              Isso remove a chave permanentemente do pool do Enxame. Requisições futuras deixam de poder usar
                              essa chave — essa ação não pode ser desfeita.
                            </AlertDialogDescription>
                          </AlertDialogHeader>
                          <AlertDialogFooter>
                            <AlertDialogCancel>Cancelar</AlertDialogCancel>
                            <AlertDialogAction onClick={() => onRemove(key.id)} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                              Remover
                            </AlertDialogAction>
                          </AlertDialogFooter>
                        </AlertDialogContent>
                      </AlertDialog>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
