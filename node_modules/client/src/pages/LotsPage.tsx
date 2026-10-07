import { useState, type FormEvent } from 'react';
import { articlesApi, lotsApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner, lotTone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { Lot, LotFlagCode } from '../types';
import { formatDate, formatMoney } from '../utils/format';
import { useAuth } from '../context/AuthContext';

/** D24 : du plus urgent au plus calme, pour que le deroulant se lise comme l'echelle. */
const FLAGS: LotFlagCode[] = ['PERIME', 'ORANGE', 'JAUNE', 'VERT'];

export function LotsPage() {
  const { can } = useAuth();
  const [flag, setFlag] = useState('');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<Lot | null>(null);
  const lots = useAsync(
    () => lotsApi.list({ flag: flag || undefined, search: search.trim() || undefined }),
    [flag, search],
  );

  const columns: Column<Lot>[] = [
    { key: 'lotNumber', header: 'N° lot' },
    { key: 'article', header: 'Article', render: (l) => (l.article ? `${l.article.code} — ${l.article.designation}` : '—') },
    { key: 'quantity', header: 'Stock disponible', align: 'right', render: (l) => <Qty value={l.quantity} /> },
    {
      key: 'unitPrice',
      header: 'Prix unitaire',
      align: 'right',
      render: (l) => {
        // Prix du lot si saisi a la creation, sinon prix par defaut de l'article.
        const price = l.unitPrice != null ? l.unitPrice : (l.article?.unitPrice ?? null);
        return price != null ? formatMoney(price, l.article?.currency ?? 'DZD') : '—';
      },
    },
    { key: 'fabricDate', header: 'Fabrication', render: (l) => formatDate(l.fabricDate) },
    { key: 'expiryDate', header: 'Péremption', render: (l) => formatDate(l.expiryDate) },
    {
      key: 'flag',
      header: 'Alerte',
      render: (l) => {
        // Le drapeau vient du serveur (lotFlag), seule source de verite de la regle
        // de peremption : ne pas le recalculer ici. Un lot sans date de peremption
        // n'a pas de drapeau, donc pas d'alerte a afficher.
        const f = l.flag;
        if (!f) return '—';
        return <Badge tone={lotTone[f] ?? 'neutral'}>{f}</Badge>;
      },
    },
    {
      key: 'observation',
      header: 'Observation',
      render: (l) => (l.observation && l.observation.trim() ? l.observation.trim() : <span className="muted">—</span>),
    },
    ...(can('lot:write')
      ? [
          {
            key: 'action',
            header: 'Action',
            render: (l: Lot) => (
              <button type="button" className="btn btn-sm" onClick={() => setEditing(l)}>
                Modifier
              </button>
            ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Lots & péremptions"
        subtitle="Suivi des lots et dates de péremption (Périmé, Orange < 3 mois, Jaune < 6 mois, Vert > 6 mois)"
        actions={
          can('lot:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouveau lot
            </button>
          ) : null
        }
      />

      <Card>
        <div className="filters">
          <input
            type="search"
            placeholder="Rechercher par n° de lot, code ou désignation article…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={flag} onChange={(e) => setFlag(e.target.value)}>
            <option value="">Tous les lots</option>
            {FLAGS.map((f) => (
              <option key={f} value={f}>
                {f}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {lots.error ? <ErrorMessage message={lots.error} /> : null}
        {lots.loading && !lots.data ? (
          <Spinner />
        ) : (
          <DataTable columns={columns} rows={lots.data ?? []} rowKey={(l) => l.id} empty="Aucun lot." />
        )}
      </Card>

      {(creating || editing) ? (
        <LotFormModal
          lot={editing ?? null}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            lots.reload();
          }}
        />
      ) : null}
    </>
  );
}

function LotFormModal({ lot, onClose, onSaved }: { lot?: Lot | null; onClose: () => void; onSaved: () => void }) {
  const articles = useAsync(() => articlesApi.list(), [], { label: 'Articles' });
  const [form, setForm] = useState({
    articleId: lot ? String(lot.articleId) : '',
    lotNumber: lot?.lotNumber ?? '',
    fabricDate: lot?.fabricDate ? lot.fabricDate.slice(0, 10) : '',
    expiryDate: lot?.expiryDate ? lot.expiryDate.slice(0, 10) : '',
    unitPrice: lot?.unitPrice != null ? String(lot.unitPrice) : '',
    observation: lot?.observation ?? '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Prix du lot : pre-rempli avec le prix de l'article (modifiable). Ce prix est propre
  // au lot : il n'affecte ni le prix de l'article ni celui des autres lots.
  function handleArticleChange(value: string) {
    const article = articles.data?.find((a) => String(a.id) === value);
    setForm((prev) => ({
      ...prev,
      articleId: value,
      unitPrice: article?.unitPrice != null ? String(article.unitPrice) : '',
    }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      const payload = {
        articleId: Number(form.articleId),
        lotNumber: form.lotNumber,
        fabricDate: form.fabricDate || null,
        expiryDate: form.expiryDate || null,
        unitPrice: form.unitPrice ? Number(form.unitPrice) : null,
        observation: form.observation.trim() ? form.observation : null,
      };
      if (lot) {
        await lotsApi.update(lot.id, payload);
      } else {
        await lotsApi.create(payload);
      }
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={lot ? 'Modifier le lot' : 'Nouveau lot'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Article">
          <select value={form.articleId} onChange={(e) => handleArticleChange(e.target.value)} required>
            <option value="">—</option>
            {articles.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.designation}
              </option>
            ))}
          </select>
        </Field>
        <Field label="N° de lot">
          <input value={form.lotNumber} onChange={(e) => update('lotNumber', e.target.value)} required />
        </Field>
        <Field label="Date de fabrication">
          <input type="date" value={form.fabricDate} onChange={(e) => update('fabricDate', e.target.value)} />
        </Field>
        <Field label="Date de péremption">
          <input type="date" value={form.expiryDate} onChange={(e) => update('expiryDate', e.target.value)} />
        </Field>
        <Field
          label="Prix unitaire du lot"
          hint="Propre à ce lot : n'affecte ni le prix de l'article ni celui des autres lots. Si vide, ce lot utilise le prix de l'article."
        >
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.unitPrice}
            onChange={(e) => update('unitPrice', e.target.value)}
          />
        </Field>
        <Field label="Observation">
          <textarea value={form.observation} onChange={(e) => update('observation', e.target.value)} rows={3} />
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
