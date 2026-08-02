"use client";

import { useState } from "react";

import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface AddKeyDialogProps {
  onAdd: (input: { id: string; provider: "groq" | "gemini"; apiKey: string; model?: string }) => Promise<boolean>;
}

const MODEL_PLACEHOLDER: Record<"groq" | "gemini", string> = {
  groq: "llama-3.3-70b-versatile",
  gemini: "gemini-2.0-flash",
};

export function AddKeyDialog({ onAdd }: AddKeyDialogProps) {
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [id, setId] = useState("");
  const [provider, setProvider] = useState<"groq" | "gemini">("groq");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");

  function resetForm() {
    setId("");
    setProvider("groq");
    setApiKey("");
    setModel("");
  }

  async function handleSubmit() {
    if (!id.trim() || !apiKey.trim()) return;
    setSubmitting(true);
    const success = await onAdd({ id: id.trim(), provider, apiKey: apiKey.trim(), model: model.trim() || undefined });
    setSubmitting(false);
    if (success) {
      resetForm();
      setOpen(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) resetForm();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="size-4" />
          Adicionar chave
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Adicionar chave ao pool</DialogTitle>
          <DialogDescription>
            A chave é enviada direto para o Enxame e nunca fica armazenada neste painel — depois de salva, só um preview
            mascarado é exibido.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-id">Identificador</Label>
            <Input id="key-id" placeholder="groq-2" value={id} onChange={(event) => setId(event.target.value)} />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-provider">Provedor</Label>
            <Select value={provider} onValueChange={(value) => setProvider(value as "groq" | "gemini")}>
              <SelectTrigger id="key-provider" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="groq">Groq</SelectItem>
                <SelectItem value="gemini">Gemini</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-secret">Chave da API</Label>
            <Input
              id="key-secret"
              type="password"
              placeholder="••••••••••••••••"
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
              autoComplete="off"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="key-model">Modelo (opcional)</Label>
            <Input
              id="key-model"
              placeholder={MODEL_PLACEHOLDER[provider]}
              value={model}
              onChange={(event) => setModel(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">Cancelar</Button>
          </DialogClose>
          <Button onClick={handleSubmit} disabled={submitting || !id.trim() || !apiKey.trim()}>
            {submitting ? "Salvando..." : "Salvar chave"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
