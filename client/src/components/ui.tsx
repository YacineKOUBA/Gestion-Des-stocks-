import { useState, type ReactNode } from 'react';
import { useLoadFailures } from '../hooks/loadFailures';

export function Spinner() {
  return <div className="spinner" role="status" aria-label="Chargement" />;
}

export function ErrorMessage({ message }: { message: ReactNode | null }) {
  if (!message) return null;
  return <div className="alert alert-error">{message}</div>;
}

export function SuccessMessage({ message }: { message: string | null }) {
  if (!message) return null;
  return <div className="alert alert-success">{message}</div>;
}

/**
 * D28 : bandeau des listes de reference qui n'ont pas pu etre chargees.
 *
 * Il est monte une seule fois, dans le `Layout` : les pages n'ont rien a ecrire
 * pour signaler l'echec d'une liste, il leur suffit de passer un libelle a
 * `useAsync`.
 *
 * Le libelle est indispensable. Sans lui, l'utilisateur verrait « une liste n'a
 * pas pu etre chargee » au-dessus d'un deroulant vide, sans moyen de savoir
 * lequel — c'est-a-dire le meme defaut qu'a corriger, en plus bavard. Avec lui,
 * l'avertissement et le deroulant vide se rejoignent, et le rapport a
 * l'administrateur devient possible.
 */
export function LoadFailureBanner() {
  const failures = useLoadFailures();
  if (failures.length === 0) return null;
  return (
    <div className="alert alert-error load-failure" role="alert">
      <strong>
        {failures.length === 1
          ? "Une liste n'a pas pu etre chargee"
          : `${failures.length} listes n'ont pas pu etre chargees`}
      </strong>{' '}
      — le ou les controles qui en dependent restent vides, alors qu'ils semblent
      reellement vides. Liste en cause :{' '}
      {failures.map((f) => `« ${f.label} »`).join(', ')}. Signalez-le a
      l'administrateur.
    </div>
  );
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: string }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {subtitle ? <p className="muted">{subtitle}</p> : null}
      </div>
      {actions ? <div className="page-actions">{actions}</div> : null}
    </div>
  );
}

export function Card({ children, title }: { children: ReactNode; title?: string }) {
  return (
    <section className="card">
      {title ? <h2 className="card-title">{title}</h2> : null}
      {children}
    </section>
  );
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
    </label>
  );
}

export function Modal({
  title,
  onClose,
  actions,
  children,
}: {
  title: string;
  onClose: () => void;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>{title}</h2>
          <div className="modal-header-actions">
            {actions}
            <button type="button" className="icon-button" onClick={onClose} aria-label="Fermer">
              ×
            </button>
          </div>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  );
}

export const observationTone: Record<string, string> = {
  OK: 'green',
  ALERTE: 'orange',
  COMMANDER: 'orange',
  'RUPTURE IMMINENTE': 'red',
  SURSTOCK: 'orange',
};

/**
 * D24 : quatre niveaux. PERIME et ROUGE partagent le rouge a titre de securite
 * (un drapeau inconnu ne doit jamais s'afficher sans couleur), mais PERIME est le
 * seul code que la regle produit pour un lot perime.
 */
export const lotTone: Record<string, string> = {
  VERT: 'green',
  JAUNE: 'yellow',
  ORANGE: 'orange',
  PERIME: 'red',
  ROUGE: 'red',
};

export interface SearchSelectOption {
  id: number;
  label: string;
}

export function SearchSelect({
  options,
  value,
  onChange,
  placeholder = 'Rechercher…',
}: {
  options: SearchSelectOption[];
  value: number | null;
  onChange: (id: number | null) => void;
  placeholder?: string;
}) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const selected = options.find((o) => o.id === value);
  const q = query.trim().toLocaleLowerCase();
  const filtered = q ? options.filter((o) => o.label.toLocaleLowerCase().includes(q)) : options;

  function pick(opt: SearchSelectOption) {
    onChange(opt.id);
    setQuery(opt.label);
    setOpen(false);
    setHighlight(0);
  }

  function clear() {
    onChange(null);
    setQuery('');
    setOpen(false);
    setHighlight(0);
  }

  return (
    <div className="search-select" onBlur={() => setOpen(false)}>
      <div className="search-select-input">
        <input
          value={query}
          placeholder={selected?.label ?? placeholder}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
            setHighlight(0);
          }}
          onFocus={() => {
            setOpen(true);
            if (selected && !query) setQuery(selected.label);
          }}
          onKeyDown={(e) => {
            if (e.key === 'ArrowDown') {
              e.preventDefault();
              setOpen(true);
              setHighlight((h) => Math.min(h + 1, filtered.length - 1));
            } else if (e.key === 'ArrowUp') {
              e.preventDefault();
              setHighlight((h) => Math.max(h - 1, 0));
            } else if (e.key === 'Enter') {
              e.preventDefault();
              const opt = filtered[highlight];
              if (opt) pick(opt);
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
        />
        {selected ? (
          <button type="button" className="search-select-clear" onClick={clear} aria-label="Effacer">
            ×
          </button>
        ) : null}
      </div>
      {open ? (
        <div className="search-select-dropdown">
          {filtered.length === 0 ? (
            <div className="search-select-empty">Aucun résultat</div>
          ) : (
            filtered.map((o, i) => (
              <button
                key={o.id}
                type="button"
                className={i === highlight ? 'search-select-option is-highlight' : 'search-select-option'}
                onMouseDown={(e) => e.preventDefault()}
                onMouseEnter={() => setHighlight(i)}
                onClick={() => pick(o)}
              >
                {o.label}
              </button>
            ))
          )}
        </div>
      ) : null}
    </div>
  );
}
