"use client";
"use no memo";

import type { ColumnDef } from "@tanstack/react-table";
import { ImageOff, Sparkles } from "lucide-react";

import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";

import type { ProductRow, ProductSource, ProductStatus } from "./schema";

const STATUS_LABEL: Record<ProductStatus, string> = {
  draft: "Rascunho",
  active: "Ativo",
  paused: "Pausado",
  out_of_stock: "Sem estoque",
};

const STATUS_BADGE_CLASS: Record<ProductStatus, string> = {
  draft: "border-border bg-muted text-muted-foreground",
  active:
    "border-green-200 bg-green-500/10 text-green-700 dark:border-green-900/40 dark:bg-green-500/15 dark:text-green-300",
  paused:
    "border-amber-200 bg-amber-500/10 text-amber-700 dark:border-amber-900/40 dark:bg-amber-500/15 dark:text-amber-300",
  out_of_stock: "border-destructive/20 bg-destructive/10 text-destructive",
};

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });
}

export const productsColumns: ColumnDef<ProductRow>[] = [
  {
    id: "select",
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllPageRowsSelected() || (table.getIsSomePageRowsSelected() && "indeterminate")}
        onCheckedChange={(value) => table.toggleAllPageRowsSelected(!!value)}
        aria-label="Selecionar todos os produtos"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onCheckedChange={(value) => row.toggleSelected(!!value)}
        aria-label={`Selecionar ${row.original.name}`}
      />
    ),
    enableHiding: false,
  },
  {
    accessorKey: "name",
    header: "Produto",
    cell: ({ row }) => (
      <div className="flex items-center gap-3">
        <Avatar className="size-9 rounded-md">
          <AvatarImage src={row.original.image ?? undefined} alt={row.original.name} className="object-cover" />
          <AvatarFallback className="rounded-md">
            <ImageOff className="size-3.5 text-muted-foreground/60" strokeWidth={1.5} />
          </AvatarFallback>
        </Avatar>
        <div className="flex flex-col">
          <span className="font-medium text-sm">{row.original.name}</span>
          <span className="text-muted-foreground text-xs">{row.original.category}</span>
        </div>
      </div>
    ),
  },
  {
    accessorKey: "price",
    header: "Preço",
    cell: ({ row }) => <div className="text-sm tabular-nums">{currency(row.original.price)}</div>,
  },
  {
    accessorKey: "stock",
    header: "Estoque",
    cell: ({ row }) => (
      <div className={row.original.stock === 0 ? "text-destructive text-sm tabular-nums" : "text-sm tabular-nums"}>
        {row.original.stock} un
      </div>
    ),
  },
  {
    accessorKey: "status",
    header: "Status",
    cell: ({ row }) => (
      <Badge variant="outline" className={STATUS_BADGE_CLASS[row.original.status]}>
        {STATUS_LABEL[row.original.status]}
      </Badge>
    ),
    filterFn: "equalsString",
  },
  {
    accessorKey: "source",
    header: "Origem",
    cell: ({ row }) =>
      row.original.source === "kaiross" ? (
        <span className="inline-flex items-center gap-1 text-primary text-xs">
          <Sparkles className="size-3" strokeWidth={2} />
          Kairóss
        </span>
      ) : (
        <span className="text-muted-foreground text-xs">Manual</span>
      ),
    filterFn: "equalsString",
  },
  {
    accessorKey: "createdAt",
    header: () => <div className="text-right">Criado em</div>,
    cell: ({ row }) => <div className="text-right text-muted-foreground text-sm">{formatDate(row.original.createdAt)}</div>,
  },
];

export type { ProductSource, ProductStatus };
