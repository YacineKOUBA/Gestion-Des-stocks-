import { useCallback, useEffect, useState } from 'react';
import { ApiError } from '../services/api';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (data: T | null) => void;
}

export function useAsync<T>(loader: () => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loader()
      .then((result) => setData(result))
      .catch((err: unknown) => {
        setError(err instanceof ApiError ? err.message : 'Erreur inattendue');
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, loading, error, reload, setData };
}

export function errorMessage(err: unknown, fallback = 'Erreur inattendue'): string {
  return err instanceof ApiError ? err.message : fallback;
}
