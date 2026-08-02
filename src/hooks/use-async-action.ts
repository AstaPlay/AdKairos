"use client";

import { useCallback, useRef, useState } from "react";

import { getErrorMessage } from "@/utils/get-error-message";

interface AsyncState<T> {
  data: T | null;
  isLoading: boolean;
  error: string | null;
}

interface UseAsyncActionResult<T, Args extends unknown[]> extends AsyncState<T> {
  execute: (...args: Args) => Promise<T | null>;
  reset: () => void;
}

/**
 * Encapsula o ciclo loading/error/data para qualquer ação assíncrona,
 * evitando repetir esse boilerplate em cada componente/formulário.
 *
 * Proteções embutidas:
 * - Ignora cliques duplicados: uma chamada já em andamento bloqueia novas
 *   chamadas (evita duplo-submit, ex.: dois cliques rápidos em "Salvar").
 * - Ignora resultado de chamadas obsoletas: se `execute` for chamado de novo
 *   antes da primeira terminar (ex.: busca com filtro mudando rápido), só o
 *   resultado da chamada mais recente atualiza o estado.
 */
export function useAsyncAction<T, Args extends unknown[] = []>(
  action: (...args: Args) => Promise<T>,
): UseAsyncActionResult<T, Args> {
  const [state, setState] = useState<AsyncState<T>>({
    data: null,
    isLoading: false,
    error: null,
  });
  const isRunningRef = useRef(false);
  const callIdRef = useRef(0);

  const execute = useCallback(
    async (...args: Args) => {
      if (isRunningRef.current) return null;
      isRunningRef.current = true;
      const currentCallId = ++callIdRef.current;

      setState({ data: null, isLoading: true, error: null });
      try {
        const result = await action(...args);
        if (currentCallId === callIdRef.current) {
          setState({ data: result, isLoading: false, error: null });
        }
        return result;
      } catch (error) {
        if (currentCallId === callIdRef.current) {
          setState({
            data: null,
            isLoading: false,
            error: getErrorMessage(error),
          });
        }
        return null;
      } finally {
        isRunningRef.current = false;
      }
    },
    [action],
  );

  const reset = useCallback(() => {
    callIdRef.current += 1;
    isRunningRef.current = false;
    setState({ data: null, isLoading: false, error: null });
  }, []);

  return { ...state, execute, reset };
}
