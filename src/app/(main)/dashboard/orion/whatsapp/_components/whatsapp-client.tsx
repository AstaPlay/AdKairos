"use client";

import * as React from "react";

import { History, KeyRound, MessageCircle, Plus, QrCode, RefreshCw, Smartphone } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAsyncAction } from "@/hooks/use-async-action";

type SessionStatus = "PENDING_QR" | "CONNECTING" | "CONNECTED" | "DISCONNECTED" | "LOGGED_OUT" | "BANNED" | "CORRUPTED";

interface SessionSummary {
  id: string;
  status: SessionStatus;
  ownerPhoneNumber: string | null;
  createdAt: string;
  metadata: {
    deviceName?: string;
    lastConnectedAt?: string;
    reconnectAttempts: number;
    maxReconnectAttempts: number;
  };
}

interface SessionDetail extends SessionSummary {
  qrCode: string | null;
  pairingCode: string | null;
}

type SentMessageJobStatus = "pending" | "processing" | "done" | "failed";

interface SentMessage {
  id: string;
  toJid: string;
  type: "text" | "image" | "video" | "document" | "audio" | "contact" | "location" | "buttons";
  status: SentMessageJobStatus;
  lastError: string | null;
  createdAt: string;
  processedAt: string | null;
}

async function fetchSessions(): Promise<SessionSummary[]> {
  const response = await fetch("/api/integrations/orion/whatsapp/sessions");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar as sessões agora.");
  return json.sessions as SessionSummary[];
}

async function createSession(): Promise<{ id: string; status: SessionStatus }> {
  const response = await fetch("/api/integrations/orion/whatsapp/sessions", { method: "POST" });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível criar a sessão agora.");
  return json.session as { id: string; status: SessionStatus };
}

