"use client";

import * as React from "react";

import { useRouter, useSearchParams } from "next/navigation";

import { AlertTriangle, Camera, CheckCircle2, ExternalLink, LogOut } from "lucide-react";
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
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { useAsyncAction } from "@/hooks/use-async-action";
import { getErrorMessage } from "@/utils/get-error-message";

import { disconnectInstagram, fetchInstagramConnection } from "./instagram-api";

function formatExpiryDate(iso: string | undefined): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" });
}

export function InstagramClient() {
  const router = useRouter();
  const { replace } = router;
  const searchParams = useSearchParams();
  const statusAction = useAsyncAction(fetchInstagramConnection);
  const { execute: load } = statusAction;
  const disconnectAction = useAsyncAction(disconnectInstagram);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  React.useEffect(() => {
    void load();
  }, [load]);

  // Trata a volta do callback OAuth do Órion (redirect com query params —
  // ver instagram-oauth-routes.ts no Órion). Limpa a URL depois de ler,
  // para não reexibir o toast num refresh da página.
  React.useEffect(() => {
    const connectedUsername = searchParams.get("instagram_connected");
    const error = searchParams.get("instagram_error");

    if (connectedUsername) {
      toast.success(`Instagram conectado: @${connectedUsername}`);
      void load();
      replace("/dashboard/orion/instagram");
    } else if (error) {
      const message =
        error === "authorization_denied" ? "Conexão cancelada." : "Não foi possível conectar o Instagram agora.";
      toast.error(message);
      replace("/dashboard/orion/instagram");
    }
  }, [searchParams, load, replace]);

  async function handleDisconnect() {
    const result = await disconnectAction.execute();
    if (result !== undefined) {
      toast.success("Instagram desconectado.");
      setConfirmOpen(false);
      void load();
    } else if (disconnectAction.error) {
      toast.error(getErrorMessage(disconnectAction.error));
    }
  }

  if (statusAction.isLoading || (!statusAction.data && !statusAction.error)) {
    return <Skeleton className="h-56 w-full rounded-xl" />;
  }

  if (statusAction.error && !statusAction.data) {
    return <p className="py-8 text-center text-muted-foreground text-sm">{statusAction.error}</p>;
  }

  const status = statusAction.data;
  const expiry = formatExpiryDate(status?.tokenExpiresAt);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Camera className="size-4" />
          Conta conectada
        </CardTitle>
        <CardDescription>
          A conexão autoriza o Órion a ler mensagens diretas e comentários e responder em nome desta conta.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {status?.connected ? (
          <div className="flex flex-col gap-4">
            <div className="flex items-center justify-between gap-4 rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-full bg-muted">
                  <Camera className="size-4" />
                </div>
                <div>
                  <p className="font-medium text-sm">{status.username ? `@${status.username}` : status.igUserId}</p>
                  <div className="mt-0.5 flex items-center gap-1.5 text-muted-foreground text-xs">
                    <CheckCircle2 className="size-3.5 text-emerald-500" />
                    Conectado{expiry ? ` · token válido até ${expiry}` : ""}
                  </div>
                </div>
              </div>
              <Badge variant="outline">Ativo</Badge>
            </div>

            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setConfirmOpen(true)}>
                <LogOut className="size-4" />
                Desconectar
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-4 py-6 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <Camera className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="font-medium text-sm">Nenhuma conta conectada</p>
              <p className="max-w-sm text-muted-foreground text-xs">
                Conecte uma conta Instagram Business ou Creator para ativar o atendimento automático de DMs e
                comentários.
              </p>
            </div>
            <Button asChild>
              <a href="/api/integrations/orion/instagram/oauth-start">
                <ExternalLink className="size-4" />
                Conectar com Instagram
              </a>
            </Button>
          </div>
        )}
      </CardContent>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <AlertTriangle className="size-4 text-destructive" />
              Desconectar Instagram?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O bot para de responder mensagens e comentários desta conta imediatamente. Você pode reconectar quando
              quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={disconnectAction.isLoading}
              onClick={(e) => {
                e.preventDefault();
                void handleDisconnect();
              }}
            >
              {disconnectAction.isLoading ? "Desconectando..." : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
