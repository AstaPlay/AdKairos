"use client";

import * as React from "react";

import { Package, PackageX, ShoppingBasket, Sparkles } from "lucide-react";
import { RadialBar, RadialBarChart } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import type { ProductRow } from "./produtos-table/schema";

/**
 * Anel de proporção — em vez de uma série temporal (que exigiria um
 * histórico diário de vendas que este sistema não grava hoje: ver nota em
 * `map-product-row.ts` sobre `salesHistory` nunca ter sido persistido de
 * verdade), mostramos a proporção real e atual desta métrica sobre o total
 * de produtos. É sempre dado real, nunca inventado, e sempre disponível —
 * mesmo com 1 produto só no catálogo.
 */
function ProportionRing({ value, total, color }: { value: number; total: number; color: string }) {
  const pct = total > 0 ? Math.round((value / total) * 100) : 0;
  const data = [{ name: "value", value: pct, fill: color }];

  return (
    <div className="relative h-11 w-11 shrink-0">
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
        <RadialBar dataKey="value" cornerRadius={4} background={{ fill: "var(--muted)" }} fill={color} />
      </RadialBarChart>
      <span className="absolute inset-0 flex items-center justify-center font-mono text-[9px] font-semibold tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[11px] tracking-wide break-words uppercase">
              Total de produtos
            </CardDescription>
            <CardAction>
              <Package className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-3">
            <span className="text-3xl leading-none tracking-tight">{total}</span>
            <ProportionRing value={active} total={total} color="#6366f1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[11px] tracking-wide break-words uppercase">Ativos</CardDescription>
            <CardAction>
              <ShoppingBasket className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-3">
            <span className="text-3xl leading-none tracking-tight">{active}</span>
            <ProportionRing value={active} total={total} color="#22c55e" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[11px] tracking-wide break-words uppercase">
              Sem estoque
            </CardDescription>
            <CardAction>
              <PackageX className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-3">
            <span className="text-3xl leading-none tracking-tight">{outOfStock}</span>
            <ProportionRing value={outOfStock} total={total} color="#ef4444" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono text-[11px] tracking-wide break-words uppercase">
              Importados da Kairóss
            </CardDescription>
            <CardAction>
              <Sparkles className="text-muted-foreground size-4 shrink-0" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex min-h-11 items-end justify-between gap-3">
            <span className="text-3xl leading-none tracking-tight">{fromKaiross}</span>
            <ProportionRing value={fromKaiross} total={total} color="#a855f7" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
