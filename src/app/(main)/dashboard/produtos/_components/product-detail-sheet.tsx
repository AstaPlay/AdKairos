"use client";

import * as React from "react";

import {
  Clapperboard,
  FileText,
  HelpCircle,
  Loader2,
  RefreshCw,
  Sparkles,
  Tag,
  Tags,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

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
import { Area, AreaChart } from "recharts";

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Label } from "@/components/ui/label";
import { Progress } from "@/components/ui/progress";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { calcularPrecificacao, STATUS_MARGEM_STYLE } from "@/lib/kaiross-pricing";
import { cn } from "@/lib/utils";

import { CopyField } from "./copy-field";
import type { ProductRow } from "./produtos-table/schema";

function currency(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

function formatGeneratedAt(iso?: string) {
  if (!iso) return null;
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return null;
  }
}

/** Bloco de "em breve" com o mesmo componente Empty já usado no restante do painel (ver catalog-category-sheet.tsx). */
function ComingSoonAI({ icon: Icon, description }: { icon: React.ElementType; description: string }) {
  return (
    <Empty className="rounded-lg border border-dashed p-4">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Icon />
        </EmptyMedia>
        <EmptyTitle className="text-sm">Em breve</EmptyTitle>
        <EmptyDescription className="text-xs">{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  );
}

const salesChartConfig = {
  vendas: { label: "Vendas", color: "var(--primary)" },
} satisfies ChartConfig;

export function ProductDetailSheet({
  product,
  onClose,
}: {
  product: ProductRow | null;
  onClose: () => void;
}) {
  const isOpen = product !== null;
  const [salePrice, setSalePrice] = React.useState(product?.price ?? 0);
  const [isActive, setIsActive] = React.useState(product?.status === "active");
  const [isSyncing, setIsSyncing] = React.useState(false);
  const [isGeneratingKeywords, setIsGeneratingKeywords] = React.useState(false);
  const [keywords, setKeywords] = React.useState<string[] | undefined>(product?.aiContent?.keywords);
  const [keywordsGeneratedAt, setKeywordsGeneratedAt] = React.useState(product?.aiContent?.keywordsGeneratedAt);

  React.useEffect(() => {
    if (product) {
      setSalePrice(product.price);
      setIsActive(product.status === "active");
      setKeywords(product.aiContent?.keywords);
      setKeywordsGeneratedAt(product.aiContent?.keywordsGeneratedAt);
    }
  }, [product]);

  const isKaiross = product?.source === "kaiross";
  const hasIntegration = isKaiross && Boolean(product?.checkoutLink || product?.kairossProductId);
  const cost = product?.cost ?? 0;

  const pricing = calcularPrecificacao({
    custo: cost,
    venda: salePrice,
    clientePagaFrete: true,
    freteCobrado: 0,
    custoFrete: 0,
  });
  const tone = STATUS_MARGEM_STYLE[pricing.status];

  const minPrice = cost > 0 ? pricing.precoMin : 0;
  const maxPrice = product ? Math.max(product.price * 1.6, pricing.precoRec * 1.15, minPrice + 1) : 0;
  const recommendedPct = Math.min(100, Math.max(0, ((pricing.precoRec - minPrice) / (maxPrice - minPrice || 1)) * 100));
  const keywordsGeneratedLabel = formatGeneratedAt(keywordsGeneratedAt);

  async function handleGenerateKeywords() {
    if (!product) return;
    setIsGeneratingKeywords(true);
    try {
      const response = await fetch("/api/ai/produtos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operation: "gerarKeywords",
          context: { name: product.name, description: product.description, category: product.category },
        }),
      });
      const body = (await response.json()) as { success: boolean; data?: string[]; error?: { message: string } };
      if (!body.success || !body.data) throw new Error(body.error?.message ?? "Falha ao gerar palavras-chave.");
      setKeywords(body.data);
      setKeywordsGeneratedAt(new Date().toISOString());
      toast.success("Palavras-chave geradas");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Não foi possível gerar agora.");
    } finally {
      setIsGeneratingKeywords(false);
    }
  }

  async function handleSync() {
    setIsSyncing(true);
    // A sincronização real acontece em /api/integrations/kaiross/sincronizar. Esta tela
    // ainda trabalha sobre a lista mockada de produtos, então aqui só refletimos o
    // resultado esperado — plugar o fetch real quando a lista vier da API.
    await new Promise((resolve) => setTimeout(resolve, 700));
    setIsSyncing(false);
    toast.success("Produto sincronizado com a Kairóss");
  }

  function handleDelete() {
    toast.success(isKaiross ? "Produto pausado" : "Produto removido");
    onClose();
  }

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <SheetContent className="flex flex-col gap-0 overflow-y-auto sm:max-w-lg">
        {product && (
          <>
            <SheetHeader className="gap-1.5">
              <div className="flex items-center gap-2">
                <Avatar size="sm" className="shrink-0">
                  <AvatarFallback>{(product.brand ?? product.name).slice(0, 1).toUpperCase()}</AvatarFallback>
                </Avatar>
                <SheetTitle className="leading-snug">{product.name}</SheetTitle>
                {isKaiross && (
                  <Badge variant="outline" className="gap-1 border-primary/20 bg-primary/5 text-primary">
                    <Sparkles className="size-3" strokeWidth={2} />
                    Kairóss
                  </Badge>
                )}
              </div>
              <SheetDescription>
                {product.sku ? `SKU ${product.sku} · ` : ""}
                {product.category}
              </SheetDescription>
            </SheetHeader>

            <Tabs defaultValue="geral" className="min-h-0 flex-1 px-4">
              <TabsList className="w-full">
                <TabsTrigger value="geral">Visão geral</TabsTrigger>
                {hasIntegration && <TabsTrigger value="integracao">Integração</TabsTrigger>}
                <TabsTrigger value="ia">Conteúdo IA</TabsTrigger>
              </TabsList>

              <TabsContent value="geral" className="flex flex-col gap-5 pt-4 pb-2">
                <div className="flex items-center justify-between rounded-lg border p-3">
                  <div>
                    <p className="text-sm font-medium">Produto ativo</p>
                    <p className="text-muted-foreground text-xs">Visível para venda no WhatsApp AI e CRM</p>
                  </div>
                  <Switch checked={isActive} onCheckedChange={setIsActive} />
                </div>

                <div className="flex flex-col gap-3 rounded-xl border p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-muted-foreground text-xs">Preço de venda</p>
                      <p className="text-2xl font-semibold tabular-nums">{currency(salePrice)}</p>
                    </div>
                    <Badge variant="outline" className={cn("shrink-0 gap-1", tone.border, tone.bg, tone.text)}>
                      Margem {tone.label.toLowerCase()} · {Math.round(pricing.margem)}%
                    </Badge>
                  </div>

                  <div className="grid grid-cols-2 gap-3 border-t pt-3">
                    <div>
                      <p className="text-muted-foreground text-xs">Custo</p>
                      <p className="text-sm font-medium tabular-nums">{currency(cost)}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground text-xs">Lucro líquido</p>
                      <p className={cn("text-sm font-medium tabular-nums", tone.text)}>{currency(pricing.lucro)}</p>
                    </div>
                  </div>

                  {cost > 0 && (
                    <div className="flex flex-col gap-2 pt-1">
                      <div className="flex items-center justify-between">
                        <Label className="text-muted-foreground text-xs">Ajustar preço de venda</Label>
                        <span className="text-muted-foreground text-xs">
                          mín. {currency(minPrice)} · recomendado {currency(pricing.precoRec)}
                        </span>
                      </div>
                      <div className="relative pt-1">
                        <span
                          className="absolute top-0 h-2.5 w-px bg-emerald-500/60"
                          style={{ left: `${recommendedPct}%` }}
                          aria-hidden
                        />
                        <Slider
                          value={[salePrice]}
                          min={minPrice}
                          max={maxPrice}
                          step={0.5}
                          onValueChange={([value]) => setSalePrice(value)}
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div className="flex flex-col gap-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-muted-foreground">Estoque</span>
                    <span className={cn("font-medium tabular-nums", product.stock === 0 && "text-destructive")}>
                      {product.stock} un
                    </span>
                  </div>
                  <Progress
                    value={Math.min(100, (product.stock / 50) * 100)}
                    className={product.stock === 0 ? "[&>div]:bg-destructive" : undefined}
                  />
                </div>

                {product.salesHistory && product.salesHistory.length > 1 && (
                  <div className="flex flex-col gap-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">Vendas nos últimos períodos</span>
                      {typeof product.salesCount === "number" && (
                        <span className="font-medium tabular-nums">{product.salesCount} no total</span>
                      )}
                    </div>
                    <ChartContainer config={salesChartConfig} className="!aspect-auto h-14 w-full">
                      <AreaChart data={product.salesHistory.map((value, index) => ({ index, vendas: value }))}>
                        <defs>
                          <linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.35} />
                            <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <Area
                          dataKey="vendas"
                          type="monotone"
                          stroke="var(--primary)"
                          strokeWidth={2}
                          fill="url(#salesFill)"
                        />
                      </AreaChart>
                    </ChartContainer>
                  </div>
                )}

                {product.description && <p className="text-muted-foreground text-sm">{product.description}</p>}

                {product.tags && product.tags.length > 0 && (
                  <div className="flex flex-col gap-2">
                    <Label className="flex items-center gap-1.5 text-muted-foreground text-xs">
                      <Tag className="size-3.5" strokeWidth={2} />
                      Tags para o bot
                    </Label>
                    <div className="flex flex-wrap gap-1.5">
                      {product.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[11px]">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </TabsContent>

              {hasIntegration && (
                <TabsContent value="integracao" className="flex flex-col gap-4 pt-4 pb-2">
                  {product.checkoutLink && (
                    <CopyField label="Link de checkout" value={product.checkoutLink} href={product.checkoutLink} />
                  )}
                  {product.kairossProductId && (
                    <CopyField label="ID do produto na Kairóss" value={product.kairossProductId} />
                  )}
                  <Button variant="outline" className="w-fit gap-1.5" onClick={handleSync} disabled={isSyncing}>
                    {isSyncing ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                    Sincronizar com a Kairóss
                  </Button>
                </TabsContent>
              )}

              <TabsContent value="ia" className="pt-2 pb-2">
                <Accordion type="single" collapsible defaultValue="keywords">
                  <AccordionItem value="keywords">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Tags className="size-4 text-primary" strokeWidth={2} />
                        Palavras-chave
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      {keywords && keywords.length > 0 ? (
                        <div className="flex flex-col gap-2">
                          <div className="flex flex-wrap gap-1.5">
                            {keywords.map((term) => (
                              <Badge key={term} variant="secondary" className="font-mono text-[11px]">
                                {term}
                              </Badge>
                            ))}
                          </div>
                          {keywordsGeneratedLabel && (
                            <p className="text-muted-foreground text-[11px]">Gerado em {keywordsGeneratedLabel}</p>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="w-fit gap-1.5"
                            onClick={handleGenerateKeywords}
                            disabled={isGeneratingKeywords}
                          >
                            {isGeneratingKeywords ? (
                              <Loader2 className="size-3.5 animate-spin" />
                            ) : (
                              <RefreshCw className="size-3.5" />
                            )}
                            Gerar novamente
                          </Button>
                        </div>
                      ) : (
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-fit gap-1.5"
                          onClick={handleGenerateKeywords}
                          disabled={isGeneratingKeywords}
                        >
                          {isGeneratingKeywords ? (
                            <Loader2 className="size-3.5 animate-spin" />
                          ) : (
                            <Sparkles className="size-3.5" />
                          )}
                          Gerar com IA
                        </Button>
                      )}
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="descricao">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <FileText className="size-4 text-muted-foreground" strokeWidth={2} />
                        Descrição
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ComingSoonAI icon={FileText} description="Geração de descrição por IA volta assim que o motor de conteúdo (Enxame) for migrado para este painel." />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="faq">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <HelpCircle className="size-4 text-muted-foreground" strokeWidth={2} />
                        FAQ
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ComingSoonAI icon={HelpCircle} description="Geração de perguntas frequentes por IA volta assim que o motor de conteúdo (Enxame) for migrado para este painel." />
                    </AccordionContent>
                  </AccordionItem>

                  <AccordionItem value="roteiro">
                    <AccordionTrigger>
                      <span className="flex items-center gap-2">
                        <Clapperboard className="size-4 text-muted-foreground" strokeWidth={2} />
                        Roteiro para vídeo
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <ComingSoonAI icon={Clapperboard} description="Geração de roteiro por IA volta assim que o motor de conteúdo (Enxame) for migrado para este painel." />
                    </AccordionContent>
                  </AccordionItem>
                </Accordion>
              </TabsContent>
            </Tabs>

            <SheetFooter className="flex-row gap-2 border-t pt-3">
              <Button variant="default" className="flex-1">
                Salvar alterações
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Remover produto">
                    <Trash2 className="size-4 text-destructive" />
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>{isKaiross ? "Pausar este produto?" : "Excluir este produto?"}</AlertDialogTitle>
                    <AlertDialogDescription>
                      {isKaiross
                        ? "Produtos afiliados da Kairóss não são removidos de verdade — isso vai pausar a venda e ocultá-lo do bot."
                        : "Essa ação exclui o produto permanentemente e não pode ser desfeita."}
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>{isKaiross ? "Pausar" : "Excluir"}</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
