"use client";

import * as React from "react";

import { Package, PackageX, ShoppingBasket, Sparkles } from "lucide-react";
import { RadialBar, RadialBarChart } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";
import { type ChartConfig, ChartContainer } from "@/components/ui/chart";

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
function ProportionRing({ value, total, colorKey }: { value: number; total: number; colorKey: keyof typeof kpiChartConfig }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const data = [{ name: "value", value: pct, fill: `var(--color-${colorKey})` }];

  return (
    <ChartContainer config={kpiChartConfig} className="relative h-11 w-11 shrink-0 aspect-square">
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
        <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--muted)" }} fill={`var(--color-${colorKey})`} />
      </RadialBarChart>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </ChartContainer>
  );
}

export function KpiCards({ products }: { products: ProductRow[] }) {
  const total = products.length;
  const active = products.filter((product) => product.status === "active").length;
  const outOfStock = products.filter((product) => product.status === "out_of_stock" || product.stock === 0).length;
  const fromKaiross = products.filter((product) => product.source === "kaiross").length;

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-2xl tracking-tight sm:text-3xl">Catálogo e inteligência de produtos</h2>
        <p className="text-muted-foreground text-sm">
          Cada produto cadastrado aqui alimenta o WhatsApp AI, Instagram AI, automações e o CRM.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <CardDescription className="font-mono text-[10px] tracking-wide break-words uppercase sm:text-[11px]">
              Total de produtos
            </CardDescription>
            <CardAction>
              <Package className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-2 px-3 sm:gap-3 sm:px-6">
            <span className="text-2xl leading-none tracking-tight sm:text-3xl">{total}</span>
            <ProportionRing value={active} total={total} colorKey="total" />
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <CardDescription className="font-mono text-[10px] tracking-wide break-words uppercase sm:text-[11px]">
              Ativos
            </CardDescription>
            <CardAction>
              <ShoppingBasket className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-2 px-3 sm:gap-3 sm:px-6">
            <span className="text-2xl leading-none tracking-tight sm:text-3xl">{active}</span>
            <ProportionRing value={active} total={total} colorKey="ativos" />
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <CardDescription className="font-mono text-[10px] tracking-wide break-words uppercase sm:text-[11px]">
              Sem estoque
            </CardDescription>
            <CardAction>
              <PackageX className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-2 px-3 sm:gap-3 sm:px-6">
            <span className="text-2xl leading-none tracking-tight sm:text-3xl">{outOfStock}</span>
            <ProportionRing value={outOfStock} total={total} colorKey="semEstoque" />
          </CardContent>
        </Card>

        <Card className="gap-3 py-4 sm:gap-6 sm:py-6">
          <CardHeader className="px-3 sm:px-6">
            <CardDescription className="font-mono text-[10px] tracking-wide break-words uppercase sm:text-[11px]">
              Importados da Kairóss
            </CardDescription>
            <CardAction>
              <Sparkles className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-2 px-3 sm:gap-3 sm:px-6">
            <span className="text-2xl leading-none tracking-tight sm:text-3xl">{fromKaiross}</span>
            <ProportionRing value={fromKaiross} total={total} colorKey="kaiross" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
