"use client";

import * as React from "react";

import { FileText, LineChart, Loader2, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncAction } from "@/hooks/use-async-action";
import { getErrorMessage } from "@/utils/get-error-message";

import {
  analyzeAdsPerformance,
  analyzeInstagramPerformance,
  CONTENT_SCRIPT_FORMAT_LABEL,
  generateContentScript,
  generateSocialContent,
  generateStrategicDiagnosis,
  listProductOptions,
  resolveProductId,
} from "./super-cerebro-api";
import type { ProductOption, SocialContentGoal, StrategyAttemptSignal } from "./types";

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function thirtyDaysAgoIso(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
}

/** Diagnóstico do Instagram — período + limite, exibe texto + posts destaque/fracos. */
function InstagramDiagnosisTab({ onDiagnosis }: { onDiagnosis: (text: string) => void }) {
  const [periodStart, setPeriodStart] = React.useState(thirtyDaysAgoIso());
  const [periodEnd, setPeriodEnd] = React.useState(todayIso());
  const action = useAsyncAction(analyzeInstagramPerformance);

  async function handleRun() {
    const result = await action.execute({ periodStart, periodEnd, limit: 25 });
    if (result) {
      onDiagnosis(result.diagnosis);
      toast.success("Diagnóstico do Instagram gerado.");
    } else if (action.error) {
      toast.error(getErrorMessage(action.error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart className="size-4" />
          Análise de performance — Instagram
        </CardTitle>
        <CardDescription>Analisa posts e métricas de perfil no período, usando a conta já conectada.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ig-period-start">Início do período</Label>
            <Input
              id="ig-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ig-period-end">Fim do período</Label>
            <Input id="ig-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleRun} disabled={action.isLoading} className="w-fit">
          {action.isLoading ? <Loader2 className="size-4 animate-spin" /> : <LineChart className="size-4" />}
          Analisar Instagram
        </Button>
        {action.data && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm">{action.data.diagnosis}</p>
            <div className="flex flex-wrap gap-1.5">
              {action.data.topPostIds.map((id) => (
                <Badge key={id} variant="secondary" className="text-xs">
                  Destaque: {id.slice(0, 8)}
                </Badge>
              ))}
              {action.data.weakestPostIds.map((id) => (
                <Badge key={id} variant="outline" className="text-xs">
                  Fraco: {id.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Diagnóstico de Ads — mesmo padrão do Instagram, sem limit. */
function AdsDiagnosisTab({ onDiagnosis }: { onDiagnosis: (text: string) => void }) {
  const [periodStart, setPeriodStart] = React.useState(thirtyDaysAgoIso());
  const [periodEnd, setPeriodEnd] = React.useState(todayIso());
  const action = useAsyncAction(analyzeAdsPerformance);

  async function handleRun() {
    const result = await action.execute({ periodStart, periodEnd });
    if (result) {
      onDiagnosis(result.diagnosis);
      toast.success("Diagnóstico de Ads gerado.");
    } else if (action.error) {
      toast.error(getErrorMessage(action.error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <LineChart className="size-4" />
          Análise de performance — Ads
        </CardTitle>
        <CardDescription>
          Analisa campanhas de Meta Ads no período (ranqueia por CPA, ou CTR quando não houver conversão medida).
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ads-period-start">Início do período</Label>
            <Input
              id="ads-period-start"
              type="date"
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="ads-period-end">Fim do período</Label>
            <Input id="ads-period-end" type="date" value={periodEnd} onChange={(e) => setPeriodEnd(e.target.value)} />
          </div>
        </div>
        <Button onClick={handleRun} disabled={action.isLoading} className="w-fit">
          {action.isLoading ? <Loader2 className="size-4 animate-spin" /> : <LineChart className="size-4" />}
          Analisar Ads
        </Button>
        {action.data && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm">{action.data.diagnosis}</p>
            <div className="flex flex-wrap gap-1.5">
              {action.data.bestCampaignIds.map((id) => (
                <Badge key={id} variant="secondary" className="text-xs">
                  Melhor: {id.slice(0, 8)}
                </Badge>
              ))}
              {action.data.worstCampaignIds.map((id) => (
                <Badge key={id} variant="outline" className="text-xs">
                  Pior: {id.slice(0, 8)}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const SIGNAL_OPTIONS: { value: StrategyAttemptSignal; label: string }[] = [
  { value: "weak_post", label: "Post fraco" },
  { value: "lost_sale", label: "Venda perdida" },
  { value: "recurring_objection", label: "Objeção recorrente" },
  { value: "successful_pattern", label: "Padrão de sucesso" },
];

/** Diagnóstico estratégico — cruza os textos de Instagram/Ads (preenchidos pelas outras abas, editáveis aqui) com o histórico de tentativas. */
function StrategicDiagnosisTab({
  instagramDiagnosis,
  adsDiagnosis,
}: {
  instagramDiagnosis: string;
  adsDiagnosis: string;
}) {
  const [igText, setIgText] = React.useState(instagramDiagnosis);
  const [adsText, setAdsText] = React.useState(adsDiagnosis);
  const [signal, setSignal] = React.useState<StrategyAttemptSignal>("weak_post");
  const action = useAsyncAction(generateStrategicDiagnosis);

  React.useEffect(() => setIgText(instagramDiagnosis), [instagramDiagnosis]);
  React.useEffect(() => setAdsText(adsDiagnosis), [adsDiagnosis]);

  async function handleRun() {
    if (!igText.trim() && !adsText.trim()) {
      toast.error("Preencha ao menos um diagnóstico (Instagram ou Ads) para gerar a recomendação.");
      return;
    }
    const result = await action.execute({
      instagramDiagnosis: igText.trim() || null,
      adsDiagnosis: adsText.trim() || null,
      signal,
    });
    if (result) {
      toast.success("Diagnóstico estratégico gerado.");
    } else if (action.error) {
      toast.error(getErrorMessage(action.error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Sparkles className="size-4" />
          Diagnóstico estratégico
        </CardTitle>
        <CardDescription>
          Cruza os diagnósticos de Instagram e Ads com o histórico de tentativas passadas e recomenda um próximo passo.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sig-instagram">Diagnóstico de Instagram (opcional)</Label>
          <Textarea
            id="sig-instagram"
            rows={4}
            value={igText}
            onChange={(e) => setIgText(e.target.value)}
            placeholder="Gerado na aba Instagram, ou cole aqui manualmente"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sig-ads">Diagnóstico de Ads (opcional)</Label>
          <Textarea
            id="sig-ads"
            rows={4}
            value={adsText}
            onChange={(e) => setAdsText(e.target.value)}
            placeholder="Gerado na aba Ads, ou cole aqui manualmente"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-64">
          <Label htmlFor="sig-signal">Sinal predominante</Label>
          <Select value={signal} onValueChange={(v) => setSignal(v as StrategyAttemptSignal)}>
            <SelectTrigger id="sig-signal">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {SIGNAL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <Button onClick={handleRun} disabled={action.isLoading} className="w-fit">
          {action.isLoading ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
          Gerar recomendação
        </Button>
        {action.data && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm">{action.data.recommendation}</p>
            <Badge variant="secondary" className="w-fit text-xs">
              Registrado como tentativa: {action.data.attempt.status}
            </Badge>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

const GOAL_OPTIONS: { value: SocialContentGoal; label: string }[] = [
  { value: "drive_dm", label: "Levar pra DM" },
  { value: "drive_link_click", label: "Levar pro link da bio" },
  { value: "boost_engagement", label: "Gerar engajamento" },
];

/** Conteúdo social avulso — legenda + CTA para um produto, sem depender de diagnóstico prévio. */
function SocialContentTab() {
  const [productName, setProductName] = React.useState("");
  const [productDescription, setProductDescription] = React.useState("");
  const [brandTone, setBrandTone] = React.useState("");
  const [goal, setGoal] = React.useState<SocialContentGoal>("boost_engagement");
  const action = useAsyncAction(generateSocialContent);

  async function handleRun() {
    if (!productName.trim()) {
      toast.error("Informe o nome do produto.");
      return;
    }
    const result = await action.execute({
      productName: productName.trim(),
      productDescription: productDescription.trim() || null,
      brandTone: brandTone.trim() || null,
      goal,
    });
    if (result) {
      toast.success("Conteúdo gerado.");
    } else if (action.error) {
      toast.error(getErrorMessage(action.error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Wand2 className="size-4" />
          Conteúdo social
        </CardTitle>
        <CardDescription>Gera legenda + call-to-action para um post avulso.</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sc-name">Nome do produto</Label>
          <Input id="sc-name" value={productName} onChange={(e) => setProductName(e.target.value)} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="sc-description">Descrição (opcional)</Label>
          <Textarea
            id="sc-description"
            rows={3}
            value={productDescription}
            onChange={(e) => setProductDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sc-tone">Tom de voz da marca (opcional)</Label>
            <Input
              id="sc-tone"
              value={brandTone}
              onChange={(e) => setBrandTone(e.target.value)}
              placeholder="ex.: descontraído e direto"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="sc-goal">Objetivo</Label>
            <Select value={goal} onValueChange={(v) => setGoal(v as SocialContentGoal)}>
              <SelectTrigger id="sc-goal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {GOAL_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button onClick={handleRun} disabled={action.isLoading} className="w-fit">
          {action.isLoading ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
          Gerar conteúdo
        </Button>
        {action.data && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/30 p-4">
            <p className="whitespace-pre-wrap text-sm">{action.data.caption}</p>
            <p className="text-muted-foreground text-sm">{action.data.callToAction}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Roteiro de conteúdo — exige um produto do catálogo; resolve externalId (Firestore) → productId (Supabase) antes de chamar o Órion. */
function ContentScriptTab() {
  const productsAction = useAsyncAction(listProductOptions);
  const { execute: loadProducts } = productsAction;
  const [selectedExternalId, setSelectedExternalId] = React.useState<string>("");
  const [strategicContext, setStrategicContext] = React.useState("");
  const [brandTone, setBrandTone] = React.useState("");
  const scriptAction = useAsyncAction(generateContentScript);

  React.useEffect(() => {
    void loadProducts();
  }, [loadProducts]);

  const products: ProductOption[] = productsAction.data ?? [];

  async function handleRun() {
    if (!selectedExternalId) {
      toast.error("Selecione um produto.");
      return;
    }
    try {
      const productId = await resolveProductId(selectedExternalId);
      const result = await scriptAction.execute({
        productId,
        strategicContext: strategicContext.trim() || null,
        brandTone: brandTone.trim() || null,
      });
      if (result) {
        toast.success("Roteiro gerado.");
      } else if (scriptAction.error) {
        toast.error(getErrorMessage(scriptAction.error));
      }
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <FileText className="size-4" />
          Roteiro de conteúdo
        </CardTitle>
        <CardDescription>
          Gera roteiro de reels ou post estático para um produto do catálogo — o formato é escolhido pela IA.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-product">Produto</Label>
          <Select value={selectedExternalId} onValueChange={setSelectedExternalId} disabled={productsAction.isLoading}>
            <SelectTrigger id="cs-product">
              <SelectValue placeholder={productsAction.isLoading ? "Carregando..." : "Selecione um produto"} />
            </SelectTrigger>
            <SelectContent>
              {products.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {products.length === 0 && !productsAction.isLoading && (
            <p className="text-muted-foreground text-xs">Nenhum produto no catálogo ainda.</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="cs-context">Contexto estratégico (opcional)</Label>
          <Textarea
            id="cs-context"
            rows={3}
            value={strategicContext}
            onChange={(e) => setStrategicContext(e.target.value)}
            placeholder="ex.: recomendação vigente do diagnóstico estratégico"
          />
        </div>
        <div className="flex flex-col gap-1.5 sm:w-72">
          <Label htmlFor="cs-tone">Tom de voz da marca (opcional)</Label>
          <Input id="cs-tone" value={brandTone} onChange={(e) => setBrandTone(e.target.value)} />
        </div>
        <Button onClick={handleRun} disabled={scriptAction.isLoading} className="w-fit">
          {scriptAction.isLoading ? <Loader2 className="size-4 animate-spin" /> : <FileText className="size-4" />}
          Gerar roteiro
        </Button>
        {scriptAction.data && (
          <div className="flex flex-col gap-3 rounded-lg border bg-muted/30 p-4">
            <div className="flex items-center gap-2">
              <Badge variant="secondary">{CONTENT_SCRIPT_FORMAT_LABEL[scriptAction.data.format]}</Badge>
              <span className="text-muted-foreground text-xs">{scriptAction.data.formatRationale}</span>
            </div>
            {scriptAction.data.scenes.map((scene) => (
              <div key={scene.order} className="rounded-md border p-3 text-sm">
                <p className="font-medium text-xs uppercase tracking-wide">Cena {scene.order}</p>
                {scene.visualDirection && <p className="text-muted-foreground">{scene.visualDirection}</p>}
                <p>{scene.narration}</p>
              </div>
            ))}
            <p className="whitespace-pre-wrap text-sm">{scriptAction.data.caption}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export function SuperCerebroClient() {
  const [instagramDiagnosis, setInstagramDiagnosis] = React.useState("");
  const [adsDiagnosis, setAdsDiagnosis] = React.useState("");

  return (
    <Tabs defaultValue="instagram" className="flex flex-col gap-4">
      <TabsList>
        <TabsTrigger value="instagram">Instagram</TabsTrigger>
        <TabsTrigger value="ads">Ads</TabsTrigger>
        <TabsTrigger value="estrategico">Diagnóstico estratégico</TabsTrigger>
        <TabsTrigger value="conteudo">Conteúdo social</TabsTrigger>
        <TabsTrigger value="roteiro">Roteiro</TabsTrigger>
      </TabsList>
      <TabsContent value="instagram">
        <InstagramDiagnosisTab onDiagnosis={setInstagramDiagnosis} />
      </TabsContent>
      <TabsContent value="ads">
        <AdsDiagnosisTab onDiagnosis={setAdsDiagnosis} />
      </TabsContent>
      <TabsContent value="estrategico">
        <StrategicDiagnosisTab instagramDiagnosis={instagramDiagnosis} adsDiagnosis={adsDiagnosis} />
      </TabsContent>
      <TabsContent value="conteudo">
        <SocialContentTab />
      </TabsContent>
      <TabsContent value="roteiro">
        <ContentScriptTab />
      </TabsContent>
    </Tabs>
  );
}
