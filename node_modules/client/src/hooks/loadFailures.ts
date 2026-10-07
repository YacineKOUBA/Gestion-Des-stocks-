import { useSyncExternalStore } from 'react';

/**
 * D28 — ECHECS DE CHARGEMENT D'UNE LISTE, ANNUNCES UNE SEULE FOIS.
 *
 * Le defaut que la direction a signale (D27) n'etait pas « les filtres ne
 * fonctionnent pas » : c'etait « les filtres DISPARAISSENT et l'ecran fait
 * comme si la liste etait legitimement vide ». Une page rend ses listes avec
 * `data?.map(...)` ; quand l'appel echoue en 403, `data` vaut `null`, le
 * deroulant se vide, et **aucun message ne s'affiche**. L'utilisateur ne peut
 * pas distinguer une liste legitimately vide d'une liste qui n'a jamais
 * arrivee — il en conclut que le filtre n'existe pas.
 *
 * Ce module est le point de rendez-vous : les pages ne signalent QUE les listes
 * dont l'echec rend un controle trompeur (un `<select>`, une `<datalist>`), en
 * passant un libelle a `useAsync`. Les charges de tableau, elles, rendent deja
 * leur erreur sur l'ecran : ne pas les declarer evite d'afficher deux fois la
 * meme panne.
 *
 * Un seul bandeau, monte dans le `Layout`, couvre donc tous les ecrans et tous
 * les controles, sans qu'aucune page n'ait a savoir qu'il existe. Le libelle
 * dit QUELLE liste a echoue : sans lui, l'utilisateur ne pourrait pas relier
 * l'avertissement au deroulant vide qu'il voit a l'ecran.
 */

export interface LoadFailure {
  /** Nom affichable de la liste : « Depots », « Categories »... */
  label: string;
  /** Message renvoye par l'API, tel quel. */
  message: string;
}

let items: LoadFailure[] = [];
const listeners = new Set<() => void>();

function publish(next: LoadFailure[]) {
  items = next;
  for (const listener of listeners) listener();
}

/** Signale l'echec d'une liste. Deux echecs du meme libelle n'en font qu'un. */
export function registerLoadFailure(label: string, message: string) {
  if (items.some((i) => i.label === label)) return;
  publish([...items, { label, message }]);
}

/** Une liste qui finit par reussir ne doit plus laisser d'avertissement. */
export function clearLoadFailure(label: string) {
  if (!items.some((i) => i.label === label)) return;
  publish(items.filter((i) => i.label !== label));
}

/**
 * Vide tout. Appele au changement d'ecran : un echec constate sur une page ne
 * doit pas continuer d'ecranter la suivante.
 */
export function clearLoadFailures() {
  if (items.length === 0) return;
  publish([]);
}

/**
 * Abonnement aux echecs en cours. `useSyncExternalStore` est employe parce que
 * l'echec est produit par un `useAsync` arbitrairement profond dans l'arbre :
 * aucun composant parent ne peut le savoir, la diffusion passe donc par un
 * magasin externe.
 */
export function useLoadFailures(): LoadFailure[] {
  return useSyncExternalStore(
    (onChange) => {
      listeners.add(onChange);
      return () => {
        listeners.delete(onChange);
      };
    },
    () => items,
    () => items,
  );
}
