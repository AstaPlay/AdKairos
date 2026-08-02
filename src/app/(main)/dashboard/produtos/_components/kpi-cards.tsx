"use client";

import type * as React from "react";

import { Package, PackageX, ShoppingBasket, Sparkles } from "lucide-react";
import { RadialBar, RadialBarChart } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";
import { cn } from "@/lib/utils";

import type { ProductRow } from "./produtos-table/schema";

/**
 * Cores por CSS var do tema (--chart-1..4), igual ao resto do dashboard
 * (ver pipeline-activity.tsx no CRM) — antes eram hex hardcoded (#6366f1
 * etc.), o que quebrava em dark mode e destoava das outras páginas.
 */
const kpiChartConfig = {
  total: { label: "Total de produtos", color: "var(--chart-1)" },
  ativos: { label: "Ativos", color: "var(--chart-2)" },
  semEstoque: { label: "Sem estoque", color: "var(--chart-4)" },
  kaiross: { label: "Importados da Kairóss", color: "var(--chart-3)" },
} satisfies ChartConfig;

/**
 * Anel de proporção — em vez de uma série temporal (que exigiria um
 * histórico diário de vendas que este sistema não grava hoje: ver nota em
 * `map-product-row.ts` sobre `salesHistory` nunca ter sido persistido de
 * verdade), mostramos a proporção real e atual desta métrica sobre o total
 * de produtos. É sempre dado real, nunca inventado, e sempre disponível —
 * mesmo com 1 produto só no catálogo.
 */
function ProportionRing({
  value,
  total,
  colorKey,
}: {
  value: number;
  total: number;
  colorKey: keyof typeof kpiChartConfig;
}) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const data = [{ name: "value", value: pct, fill: `var(--color-${colorKey})` }];

  return (
    <ChartContainer config={kpiChartConfig} className="relative aspect-square h-11 w-11 shrink-0">
      <RadialBarChart
        width={44}
        height={44}
        innerRadius={14}
        outerRadius={20}
        barSize={5}
        data={data}
        startAngle={90}
        endAngle={90 - 360 * (pct / 100)}
      >
        <RadialBar
          dataKey="value"
          cornerRadius={4}
          background={{ fill: "var(--muted)" }}
          fill={`var(--color-${colorKey})`}
        />
      </RadialBarChart>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono font-semibold text-[9px] text-muted-foreground tabular-nums">
        {pct}%
      </span>
    </ChartContainer>
  );
}

/**
 * Card de KPI com acento de cor sutil (borda superior + glow no ícone) —
 * reforça a leitura rápida por cor sem depender só do texto, e usa as
 * mesmas CSS vars de --chart-N do ProportionRing para que o acento do card
 * e o anel sempre concordem visualmente.
 */
function KpiCard({
  label,
  value,
  icon: Icon,
  colorKey,
  ring,
  emphasis,
}: {
  label: string;
  value: number;
  icon: React.ElementType;
  colorKey: keyof typeof kpiChartConfig;
  ring: React.ReactNode;
  emphasis?: boolean;
}) {
  return (
    <Card
      className="group relative gap-3 overflow-hidden py-4 transition-all hover:-translate-y-0.5 hover:shadow-md sm:gap-6 sm:py-6"
      style={{ borderTopColor: `var(--color-${colorKey})`, borderTopWidth: 2 }}
    >
      <div
        className="pointer-events-none absolute -top-6 -right-6 size-24 rounded-full opacity-[0.07] blur-2xl transition-opacity group-hover:opacity-[0.14]"
        style={{ backgroundColor: `var(--color-${colorKey})` }}
        aria-hidden
      />
      <CardHeader className="px-3 sm:px-6">
        <CardDescription className="break-words font-mono text-[10px] uppercase tracking-wide sm:text-[11px]">
          {label}
        </CardDescription>
        <CardAction>
          <span
            className="flex size-7 items-center justify-center rounded-full"
            style={{ backgroundColor: `color-mix(in oklch, var(--color-${colorKey}) 16%, transparent)` }}
          >
            <Icon className="size-3.5 shrink-0" style={{ color: `var(--color-${colorKey})` }} />
          </span>
        </CardAction>
      </CardHeader>
      <CardContent className="relative flex min-h-11 items-end justify-between gap-2 px-3 sm:gap-3 sm:px-6">
        <span
          className={cn(
            "tabular-nums leading-none tracking-tight",
            emphasis ? "text-3xl sm:text-4xl" : "text-2xl sm:text-3xl",
          )}
        >
          {value}
        </span>
        {ring}
      </CardContent>
    </Card>
  );
}

export function KpiCards({ products }: { products: ProductRow[] }) {
  const total = products.length;
  const active = products.filter((product) => product.status === "active").length;
  const outOfStock = products.filter((product) => product.status === "out_of_stock" || product.stock === 0).length;
  const fromKaiross = products.filter((product) => product.source === "kaiross").length;

  return (
    <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      <KpiCard
        label="Total de produtos"
        value={total}
        icon={Package}
        colorKey="total"
        emphasis
        ring={<ProportionRing value={active} total={total} colorKey="total" />}
      />
      <KpiCard
        label="Ativos"
        value={active}
        icon={ShoppingBasket}
        colorKey="ativos"
        ring={<ProportionRing value={active} total={total} colorKey="ativos" />}
      />
      <KpiCard
        label="Sem estoque"
        value={outOfStock}
        icon={PackageX}
        colorKey="semEstoque"
        ring={<ProportionRing value={outOfStock} total={total} colorKey="semEstoque" />}
      />
      <KpiCard
        label="Importados da Kairóss"
        value={fromKaiross}
        icon={Sparkles}
        colorKey="kaiross"
        ring={<ProportionRing value={fromKaiross} total={total} colorKey="kaiross" />}
      />
    </div>
  );
}
