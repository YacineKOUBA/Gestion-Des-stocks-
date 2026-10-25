import type { Article, Partner } from '../types';
import type { SearchSelectOption } from '../components/ui';

const PARTNER_TYPE_LABEL: Record<Partner['type'], string> = {
  CLIENT: 'Client',
  FOURNISSEUR: 'Fournisseur',
  ENTITE: 'Entité',
  AUTRE: 'Autre',
};

/**
 * Options de recherche pour le champ « Acteur ».
 *
 * Le type est repris dans le libellé (Client / Fournisseur) : la separation
 * clients / fournisseurs reste visible a la saisie, y compris avec la recherche
 * par ecriture qui ne sait pas afficher de groupes.
 */
export function partnerSearchOptions(partners: Partner[] | undefined | null): SearchSelectOption[] {
  const active = (partners ?? []).filter((p) => p.isActive !== false);
  const order: Record<Partner['type'], number> = { CLIENT: 0, FOURNISSEUR: 1, ENTITE: 2, AUTRE: 3 };
  return active
    .slice()
    .sort((a, b) => (order[a.type] ?? 9) - (order[b.type] ?? 9))
    .map((p) => ({
      id: p.id,
      label: `${p.name} (${PARTNER_TYPE_LABEL[p.type] ?? p.type})${p.plafondExempt ? ' — exempté du plafond' : ''}`,
    }));
}

/** Options de recherche pour le champ « Article ». */
export function articleSearchOptions(articles: Article[] | undefined | null): SearchSelectOption[] {
  return (articles ?? []).map((a) => ({ id: a.id, label: `${a.code} — ${a.designation}` }));
}
