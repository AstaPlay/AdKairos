"use client";

import * as React from "react";

import { Package, PackageX, ShoppingBasket, Sparkles } from "lucide-react";
import { Area, AreaChart, ResponsiveContainer } from "recharts";

import { Card, CardAction, CardContent, CardDescription, CardHeader } from "@/components/ui/card";

import type { ProductRow } from "./produtos-table/schema";

function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (data.length < 2) return null;
  const points = data.map((value, index) => ({ index, value }));

  return (
    <div className="h-10 w-20">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id={`spark-${color.replace("#", "")}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.4} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            strokeWidth={1.5}
            fill={`url(#spark-${color.replace("#", "")})`}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function KpiCards({ products }: { products: ProductRow[] }) {
  const total = products.length;
  const active = products.filter((product) => product.status === "active").length;
  const outOfStock = products.filter((product) => product.status === "out_of_stock" || product.stock === 0).length;
  const fromKaiross = products.filter((product) => product.source === "kaiross").length;

  const totalHistory = React.useMemo(() => aggregateHistory(products, () => true), [products]);
  const activeHistory = React.useMemo(() => aggregateHistory(products, (p) => p.status === "active"), [products]);
  const outOfStockHistory = React.useMemo(
    () => aggregateHistory(products, (p) => p.status === "out_of_stock" || p.stock === 0),
    [products],
  );
  const kaiRossHistory = React.useMemo(() => aggregateHistory(products, (p) => p.source === "kaiross"), [products]);

  return (
    <section className="space-y-5">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">Catálogo e inteligência de produtos</h2>
        <p className="text-muted-foreground text-sm">
          Cada produto cadastrado aqui alimenta o WhatsApp AI, Instagram AI, automações e o CRM.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription className="font-mono uppercase tracking-wide">Total de produtos</CardDescription>
            <CardAction>
              <Package className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="text-3xl leading-none tracking-tight">{total}</span>
            <Sparkline data={totalHistory} color="#6366f1" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono uppercase tracking-wide">Ativos</CardDescription>
            <CardAction>
              <ShoppingBasket className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="text-3xl leading-none tracking-tight">{active}</span>
            <Sparkline data={activeHistory} color="#22c55e" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono uppercase tracking-wide">Sem estoque</CardDescription>
            <CardAction>
              <PackageX className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="text-3xl leading-none tracking-tight">{outOfStock}</span>
            <Sparkline data={outOfStockHistory} color="#ef4444" />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardDescription className="font-mono uppercase tracking-wide">Importados da Kairóss</CardDescription>
            <CardAction>
              <Sparkles className="size-4 text-muted-foreground" />
            </CardAction>
          </CardHeader>
          <CardContent className="flex items-end justify-between">
            <span className="text-3xl leading-none tracking-tight">{fromKaiross}</span>
            <Sparkline data={kaiRossHistory} color="#a855f7" />
          </CardContent>
        </Card>
      </div>
    </section>
  );
}

function aggregateHistory(items: ProductRow[], predicate: (item: ProductRow) => boolean) {
  const relevant = items.filter(predicate);
  const length = 6;
  const totals = Array.from({ length }, () => 0);
  for (const item of relevant) {
    const history = item.salesHistory ?? [];
    for (let i = 0; i < length; i += 1) {
      totals[i] += history[i] ?? 0;
    }
  }
  return totals;
}
