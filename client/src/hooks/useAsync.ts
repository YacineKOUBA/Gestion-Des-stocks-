import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from '../services/api';
import { clearLoadFailure, registerLoadFailure } from './loadFailures';

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => void;
  setData: (data: T | null) => void;
}

export interface UseAsyncOptions {
  /**
   * D28 : nom affichable de la liste chargee (« Depots », « Categories »...).
   *
   * A RENSEIGNER UNIQUEMENT si cette liste alimente un controle qui, vide, passe
   * pour legitimentement vide : un deroulant, une liste de suggestions. Dans ce
   * cas, un echec est annonce dans le bandeau du `Layout` au lieu de disparaitre
   * en silence — c'etait le defaut de D27.
   *
   * A LAISSER VIDE pour une charge dont l'ecran rend deja l'erreur (tableau
   * principal, detail) : la declarer afficherait deux fois la meme panne.
   */
  label?: string;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: UseAsyncOptions = {},
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Le libelle est lu au moment de l'echec, pas au moment du rendu : il ne doit
  // pas entrer dans les dependances de `reload`, sinon un libelle change
  // relancerait le chargement. La ref evite de capturer une valeur perimee.
  const labelRef = useRef(options.label);
  useEffect(() => {
    labelRef.current = options.label;
  });

  const reload = useCallback(() => {
    setLoading(true);
    setError(null);
    loader()
      .then((result) => {
        setData(result);
        if (labelRef.current) clearLoadFailure(labelRef.current);
      })
      .catch((err: unknown) => {
        const message = err instanceof ApiError ? err.message : 'Erreur inattendue';
        setError(message);
        if (labelRef.current) registerLoadFailure(labelRef.current, message);
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
