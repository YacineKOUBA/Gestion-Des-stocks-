import { useState, type FormEvent } from 'react';
import { referentialApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Card, ErrorMessage, Field, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { isFamilyCategory } from '../utils/families';

interface RefItem {
  id: number;
  code?: string;
  label?: string;
  name?: string;
  categoryId?: number | null;
  category?: { id: number; code: string; label: string } | null;
}

interface TabConfig {
  key: string;
  label: string;
  model: string | null;
  codeLabel: string;
  labelLabel: string;
  load: () => Promise<RefItem[]>;
  categoryColumn?: boolean;
  withCategory?: boolean;
}

const TABS: TabConfig[] = [
  {
    key: 'families',
    label: 'Familles',
    model: 'family',
    codeLabel: 'Code',
    labelLabel: 'Libellé',
    categoryColumn: true,
    withCategory: true,
    load: () => referentialApi.families(),
  },
  { key: 'categories', label: 'Catégories', model: null, codeLabel: 'Code', labelLabel: 'Libellé', load: () => referentialApi.categories() },
  { key: 'units', label: 'Unités de mesure', model: 'unit', codeLabel: 'Code', labelLabel: 'Libellé', load: () => referentialApi.units() },
  { key: 'packaging', label: 'Conditionnements', model: 'packaging', codeLabel: 'Code (ignoré)', labelLabel: 'Libellé', load: () => referentialApi.packaging() },
  { key: 'origins', label: 'Origines', model: 'origin', codeLabel: 'Code', labelLabel: 'Libellé', load: () => referentialApi.origins() },
  { key: 'depots', label: 'Dépôts', model: 'depot', codeLabel: 'Code', labelLabel: 'Libellé', load: () => referentialApi.depots() },
  { key: 'locations', label: 'Emplacements', model: 'location', codeLabel: 'Code', labelLabel: 'Libellé', load: () => referentialApi.locations() },
  { key: 'partners', label: 'Acteurs', model: 'partner', codeLabel: 'Code (ignoré)', labelLabel: 'Nom', load: () => referentialApi.partners() },
];

export function ReferentialPage() {
  const [active, setActive] = useState(TABS[0]);
  const [version, setVersion] = useState(0);
  const data = useAsync(() => active.load(), [active.key, version]);

  async function handleDelete(r: RefItem) {
    if (!active.model) return;
    const label = r.label ?? r.name ?? r.code ?? `#${r.id}`;
    if (!window.confirm(`Supprimer « ${label} » ?`)) return;
    try {
      await referentialApi.remove(active.model, r.id);
      setVersion((v) => v + 1);
    } catch (err) {
      window.alert(errorMessage(err, 'Suppression impossible'));
    }
  }

  const columns: Column<RefItem>[] = [
    { key: 'code', header: 'Code', render: (r) => r.code ?? '—' },
    { key: 'label', header: 'Libellé', render: (r) => r.label ?? r.name ?? '—' },
    ...(active.categoryColumn
      ? [{ key: 'category', header: 'Catégorie', render: (r) => r.category?.label ?? '—' } as Column<RefItem>]
      : []),
    ...(active.model
      ? [
          {
            key: 'actions',
            header: 'Actions',
            render: (r: RefItem) => (
              <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(r)}>
                Supprimer
              </button>
            ),
          } as Column<RefItem>,
        ]
      : []),
  ];

  return (
    <>
      <PageHeader title="Référentiel" subtitle="Données de référence utilisées par les articles et les mouvements" />

      <div className="tabs">
        {TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            className={`tab${tab.key === active.key ? ' active' : ''}`}
            onClick={() => setActive(tab)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid-2">
        <Card title={active.label}>
          {data.error ? <ErrorMessage message={data.error} /> : null}
          {data.loading && !data.data ? (
            <Spinner />
          ) : (
            <DataTable columns={columns} rows={data.data ?? []} rowKey={(r) => r.id} empty="Aucune entrée." />
          )}
        </Card>

        {active.model ? (
          <Card title={`Ajouter — ${active.label}`}>
            <RefForm
              tab={active}
              onSaved={() => {
                setVersion((v) => v + 1);
              }}
            />
          </Card>
        ) : (
          <Card title="Information">
            <p className="muted">Les catégories sont créées par le script de migration initial.</p>
          </Card>
        )}
      </div>
    </>
  );
}

function RefForm({ tab, onSaved }: { tab: TabConfig; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [label, setLabel] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const categories = useAsync(() => referentialApi.categories(), []);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await referentialApi.create(tab.model as string, {
        code: code || '-',
        label,
        categoryId: categoryId ? Number(categoryId) : undefined,
      });
      setCode('');
      setLabel('');
      setCategoryId('');
      setSuccess('Entrée ajoutée.');
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Ajout impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="form-grid">
      <ErrorMessage message={error} />
      {success ? <div className="alert alert-success">{success}</div> : null}
      <Field label={tab.codeLabel}>
        <input value={code} onChange={(e) => setCode(e.target.value)} />
      </Field>
      <Field label={tab.labelLabel}>
        <input value={label} onChange={(e) => setLabel(e.target.value)} required />
      </Field>
      {tab.withCategory ? (
        <Field label="Catégorie">
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            <option value="">—</option>
            {categories.data
              ?.filter((c) => isFamilyCategory(c))
              .map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
          </select>
        </Field>
      ) : null}
      <div className="form-actions">
        <button type="submit" className="btn btn-primary" disabled={submitting}>
          {submitting ? 'Ajout…' : 'Ajouter'}
        </button>
      </div>
    </form>
  );
}
