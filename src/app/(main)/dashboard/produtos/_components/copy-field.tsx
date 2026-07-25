"use client";

import * as React from "react";

import { Check, Copy, ExternalLink } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export function CopyField({
  label,
  value,
  href,
  monospace = true,
}: {
  label: string;
  value: string;
  /** Se informado, mostra um botão para abrir o valor em nova aba (ex.: link de checkout). */
  href?: string;
  monospace?: boolean;
}) {
  const [copied, setCopied] = React.useState(false);

  async function handleCopy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    toast.success(`${label} copiado`);
    setTimeout(() => setCopied(false), 1800);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label className="text-muted-foreground text-xs">{label}</Label>
      <div className="flex items-center gap-1.5 rounded-lg border bg-muted/40 p-1.5 pl-3">
        <p className={cn("min-w-0 flex-1 truncate text-sm", monospace && "font-mono text-[13px]")}>{value}</p>
        <Button
          type="button"
          variant={copied ? "secondary" : "outline"}
          size="sm"
          className="h-7 shrink-0 gap-1.5 px-2 text-xs"
          onClick={handleCopy}
        >
          {copied ? <Check className="size-3.5" strokeWidth={2.5} /> : <Copy className="size-3.5" strokeWidth={2} />}
          {copied ? "Copiado" : "Copiar"}
        </Button>
        {href && (
          <Button type="button" variant="ghost" size="icon" className="size-7 shrink-0" asChild>
            <a href={href} target="_blank" rel="noopener noreferrer" aria-label={`Abrir ${label}`}>
              <ExternalLink className="size-3.5" strokeWidth={2} />
            </a>
          </Button>
        )}
      </div>
    </div>
  );
}