async function connectSession(sessionId: string, phoneNumber?: string): Promise<void> {
  const response = await fetch(`/api/integrations/orion/whatsapp/sessions/${encodeURIComponent(sessionId)}/connect`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(phoneNumber ? { phoneNumber } : {}),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível conectar a sessão agora.");
}

async function fetchSessionDetail(sessionId: string): Promise<SessionDetail> {
  const response = await fetch(`/api/integrations/orion/whatsapp/sessions/${encodeURIComponent(sessionId)}`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar o status da sessão agora.");
  return json.session as SessionDetail;
}

async function fetchSentMessages(sessionId: string): Promise<SentMessage[]> {
  const response = await fetch(`/api/integrations/orion/whatsapp/sessions/${encodeURIComponent(sessionId)}/messages`);
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar o histórico de mensagens agora.");
  return json.messages as SentMessage[];
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

const STATUS_LABEL: Record<SessionStatus, string> = {
  PENDING_QR: "Aguardando pareamento",
  CONNECTING: "Conectando",
  CONNECTED: "Conectado",
  DISCONNECTED: "Desconectado",
  LOGGED_OUT: "Desconectado (logout)",
  BANNED: "Banido",
  CORRUPTED: "Erro — reconectar",
};

function StatusBadge({ status }: { status: SessionStatus }) {
  if (status === "CONNECTED") {
    return (
      <Badge
        className="border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
        variant="outline"
      >
        <span className="mr-1 size-1.5 rounded-full bg-emerald-500" />
        {STATUS_LABEL[status]}
      </Badge>
    );
  }
  if (status === "PENDING_QR" || status === "CONNECTING") {
    return (
      <Badge className="border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-400" variant="outline">
        <Spinner className="mr-1 size-3" />
        {STATUS_LABEL[status]}
      </Badge>
    );
  }
  if (status === "BANNED" || status === "CORRUPTED") {
    return <Badge variant="destructive">{STATUS_LABEL[status]}</Badge>;
  }
  return <Badge variant="secondary">{STATUS_LABEL[status]}</Badge>;
}

/**
 * Conteúdo do modal de pareamento: QR code (padrão) ou código de
 * pareamento por telefone, em abas. Faz polling de `GET /sessions/:id`
 * a cada 2.5s enquanto o status ainda não é CONNECTED — é assim que a
 * UI descobre que o QR foi escaneado, já que não há webhook para o
 * front. Para de fazer polling assim que conectar ou quando o modal
 * fecha (limpo pelo `onOpenChange` do Dialog no componente pai).
 */
function PairingPanel({ sessionId, onConnected }: { sessionId: string; onConnected: () => void }) {
  const [mode, setMode] = React.useState<"qr" | "phone">("qr");
  const [phoneNumber, setPhoneNumber] = React.useState("");
  const [detail, setDetail] = React.useState<SessionDetail | null>(null);
  const [pollError, setPollError] = React.useState<string | null>(null);
  const connectAction = useAsyncAction((phone?: string) => connectSession(sessionId, phone));

  const { execute: startConnect } = connectAction;
  React.useEffect(() => {
    void startConnect();
  }, [startConnect]);

  React.useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      try {
        const next = await fetchSessionDetail(sessionId);
        if (cancelled) return;
        setDetail(next);
        setPollError(null);
        if (next.status === "CONNECTED") {
          onConnected();
          return;
        }
      } catch (error) {
        if (!cancelled) setPollError(error instanceof Error ? error.message : "Falha ao atualizar status.");
      }
      if (!cancelled) timer = setTimeout(() => void poll(), 2500);
    }

    void poll();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId, onConnected]);

  async function handleRequestPairingCode() {
    if (phoneNumber.trim().length === 0) return;
    await connectAction.execute(phoneNumber.trim());
  }

  return (
    <div className="flex flex-col gap-4">
      <Tabs value={mode} onValueChange={(value) => setMode(value as "qr" | "phone")}>
        <TabsList className="w-full">
          <TabsTrigger value="qr" className="flex-1 gap-1.5">
            <QrCode className="size-3.5" />
            QR Code
          </TabsTrigger>
          <TabsTrigger value="phone" className="flex-1 gap-1.5">
            <KeyRound className="size-3.5" />
            Código de pareamento
          </TabsTrigger>
        </TabsList>

        <TabsContent value="qr" className="flex flex-col items-center gap-3 py-4">
          {detail?.qrCode ? (
            <div className="rounded-xl border bg-white p-4">
              <QRCodeSVG value={detail.qrCode} size={220} marginSize={0} />
            </div>
          ) : (
            <div className="flex size-[252px] flex-col items-center justify-center gap-2 rounded-xl border border-dashed text-muted-foreground">
              <Spinner className="size-5" />
              <span className="text-xs">Gerando QR Code…</span>
            </div>
          )}
          <p className="max-w-72 text-center text-muted-foreground text-xs">
            Abra o WhatsApp no celular → Aparelhos conectados → Conectar um aparelho, e escaneie o código acima.
          </p>
        </TabsContent>

        <TabsContent value="phone" className="flex flex-col gap-3 py-4">
          {detail?.pairingCode ? (
            <div className="flex flex-col items-center gap-2 py-4">
              <span className="font-mono text-3xl tracking-[0.3em]">{detail.pairingCode}</span>
              <p className="text-center text-muted-foreground text-xs">
                No WhatsApp: Aparelhos conectados → Conectar com número de telefone, e digite o código acima.
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-2">
              <Label htmlFor="pairing-phone">Número do WhatsApp (com DDI e DDD)</Label>
              <div className="flex gap-2">
                <Input
                  id="pairing-phone"
                  placeholder="5511999999999"
                  value={phoneNumber}
                  onChange={(event) => setPhoneNumber(event.target.value.replace(/\D/g, ""))}
                  disabled={connectAction.isLoading}
                />
                <Button
                  onClick={() => void handleRequestPairingCode()}
                  disabled={connectAction.isLoading || phoneNumber.trim().length === 0}
                >
                  {connectAction.isLoading ? <Spinner className="size-4" /> : "Gerar código"}
                </Button>
              </div>
              <p className="text-muted-foreground text-xs">
                Somente números, sem espaços ou símbolos — ex.: 5511999999999.
              </p>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {(connectAction.error ?? pollError) && (
        <p className="text-center text-destructive text-xs">{connectAction.error ?? pollError}</p>
      )}

      {detail && detail.status !== "PENDING_QR" && detail.status !== "CONNECTING" && detail.status !== "CONNECTED" && (
        <p className="text-center text-muted-foreground text-xs">
          Status atual: {STATUS_LABEL[detail.status]}. Feche e tente conectar novamente.
        </p>
      )}
    </div>
  );
}

const MESSAGE_STATUS_LABEL: Record<SentMessageJobStatus, string> = {
  pending: "Na fila",
  processing: "Enviando",
  done: "Entregue ao worker",
  failed: "Falhou",
};

const MESSAGE_TYPE_LABEL: Record<SentMessage["type"], string> = {
  text: "Texto",
  image: "Imagem",
  video: "Vídeo",
  document: "Documento",
  audio: "Áudio",
  contact: "Contato",
  location: "Localização",
  buttons: "Botões",
};

function MessageStatusBadge({ status }: { status: SentMessageJobStatus }) {
  if (status === "done") {
    return (
      <Badge
        className="border-emerald-600/20 bg-emerald-600/10 text-emerald-700 dark:text-emerald-400"
        variant="outline"
      >
        {MESSAGE_STATUS_LABEL[status]}
      </Badge>
    );
  }
  if (status === "failed") {
    return <Badge variant="destructive">{MESSAGE_STATUS_LABEL[status]}</Badge>;
  }
  if (status === "processing") {
    return (
      <Badge className="border-amber-600/20 bg-amber-600/10 text-amber-700 dark:text-amber-400" variant="outline">
        <Spinner className="mr-1 size-3" />
        {MESSAGE_STATUS_LABEL[status]}
      </Badge>
    );
  }
  return <Badge variant="secondary">{MESSAGE_STATUS_LABEL[status]}</Badge>;
}

/**
 * Painel lateral com o histórico de envios de uma sessão — lê a fila
 * `whatsapp_jobs` do Órion filtrada por `type: 'send-message'`. "done"
 * aqui significa que o job foi entregue ao socket Baileys do worker,
 * não que o WhatsApp confirmou o recebimento no aparelho do cliente
 * (o Órion não expõe recibo de leitura/entrega ainda).
 */
function MessageHistorySheet({
  sessionId,
  open,
  onOpenChange,
}: {
  sessionId: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const messagesAction = useAsyncAction((id: string) => fetchSentMessages(id));
  const { execute: loadMessages } = messagesAction;

  React.useEffect(() => {
    if (open && sessionId) void loadMessages(sessionId);
  }, [open, sessionId, loadMessages]);

  const messages = messagesAction.data ?? null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Histórico de envios</SheetTitle>
          <SheetDescription>Últimas mensagens enviadas por essa sessão, mais recentes primeiro.</SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {messagesAction.isLoading && (
            <div className="flex flex-col gap-2">
              {["m-1", "m-2", "m-3"].map((key) => (
                <Skeleton key={key} className="h-14 w-full" />
              ))}
            </div>
          )}

          {messagesAction.error && !messagesAction.isLoading && (
            <p className="py-8 text-center text-muted-foreground text-sm">{messagesAction.error}</p>
          )}

          {!messagesAction.isLoading && !messagesAction.error && messages && messages.length === 0 && (
            <Empty className="rounded-lg border border-dashed py-12">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <History />
                </EmptyMedia>
                <EmptyTitle>Nenhuma mensagem enviada</EmptyTitle>
                <EmptyDescription>
                  Quando o bot ou um atendente enviar algo por essa sessão, aparece aqui.
                </EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}

          {!messagesAction.isLoading &&
            !messagesAction.error &&
            messages &&
            messages.length > 0 &&
            messages.map((message) => (
              <div key={message.id} className="flex flex-col gap-1 rounded-lg border p-3 text-sm">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium">{message.toJid.replace("@s.whatsapp.net", "")}</span>
                  <MessageStatusBadge status={message.status} />
                </div>
                <div className="flex items-center justify-between gap-2 text-muted-foreground text-xs">
                  <span>{MESSAGE_TYPE_LABEL[message.type]}</span>
                  <span>{formatDate(message.createdAt)}</span>
                </div>
                {message.status === "failed" && message.lastError && (
                  <p className="text-destructive text-xs">{message.lastError}</p>
                )}
              </div>
            ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function NewSessionDialog({
  open,
  onOpenChange,
  onConnected,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onConnected: () => void;
}) {
  const [sessionId, setSessionId] = React.useState<string | null>(null);
  const createAction = useAsyncAction(createSession);
  const { execute: startCreate, reset: resetCreate } = createAction;

  React.useEffect(() => {
    if (!open) {
      setSessionId(null);
      resetCreate();
      return;
    }
    void startCreate().then((result) => {
      if (result) setSessionId(result.id);
    });
  }, [open, startCreate, resetCreate]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Conectar novo número</DialogTitle>
          <DialogDescription>
            Escaneie o QR Code ou use um código de pareamento pelo número do WhatsApp.
          </DialogDescription>
        </DialogHeader>

        {createAction.isLoading && (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-5" />
          </div>
        )}

        {createAction.error && <p className="py-4 text-center text-destructive text-sm">{createAction.error}</p>}

        {sessionId && !createAction.isLoading && (
          <PairingPanel
            sessionId={sessionId}
            onConnected={() => {
              onConnected();
              onOpenChange(false);
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

/**
 * Tela de sessões WhatsApp do Órion. Lista sessões existentes (qualquer
 * status) e permite abrir uma nova via QR Code ou código de pareamento.
 * Nenhuma chamada fala com o Órion diretamente — tudo passa pelos
 * proxies autenticados em `/api/integrations/orion/whatsapp/*`, que
 * trocam a sessão Firebase pelo uid que o Órion entende.
 *
 * O botão "Histórico" de cada linha abre o painel de mensagens
 * enviadas por aquela sessão (fila `whatsapp_jobs` do Órion, filtrada
 * por sessionId) — envio em si continua sem tela própria, já que
 * ainda não há um fluxo de composição de mensagem no AdKairos, só o
 * bot/atendimento enfileiram envios hoje.
 */
export function WhatsAppClient() {
  const sessionsAction = useAsyncAction(fetchSessions);
  const { execute: loadSessions } = sessionsAction;
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [reconnectId, setReconnectId] = React.useState<string | null>(null);
  const reconnectAction = useAsyncAction((id: string) => connectSession(id));
  const [historySessionId, setHistorySessionId] = React.useState<string | null>(null);

  React.useEffect(() => {
    void loadSessions();
  }, [loadSessions]);

  const sessions = sessionsAction.data ?? null;

  async function handleReconnect(id: string) {
    setReconnectId(id);
    const result = await reconnectAction.execute(id);
    if (result !== null) setDialogOpen(true);
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-end">
        <Button onClick={() => setDialogOpen(true)} className="gap-1.5">
          <Plus className="size-4" />
          Conectar número
        </Button>
      </div>

      {sessionsAction.isLoading && (
        <div className="flex flex-col gap-2">
          {["sk-1", "sk-2"].map((key) => (
            <Skeleton key={key} className="h-16 w-full" />
          ))}
        </div>
      )}

      {sessionsAction.error && !sessionsAction.isLoading && (
        <p className="py-8 text-center text-muted-foreground text-sm">{sessionsAction.error}</p>
      )}

      {!sessionsAction.isLoading && !sessionsAction.error && sessions && sessions.length > 0 && (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Número</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Dispositivo</TableHead>
                  <TableHead className="whitespace-nowrap">Criado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sessions.map((session) => (
                  <TableRow key={session.id}>
                    <TableCell className="font-medium">
                      <span className="flex items-center gap-1.5">
                        <Smartphone className="size-3.5 text-muted-foreground" />
                        {session.ownerPhoneNumber ?? "—"}
                      </span>
                    </TableCell>
                    <TableCell>
                      <StatusBadge status={session.status} />
                    </TableCell>
                    <TableCell className="text-muted-foreground">{session.metadata.deviceName ?? "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(session.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button size="sm" variant="ghost" onClick={() => setHistorySessionId(session.id)}>
                          <History className="size-3.5" />
                          Histórico
                        </Button>
                        {session.status !== "CONNECTED" && session.status !== "CONNECTING" && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleReconnect(session.id)}
                            disabled={reconnectAction.isLoading && reconnectId === session.id}
                          >
                            <RefreshCw className="size-3.5" />
                            Reconectar
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!sessionsAction.isLoading && !sessionsAction.error && sessions && sessions.length === 0 && (
        <Empty className="rounded-lg border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessageCircle />
            </EmptyMedia>
            <EmptyTitle>Nenhum número conectado</EmptyTitle>
            <EmptyDescription>Conecte um número do WhatsApp para o Órion começar a atender pelo bot.</EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}

      <NewSessionDialog open={dialogOpen} onOpenChange={setDialogOpen} onConnected={() => void loadSessions()} />

      <MessageHistorySheet
        sessionId={historySessionId}
        open={historySessionId !== null}
        onOpenChange={(nextOpen) => {
          if (!nextOpen) setHistorySessionId(null);
        }}
      />
    </div>
  );
}
