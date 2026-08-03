"use client";

import * as React from "react";

import { Clock, MessagesSquare, Save, Shield, Sparkles, TrendingUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncAction } from "@/hooks/use-async-action";
import { getErrorMessage } from "@/utils/get-error-message";

import { fetchBotConfig, saveBotConfig } from "./bot-config-api";
import type { BotConfigFormState } from "./types";

const TIMEZONES = ["America/Sao_Paulo", "America/Manaus", "America/Rio_Branco", "America/Fortaleza", "America/Noronha"];

function hoursArray(): number[] {
  return Array.from({ length: 24 }, (_, hour) => hour);
}

/** Converte a config vinda do Órion para o estado local do form (campos numéricos como number, textos como string — sem transformação de shape, é 1:1). */
function toFormState(config: BotConfigFormState): BotConfigFormState {
  return { ...config };
}

export function AtendimentoClient() {
  const loadAction = useAsyncAction(fetchBotConfig);
  const { execute: load } = loadAction;
  const saveAction = useAsyncAction(saveBotConfig);

  const [form, setForm] = React.useState<BotConfigFormState | null>(null);
  const [keywordsInput, setKeywordsInput] = React.useState("");

  React.useEffect(() => {
    void load();
  }, [load]);

  React.useEffect(() => {
    if (loadAction.data && !form) {
      setForm(toFormState(loadAction.data));
      setKeywordsInput(loadAction.data.triggerKeywords.join(", "));
    }
  }, [loadAction.data, form]);

  function update<K extends keyof BotConfigFormState>(key: K, value: BotConfigFormState[K]) {
    setForm((previous) => (previous ? { ...previous, [key]: value } : previous));
  }

  async function handleSave() {
    if (!form) return;

    if (form.businessHoursStart === form.businessHoursEnd) {
      toast.error("Horário de início e fim não podem ser iguais.");
      return;
    }

    const triggerKeywords = keywordsInput
      .split(",")
      .map((keyword) => keyword.trim())
      .filter((keyword) => keyword.length > 0);

    const result = await saveAction.execute({ ...form, triggerKeywords });
    if (result) {
      setForm(toFormState(result));
      setKeywordsInput(result.triggerKeywords.join(", "));
      toast.success("Configuração do bot salva com sucesso.");
    } else if (saveAction.error) {
      toast.error(getErrorMessage(saveAction.error));
    }
  }

  if (loadAction.isLoading || (!form && !loadAction.error)) {
    return (
      <div className="flex flex-col gap-4">
        {["sk-1", "sk-2", "sk-3"].map((key) => (
          <Skeleton key={key} className="h-48 w-full rounded-xl" />
        ))}
      </div>
    );
  }

  if (loadAction.error && !form) {
    return <p className="py-8 text-center text-muted-foreground text-sm">{loadAction.error}</p>;
  }

  if (!form) return null;

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="size-4" />
            Persona e gatilhos
          </CardTitle>
          <CardDescription>Como o bot se apresenta e quando ele entra em ação numa conversa nova.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="isActive">Automação ativa</Label>
              <p className="text-muted-foreground text-xs">
                Com o bot desligado, nenhuma mensagem é respondida automaticamente.
              </p>
            </div>
            <Switch id="isActive" checked={form.isActive} onCheckedChange={(checked) => update("isActive", checked)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="agentName">Nome do agente</Label>
              <Input
                id="agentName"
                value={form.agentName}
                onChange={(e) => update("agentName", e.target.value)}
                placeholder="Marcos"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="triggerKeywords">Palavras-chave de gatilho</Label>
              <Input
                id="triggerKeywords"
                value={keywordsInput}
                onChange={(e) => setKeywordsInput(e.target.value)}
                placeholder="produto, comprar, preço"
              />
              <p className="text-muted-foreground text-xs">
                Separadas por vírgula. Só ativa a automação numa conversa nova se a mensagem contiver alguma.
              </p>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="isBotReply">Resposta quando perguntam se é robô</Label>
            <Textarea
              id="isBotReply"
              value={form.isBotReply}
              onChange={(e) => update("isBotReply", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="audioFallbackReply">Resposta quando não consegue transcrever um áudio</Label>
            <Textarea
              id="audioFallbackReply"
              value={form.audioFallbackReply}
              onChange={(e) => update("audioFallbackReply", e.target.value)}
              rows={2}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="extraInstructions">Instrução extra de tom/estilo (opcional)</Label>
            <Textarea
              id="extraInstructions"
              value={form.extraInstructions ?? ""}
              onChange={(e) => update("extraInstructions", e.target.value.length > 0 ? e.target.value : null)}
              rows={3}
              placeholder="Ex.: fale de forma descontraída, use emojis com moderação..."
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Clock className="size-4" />
            Horário de funcionamento
          </CardTitle>
          <CardDescription>
            Fora dessa janela o bot fica em silêncio — a conversa espera até a reabertura.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="businessHoursStart">Início</Label>
              <select
                id="businessHoursStart"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.businessHoursStart}
                onChange={(e) => update("businessHoursStart", Number(e.target.value))}
              >
                {hoursArray().map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="businessHoursEnd">Fim</Label>
              <select
                id="businessHoursEnd"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.businessHoursEnd}
                onChange={(e) => update("businessHoursEnd", Number(e.target.value))}
              >
                {hoursArray().map((hour) => (
                  <option key={hour} value={hour}>
                    {String(hour).padStart(2, "0")}:00
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="businessTimezone">Fuso horário</Label>
              <select
                id="businessTimezone"
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                value={form.businessTimezone}
                onChange={(e) => update("businessTimezone", e.target.value)}
              >
                {TIMEZONES.map((tz) => (
                  <option key={tz} value={tz}>
                    {tz}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="shadowMode">Modo sombra</Label>
              <p className="text-muted-foreground text-xs">
                O bot gera a resposta e grava no log de auditoria, mas não envia de verdade — útil para testar antes de
                ativar.
              </p>
            </div>
            <Switch
              id="shadowMode"
              checked={form.shadowMode}
              onCheckedChange={(checked) => update("shadowMode", checked)}
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <TrendingUp className="size-4" />
            Vendas, descontos e reativação
          </CardTitle>
          <CardDescription>Autonomia do bot em negociação e follow-up de leads e carrinhos parados.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="maxAutonomousDiscountPercent">Desconto autônomo máximo (%)</Label>
              <Input
                id="maxAutonomousDiscountPercent"
                type="number"
                min={0}
                max={100}
                value={form.maxAutonomousDiscountPercent}
                onChange={(e) => update("maxAutonomousDiscountPercent", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retryLimit">Tentativas de follow-up</Label>
              <Input
                id="retryLimit"
                type="number"
                min={0}
                max={10}
                value={form.retryLimit}
                onChange={(e) => update("retryLimit", Number(e.target.value))}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="retryIntervalHours">Intervalo entre tentativas (h)</Label>
              <Input
                id="retryIntervalHours"
                type="number"
                min={1}
                max={168}
                value={form.retryIntervalHours}
                onChange={(e) => update("retryIntervalHours", Number(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="objectionPlaybook">Playbook de objeções (opcional)</Label>
            <Textarea
              id="objectionPlaybook"
              value={form.objectionPlaybook ?? ""}
              onChange={(e) => update("objectionPlaybook", e.target.value.length > 0 ? e.target.value : null)}
              rows={3}
              placeholder="Respostas prontas para objeções comuns — vira contexto extra pra IA, como um FAQ."
            />
          </div>

          <Separator />

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="reactivationEnabled">Reativação de lead frio</Label>
              <p className="text-muted-foreground text-xs">
                Manda uma mensagem de reengajamento após dias de inatividade.
              </p>
            </div>
            <Switch
              id="reactivationEnabled"
              checked={form.reactivationEnabled}
              onCheckedChange={(checked) => update("reactivationEnabled", checked)}
            />
          </div>
          {form.reactivationEnabled && (
            <div className="grid gap-4 pl-1 sm:grid-cols-[140px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="reactivationInactiveDays">Dias de inatividade</Label>
                <Input
                  id="reactivationInactiveDays"
                  type="number"
                  min={1}
                  max={365}
                  value={form.reactivationInactiveDays}
                  onChange={(e) => update("reactivationInactiveDays", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="reactivationMessage">Mensagem de reativação</Label>
                <Input
                  id="reactivationMessage"
                  value={form.reactivationMessage}
                  onChange={(e) => update("reactivationMessage", e.target.value)}
                />
              </div>
            </div>
          )}

          <Separator />

          <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
            <div className="space-y-0.5">
              <Label htmlFor="checkoutAbandonedFollowUpEnabled">Reengajamento de checkout abandonado</Label>
              <p className="text-muted-foreground text-xs">
                Prazo separado da reativação de lead frio, pensado para ser mais urgente.
              </p>
            </div>
            <Switch
              id="checkoutAbandonedFollowUpEnabled"
              checked={form.checkoutAbandonedFollowUpEnabled}
              onCheckedChange={(checked) => update("checkoutAbandonedFollowUpEnabled", checked)}
            />
          </div>
          {form.checkoutAbandonedFollowUpEnabled && (
            <div className="grid gap-4 pl-1 sm:grid-cols-[140px_1fr]">
              <div className="space-y-1.5">
                <Label htmlFor="checkoutAbandonedFollowUpDays">Dias após abandono</Label>
                <Input
                  id="checkoutAbandonedFollowUpDays"
                  type="number"
                  min={1}
                  max={30}
                  value={form.checkoutAbandonedFollowUpDays}
                  onChange={(e) => update("checkoutAbandonedFollowUpDays", Number(e.target.value))}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="checkoutAbandonedFollowUpMessage">Mensagem de reengajamento</Label>
                <Input
                  id="checkoutAbandonedFollowUpMessage"
                  value={form.checkoutAbandonedFollowUpMessage}
                  onChange={(e) => update("checkoutAbandonedFollowUpMessage", e.target.value)}
                />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Shield className="size-4" />
            Segurança em comentários públicos
          </CardTitle>
          <CardDescription>
            Evita que o bot "martele" a mesma resposta pública repetidas vezes para o mesmo autor.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-w-xs space-y-1.5">
            <Label htmlFor="maxRepeatedCommentRepliesPerAuthor">Limite de respostas repetidas por autor</Label>
            <Input
              id="maxRepeatedCommentRepliesPerAuthor"
              type="number"
              min={0}
              max={20}
              value={form.maxRepeatedCommentRepliesPerAuthor}
              onChange={(e) => update("maxRepeatedCommentRepliesPerAuthor", Number(e.target.value))}
            />
            <p className="text-muted-foreground text-xs">
              Comentários com conteúdo novo continuam sendo respondidos normalmente — o limite vale só para a mesma
              resposta repetida.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-dashed">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <MessagesSquare className="size-4" />
            Roteamento e menu de botões
          </CardTitle>
          <CardDescription>Comportamento fixo do bot — não editável por aqui.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline">Detecção de frustração → escala para humano</Badge>
          <Badge variant="outline">Pedido de atendente → escala para humano</Badge>
          <Badge variant="outline">Pergunta sobre pedido → consulta de rastreio</Badge>
          <Badge variant="outline">Menu: produtos, fechar pedido, falar com atendente</Badge>
        </CardContent>
      </Card>

      <div className="sticky bottom-4 flex justify-end">
        <Button onClick={() => void handleSave()} disabled={saveAction.isLoading} size="lg" className="shadow-lg">
          <Save className="size-4" />
          {saveAction.isLoading ? "Salvando..." : "Salvar configuração"}
        </Button>
      </div>
    </div>
  );
}
