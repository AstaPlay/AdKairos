"use client";

import * as React from "react";

import { MessageCircle, MessagesSquare, Send } from "lucide-react";
import { FaInstagram } from "react-icons/fa";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncAction } from "@/hooks/use-async-action";

interface TicketRow {
  id: string;
  channel: "whatsapp" | "instagram";
  customerId: string;
  reason: "frustration_detected" | "customer_requested";
  customerName: string | null;
  conversationSnippet: string;
  status: "open" | "resolved";
  createdAt: string;
}

async function fetchEscaladas(): Promise<TicketRow[]> {
  const response = await fetch("/api/integrations/orion/escaladas");
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível buscar a fila de escaladas agora.");
  return json.tickets as TicketRow[];
}

async function sendReply(ticketId: string, text: string): Promise<void> {
  const response = await fetch(`/api/integrations/orion/escaladas/${encodeURIComponent(ticketId)}/reply`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const json = await response.json();
  if (!json.success) throw new Error(json.error?.message ?? "Não foi possível enviar a resposta agora.");
}

function formatDate(iso: string) {
  try {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function ChannelIcon({ channel }: { channel: TicketRow["channel"] }) {
  if (channel === "instagram") return <FaInstagram className="size-4 text-muted-foreground" />;
  return <MessageCircle className="size-4 text-muted-foreground" />;
}

function ReasonBadge({ reason }: { reason: TicketRow["reason"] }) {
  if (reason === "frustration_detected") {
    return <Badge variant="destructive">Cliente frustrado</Badge>;
  }
  return <Badge variant="outline">Pediu atendente</Badge>;
}

/**
 * Popover de resposta por linha — abre um textarea, chama `sendReply`
 * e, em sucesso, avisa o pai via `onSent` para remover o ticket da
 * lista local (a fila só lista `open`; depois de responder, o Órion já
 * marcou como `resolved`, então recarregar a lista inteira não é
 * necessário — só tirar essa linha localmente).
 */
function ReplyPopover({ ticket, onSent }: { ticket: TicketRow; onSent: (ticketId: string) => void }) {
  const [open, setOpen] = React.useState(false);
  const [text, setText] = React.useState("");
  const replyAction = useAsyncAction((value: string) => sendReply(ticket.id, value));

  async function handleSend() {
    if (text.trim().length === 0) return;
    const result = await replyAction.execute(text.trim());
    if (result !== null) {
      setOpen(false);
      setText("");
      onSent(ticket.id);
    }
  }

  return (
    <Popover
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) replyAction.reset();
      }}
    >
      <PopoverTrigger asChild>
        <Button size="sm" variant="outline">
          Responder
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="flex flex-col gap-2">
          <Textarea
            placeholder="Escreva a resposta para o cliente..."
            value={text}
            onChange={(event) => setText(event.target.value)}
            disabled={replyAction.isLoading}
          />
          {replyAction.error && <p className="text-destructive text-xs">{replyAction.error}</p>}
          <Button
            size="sm"
            onClick={() => void handleSend()}
            disabled={replyAction.isLoading || text.trim().length === 0}
          >
            <Send className="size-4" />
            Enviar
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

/**
 * Fila de escaladas do Órion. Cada linha tem um botão "Responder" que
 * consome `POST /integrations/human-handoff/tickets/:id/reply` (via
 * proxy `/api/integrations/orion/escaladas/[id]/reply`) — o Órion
 * aplica um prefixo fixo à mensagem, envia ao cliente no canal
 * original e marca o ticket como `resolved`. O provisionamento de
 * owner (primeira conexão AdKairos <-> Órion de uma conta) é
 * transparente: acontece dentro de `fetchOpenHandoffTickets`/
 * `replyToHandoffTicket` no servidor, esta tela nunca sabe que ele
 * existe.
 */
export function EscaladasClient() {
  const ticketsAction = useAsyncAction(fetchEscaladas);
  const { execute: loadTickets } = ticketsAction;
  const [resolvedIds, setResolvedIds] = React.useState<Set<string>>(new Set());

  React.useEffect(() => {
    void loadTickets();
  }, [loadTickets]);

  const tickets = (ticketsAction.data ?? null)?.filter((ticket) => !resolvedIds.has(ticket.id)) ?? null;

  function handleReplySent(ticketId: string) {
    setResolvedIds((previous) => new Set(previous).add(ticketId));
  }

  return (
    <div className="flex flex-col gap-4">
      {ticketsAction.isLoading && (
        <div className="flex flex-col gap-2">
          {["sk-1", "sk-2", "sk-3", "sk-4"].map((skeletonKey) => (
            <Skeleton key={skeletonKey} className="h-16 w-full" />
          ))}
        </div>
      )}

      {ticketsAction.error && !ticketsAction.isLoading && (
        <p className="py-8 text-center text-muted-foreground text-sm">{ticketsAction.error}</p>
      )}

      {!ticketsAction.isLoading && !ticketsAction.error && tickets && tickets.length > 0 && (
        <Card className="py-0">
          <CardContent className="px-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Canal</TableHead>
                  <TableHead>Cliente</TableHead>
                  <TableHead>Motivo</TableHead>
                  <TableHead>Última mensagem</TableHead>
                  <TableHead className="whitespace-nowrap">Escalado em</TableHead>
                  <TableHead className="text-right">Ação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {tickets.map((ticket) => (
                  <TableRow key={ticket.id}>
                    <TableCell>
                      <ChannelIcon channel={ticket.channel} />
                    </TableCell>
                    <TableCell className="font-medium">{ticket.customerName ?? ticket.customerId}</TableCell>
                    <TableCell>
                      <ReasonBadge reason={ticket.reason} />
                    </TableCell>
                    <TableCell className="max-w-80 truncate" title={ticket.conversationSnippet}>
                      {ticket.conversationSnippet}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {formatDate(ticket.createdAt)}
                    </TableCell>
                    <TableCell className="text-right">
                      <ReplyPopover ticket={ticket} onSent={handleReplySent} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {!ticketsAction.isLoading && !ticketsAction.error && tickets && tickets.length === 0 && (
        <Empty className="rounded-lg border border-dashed py-16">
          <EmptyHeader>
            <EmptyMedia variant="icon">
              <MessagesSquare />
            </EmptyMedia>
            <EmptyTitle>Nenhuma escalada em aberto</EmptyTitle>
            <EmptyDescription>
              Quando o assistente automático passar uma conversa para atendimento humano, ela aparece aqui.
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      )}
    </div>
  );
}
