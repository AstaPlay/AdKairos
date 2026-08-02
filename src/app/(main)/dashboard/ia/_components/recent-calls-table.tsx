"use client";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EnxameUsageItem } from "@/lib/enxame-client";

const FEATURE_LABELS: Record<string, string> = {
  gerarKeywords: "Gerar keywords",
  "kaiross-sugestao-preco": "Sugestão de preço",
  generate: "Genérico",
};

function formatTime(iso: string): string {
  return new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

interface RecentCallsTableProps {
  items: EnxameUsageItem[] | null;
  loading: boolean;
}

export function RecentCallsTable({ items, loading }: RecentCallsTableProps) {
  const recent = items?.slice(0, 15) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chamadas recentes</CardTitle>
        <CardDescription>Últimas 15 requisições ao Enxame, mais recente primeiro</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !items ? (
          <div className="flex flex-col gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              // biome-ignore lint/suspicious/noArrayIndexKey: skeleton placeholders, ordem fixa
              <Skeleton key={i} className="h-9 w-full rounded-md" />
            ))}
          </div>
        ) : recent.length === 0 ? (
          <div className="flex h-[160px] items-center justify-center text-muted-foreground text-sm">
            Nenhuma chamada registrada ainda.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Feature</TableHead>
                <TableHead>Provedor</TableHead>
                <TableHead>Latência</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="text-right">Quando</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((item, index) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: log de leitura, sem id estável exposto pela API
                <TableRow key={`${item.created_at}-${index}`}>
                  <TableCell className="font-medium">
                    {FEATURE_LABELS[item.feature ?? ""] ?? item.feature ?? "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground capitalize">{item.provider}</TableCell>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {item.latency_ms !== null ? `${item.latency_ms}ms` : "—"}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.success ? "default" : "destructive"}>
                      {item.success ? "sucesso" : "erro"}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right text-muted-foreground">{formatTime(item.created_at)}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
