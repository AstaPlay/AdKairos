"use client";

import { useMemo } from "react";

import { Bar, BarChart, CartesianGrid, XAxis } from "recharts";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { type ChartConfig, ChartContainer, ChartTooltip, ChartTooltipContent } from "@/components/ui/chart";
import { Skeleton } from "@/components/ui/skeleton";
import type { EnxameUsageItem } from "@/lib/enxame-client";

const chartConfig = {
  sucesso: { label: "Sucesso", color: "var(--chart-1)" },
  erro: { label: "Erro", color: "var(--destructive)" },
} satisfies ChartConfig;

/** Agrupa o log de uso em baldes por hora (últimas 24h), contando sucesso/erro. */
function buildHourlyBuckets(items: EnxameUsageItem[]) {
  const buckets = new Map<string, { hour: string; sucesso: number; erro: number }>();
  const now = new Date();

  for (let i = 23; i >= 0; i--) {
    const bucketDate = new Date(now.getTime() - i * 60 * 60 * 1000);
    const key = `${bucketDate.getHours().toString().padStart(2, "0")}h`;
    buckets.set(`${bucketDate.toISOString().slice(0, 13)}`, { hour: key, sucesso: 0, erro: 0 });
  }

  for (const item of items) {
    const bucketKey = item.created_at.slice(0, 13);
    const bucket = buckets.get(bucketKey);
    if (!bucket) continue;
    if (item.success) bucket.sucesso += 1;
    else bucket.erro += 1;
  }

  return Array.from(buckets.values());
}

interface UsageChartProps {
  items: EnxameUsageItem[] | null;
  loading: boolean;
}

export function UsageChart({ items, loading }: UsageChartProps) {
  const chartData = useMemo(() => buildHourlyBuckets(items ?? []), [items]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Chamadas por hora</CardTitle>
        <CardDescription>Sucesso vs erro nas últimas 24 horas</CardDescription>
      </CardHeader>
      <CardContent>
        {loading && !items ? (
          <Skeleton className="h-[240px] w-full rounded-lg" />
        ) : items && items.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-muted-foreground text-sm">
            Nenhuma chamada registrada nas últimas 24h.
          </div>
        ) : (
          <ChartContainer config={chartConfig} className="h-[240px] w-full">
            <BarChart data={chartData}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="hour" tickLine={false} axisLine={false} tickMargin={8} interval={2} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="sucesso" stackId="a" fill="var(--color-sucesso)" radius={[0, 0, 4, 4]} />
              <Bar dataKey="erro" stackId="a" fill="var(--color-erro)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ChartContainer>
        )}
      </CardContent>
    </Card>
  );
}
