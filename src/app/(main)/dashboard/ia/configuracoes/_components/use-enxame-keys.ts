"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import type { EnxameKeyView } from "@/lib/enxame-client";

interface UseEnxameKeysResult {
  keys: EnxameKeyView[];
  loading: boolean;
  configured: boolean;
  error: string | null;
  refresh: () => void;
  addKey: (input: { id: string; provider: "groq" | "gemini"; apiKey: string; model?: string }) => Promise<boolean>;
  toggleKey: (id: string, nextState: "available" | "disabled") => Promise<void>;
  removeKey: (id: string) => Promise<void>;
  mutatingId: string | null;
}

/** Gerencia a lista de chaves do Enxame e as operações de CRUD, com feedback via toast. */
export function useEnxameKeys(): UseEnxameKeysResult {
  const [keys, setKeys] = useState<EnxameKeyView[]>([]);
  const [loading, setLoading] = useState(true);
  const [configured, setConfigured] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutatingId, setMutatingId] = useState<string | null>(null);

  const fetchKeys = useCallback(async () => {
    try {
      const response = await fetch("/api/ai/enxame/keys", { cache: "no-store" });
      const json = await response.json();
      if (!response.ok || !json.success) {
        setError(json.error?.message ?? "Não foi possível carregar as chaves.");
        return;
      }
      setKeys(json.data);
      setConfigured(json.configured ?? true);
      setError(null);
    } catch {
      setError("Falha de rede ao buscar as chaves.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchKeys();
  }, [fetchKeys]);

  const addKey = useCallback(
    async (input: { id: string; provider: "groq" | "gemini"; apiKey: string; model?: string }) => {
      const response = await fetch("/api/ai/enxame/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        toast.error(json.error?.message ?? "Não foi possível cadastrar a chave.");
        return false;
      }
      toast.success("Chave cadastrada no pool.");
      await fetchKeys();
      return true;
    },
    [fetchKeys],
  );

  const toggleKey = useCallback(
    async (id: string, nextState: "available" | "disabled") => {
      setMutatingId(id);
      // Atualização otimista — a UI reflete a troca antes da confirmação do servidor;
      // se falhar, o refresh() no finally reverte para o estado real.
      setKeys((prev) => prev.map((key) => (key.id === id ? { ...key, state: nextState } : key)));
      try {
        const response = await fetch("/api/ai/enxame/keys", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id, state: nextState }),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          toast.error(json.error?.message ?? "Não foi possível atualizar a chave.");
        } else {
          toast.success(nextState === "available" ? "Chave ativada." : "Chave desativada.");
        }
      } catch {
        toast.error("Falha de rede ao atualizar a chave.");
      } finally {
        setMutatingId(null);
        await fetchKeys();
      }
    },
    [fetchKeys],
  );

  const removeKey = useCallback(
    async (id: string) => {
      setMutatingId(id);
      try {
        const response = await fetch("/api/ai/enxame/keys", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ id }),
        });
        const json = await response.json();
        if (!response.ok || !json.success) {
          toast.error(json.error?.message ?? "Não foi possível remover a chave.");
        } else {
          toast.success("Chave removida do pool.");
        }
      } catch {
        toast.error("Falha de rede ao remover a chave.");
      } finally {
        setMutatingId(null);
        await fetchKeys();
      }
    },
    [fetchKeys],
  );

  return { keys, loading, configured, error, refresh: fetchKeys, addKey, toggleKey, removeKey, mutatingId };
}
