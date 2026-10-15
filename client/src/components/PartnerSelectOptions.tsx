import type { Partner } from '../types';

export function renderPartnerOptions(partners: Partner[] | undefined | null): React.ReactNode[] {
  const active = (partners ?? []).filter((p) => p.isActive !== false);
  const clients = active.filter((p) => p.type === 'CLIENT');
  const fournisseurs = active.filter((p) => p.type === 'FOURNISSEUR');
  const others = active.filter((p) => p.type !== 'CLIENT' && p.type !== 'FOURNISSEUR');
  const parts: React.ReactNode[] = [];

  if (clients.length > 0) {
    parts.push(
      <optgroup key="clients" label="CLIENTS">
        {clients.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {(p as any).plafondExempt ? ' (exempté du plafond)' : ''}
          </option>
        ))}
      </optgroup>,
    );
  }

  if (fournisseurs.length > 0) {
    parts.push(
      <optgroup key="fournisseurs" label="FOURNISSEURS">
        {fournisseurs.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {(p as any).plafondExempt ? ' (exempté du plafond)' : ''}
          </option>
        ))}
      </optgroup>,
    );
  }

  if (others.length > 0) {
    parts.push(
      <optgroup key="autres" label="AUTRES">
        {others.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
            {(p as any).plafondExempt ? ' (exempté du plafond)' : ''}
          </option>
        ))}
      </optgroup>,
    );
  }

  return parts;
}
