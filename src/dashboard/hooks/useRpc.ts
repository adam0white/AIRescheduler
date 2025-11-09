/**
 * useRpc Hook
 * React hook for making type-safe RPC calls to the Worker backend
 */

import { useState } from 'react';
import { RpcMethod, RpcMethodMap } from '../../rpc/schema';
import { z } from 'zod';

interface UseRpcState {
  loading: boolean;
  error: string | null;
}

interface RpcCallResult<T> {
  result: T;
  correlationId: string;
}

interface UseRpcReturn {
  call: <M extends RpcMethod>(
    method: M,
    params: z.infer<typeof RpcMethodMap[M]['request']>
  ) => Promise<RpcCallResult<z.infer<typeof RpcMethodMap[M]['response']>>>;
  loading: boolean;
  error: string | null;
  clearError: () => void;
}

/**
 * Hook for making RPC calls to Worker backend
 * Provides loading state, error handling, and type-safe method calls
 *
 * @example
 * const { call, loading, error } = useRpc();
 * const result = await call('seedDemoData', { clearExisting: false });
 */
export function useRpc(): UseRpcReturn {
  const [state, setState] = useState<UseRpcState>({
    loading: false,
    error: null,
  });

  const clearError = () => {
    setState((prev) => ({ ...prev, error: null }));
  };

  const call = async <M extends RpcMethod>(
    method: M,
    params: z.infer<typeof RpcMethodMap[M]['request']>
  ): Promise<RpcCallResult<z.infer<typeof RpcMethodMap[M]['response']>>> => {
    setState({ loading: true, error: null });

    try {
      const response = await fetch('/rpc', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method, params }),
      });

      const data = (await response.json()) as { result?: any; error?: string; correlationId?: string };

      if (data.error) {
        const errorMessage = data.correlationId
          ? `${data.error} (ID: ${data.correlationId})`
          : data.error;
        setState({ loading: false, error: errorMessage });
        throw new Error(errorMessage);
      }

      setState({ loading: false, error: null });
      return {
        result: data.result,
        correlationId: data.correlationId || 'unknown',
      };
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setState({ loading: false, error: errorMessage });
      throw err;
    }
  };

  return { call, loading: state.loading, error: state.error, clearError };
}
