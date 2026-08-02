"use client";

import * as React from "react";

import { Loader2, ShieldCheck, Sparkles } from "lucide-react";

import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

export interface ConnectionStatus {
  connected: boolean;
  email: string | null;
}

export function CatalogConnectCard({
  onConnected,
  isCheckingStatus,
}: {
  onConnected: (status: ConnectionStatus) => void;
  isCheckingStatus: boolean;
}) {
  const [email, setEmail] = React.useState("");
  const [senha, setSenha] = React.useState("");
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/integrations/kaiross", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ acao: "login", email, senha }),
      });
      const json = await response.json();
      if (!json.success) throw new Error(json.error?.message ?? "Não foi possível conectar sua conta.");
      onConnected({ connected: true, email });
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "Não foi possível conectar sua conta.");
    } finally {
      setIsLoading(false);
    }
  }

  if (isCheckingStatus) {
    return (
      <Card className="mx-auto w-full max-w-md">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-14 text-center">
          <Loader2 className="size-6 animate-spin text-primary" strokeWidth={2} />
          <p className="text-muted-foreground text-sm">Verificando sua conexão com a Kairóss...</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mx-auto w-full max-w-md">
      <CardHeader>
        <div className="flex items-center gap-1.5 font-mono font-semibold text-[10px] text-primary uppercase tracking-[0.08em]">
          <Sparkles className="size-3" strokeWidth={2} />
          Integração
        </div>
        <CardTitle className="text-xl">Conectar conta Kairóss</CardTitle>
        <CardDescription>Conecte sua conta para escolher quais produtos entram no seu catálogo.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex items-center gap-2.5 rounded-lg border border-primary/15 bg-primary/[0.05] px-3.5 py-2.5">
            <ShieldCheck className="size-4 shrink-0 text-primary" strokeWidth={1.75} />
            <p className="text-[11.5px] text-muted-foreground leading-4">
              Conexão segura — sua senha não fica salva no painel, só o acesso já autenticado.
            </p>
          </div>

          <Field>
            <FieldLabel htmlFor="kaiross-email">E-mail da Kairóss</FieldLabel>
            <Input
              id="kaiross-email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
          </Field>

          <Field>
            <FieldLabel htmlFor="kaiross-senha">Senha</FieldLabel>
            <Input
              id="kaiross-senha"
              type="password"
              autoComplete="current-password"
              required
              value={senha}
              onChange={(event) => setSenha(event.target.value)}
            />
          </Field>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" size="lg" disabled={isLoading} className="mt-1">
            {isLoading ? "Conectando..." : "Conectar conta"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
