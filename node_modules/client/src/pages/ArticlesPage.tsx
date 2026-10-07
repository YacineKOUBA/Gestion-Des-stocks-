import { useEffect, useState, type FormEvent } from 'react';
import { articlesApi, referentialApi, type ArticlePayload } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, SearchSelect, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Article } from '../types';
import { formatMoney, formatNumber, toNumberOrNull } from '../utils/format';
import { CURRENCY_OPTIONS } from '../utils/currencies';
import { isFamilyCategory } from '../utils/families';

const EMPLOI_OPTIONS = ['PRODUCTION', 'REVENTE_EN_LETAT', 'MIXTE'];
const SOURCE_OPTIONS = ['INTERNATIONAL', 'LOCAL', 'MIXTE', 'NON_DEFINI'];
// L'origine (pays) ne concerne que les achats internationaux ou mixtes.
const ORIGIN_SOURCES = ['INTERNATIONAL', 'MIXTE'];

interface FormState {
  designation: string;
  designation2: string;
  fabricant: string;
  emploiGd: string;
  categoryId: string;
  familyId: string;
  application: string;
  unitId: string;
  packagingId: string;
  sourceAchat: string;
  originId: string;
  periode: string;
  frequence: string;
  statut: string;
  unitPrice: string;
  currency: string;
  isLotTracked: boolean;
}

const emptyForm: FormState = {
  designation: '',
  designation2: '',
  fabricant: '',
  emploiGd: 'PRODUCTION',
  categoryId: '',
  familyId: '',
  application: '',
  unitId: '',
  packagingId: '',
  sourceAchat: '',
  originId: '',
  periode: '',
  frequence: '',
  statut: 'ACTIVE',
  unitPrice: '',
  currency: 'DZD',
  isLotTracked: false,
};

const PAGE_SIZE_DEFAULT = 75;
const PAGE_SIZE_OPTIONS = [75, 150, 300];

export function ArticlesPage() {
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [editing, setEditing] = useState<Article | 'new' | null>(null);
  const [pageSize, setPageSize] = useState(PAGE_SIZE_DEFAULT);
  const [offset, setOffset] = useState(0);

  async function handleDelete(a: Article) {
    if (
      !window.confirm(
        `Supprimer définitivement l'article ${a.code} ?\nAutorisé uniquement si l'article ne figure dans aucun dépôt (aucun stock disponible). L'opération est tracée dans le journal d'audit.`,
      )
    )
      return;
    try {
      await articlesApi.remove(a.id);
      articles.reload();
      window.alert(`Article ${a.code} supprimé.`);
    } catch (err) {
      window.alert(errorMessage(err, 'Suppression impossible'));
    }
  }

  const categories = useAsync(() => referentialApi.categories(), [], { label: 'Catégories' });
  const articles = useAsync(
    () =>
      articlesApi.listPaged({
        search: search || undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
        limit: pageSize,
        offset,
      }),
    [search, categoryId, pageSize, offset],
  );

  // Un changement de filtre ou de taille de page doit revenir au début de la liste.
  function applyFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setOffset(0);
    };
  }

  const total = articles.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + pageSize, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + pageSize < total;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const currentPage = Math.floor(offset / pageSize) + 1;

  // Apres la suppression du dernier article d'une page, la page courante peut
  // devenir invalide (offset au-dela du total renvoye par le serveur). On ramene
  // l'offset sur la derniere page reelle plutot que d'afficher un tableau vide.
  //
  // Le recalcul se fait sur `total` et non sur le nombre de lignes recues : au
  // moment ou l'effet s'execute, `articles.data` peut encore contenir la page
  // precedente (vide), ce qui faisait reculer de deux crans au lieu d'un.
  useEffect(() => {
    if (articles.loading || articles.error || !articles.data) return;
    const total = articles.data.total;
    const dernierOffset = total > 0 ? Math.floor((total - 1) / pageSize) * pageSize : 0;
    if (offset > dernierOffset) setOffset(dernierOffset);
  }, [articles.loading, articles.error, articles.data, offset, pageSize]);

  const columns: Column<Article>[] = [
    { key: 'code', header: 'Code article' },
    {
      key: 'statut',
      header: 'Statut',
      render: (a) => <Badge tone={a.statut === 'ACTIVE' ? 'green' : 'neutral'}>{a.statut}</Badge>,
    },
    { key: 'designation', header: 'Désignation' },
    { key: 'designation2', header: 'Désignation 2', render: (a) => a.designation2 ?? '—' },
    { key: 'category', header: 'Catégorie', render: (a) => a.category?.label ?? '—' },
    { key: 'family', header: 'Famille', render: (a) => a.family?.label ?? '—' },
    { key: 'emploiGd', header: 'Emploi GD', render: (a) => a.emploiGd ?? '—' },
    { key: 'sourceAchat', header: "Source d'achat", render: (a) => a.sourceAchat ?? '—' },
    { key: 'origin', header: 'Origine', render: (a) => a.origin?.label ?? '—' },
    { key: 'fabricant', header: 'Fabricant', render: (a) => a.fabricant ?? '—' },
    { key: 'partner', header: 'Acteur', render: () => '-' },
    { key: 'application', header: 'Application', render: (a) => a.application ?? '—' },
    { key: 'unit', header: 'Unité de mesure', render: (a) => a.unit?.code ?? '—' },
    { key: 'packaging', header: 'Conditionnement', render: (a) => a.packaging?.label ?? '—' },
    {
      key: 'unitPrice',
      header: 'Prix unitaire',
      align: 'right',
      render: (a) => formatMoney(a.unitPrice, a.currency),
    },
  ];

  return (
    <>
      <PageHeader
        title="Article"
        subtitle="Catalogue des articles et prix unitaires"
        actions={
          can('article:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setEditing('new')}>
              Nouvel article
            </button>
          ) : null
        }
      />

      <Card>
        <div className="filters">
          <input
            placeholder="Rechercher (code ou désignation)"
            value={search}
            onChange={(e) => applyFilter(setSearch)(e.target.value)}
          />
          <select value={categoryId} onChange={(e) => applyFilter(setCategoryId)(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {articles.error ? <ErrorMessage message={articles.error} /> : null}
        {articles.loading && !articles.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              ...columns,
              ...(can('article:write')
                ? ([
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (a: Article) => (
                        <span className="btn-group">
                          <button type="button" className="btn btn-small" onClick={() => setEditing(a)}>
                            Modifier
                          </button>
                          <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(a)}>
                            Supprimer
                          </button>
                        </span>
                      ),
                    },
                  ] as Column<Article>[])
                : []),
            ]}
            rows={articles.data?.items ?? []}
            rowKey={(a) => a.id}
            empty="Aucun article."
          />
        )}

        {total > pageSize || offset > 0 ? (
          <div className="pagination">
            <span className="muted">
              {formatNumber(firstShown)}–{formatNumber(lastShown)} sur {formatNumber(total)} articles — page{' '}
              {formatNumber(currentPage)} / {formatNumber(totalPages)}
            </span>
            <div className="pagination-controls">
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setOffset(0);
                }}
                aria-label="Lignes par page"
              >
                {PAGE_SIZE_OPTIONS.map((n) => (
                  <option key={n} value={n}>
                    {n} / page
                  </option>
                ))}
              </select>
              <button
                type="button"
                className="btn btn-small"
                disabled={!canGoBack}
                onClick={() => setOffset(Math.max(0, offset - pageSize))}
              >
                Précédent
              </button>
              <button
                type="button"
                className="btn btn-small"
                disabled={!canGoForward}
                onClick={() => setOffset(offset + pageSize)}
              >
                Suivant
              </button>
            </div>
          </div>
        ) : null}
      </Card>

      {editing ? (
        <ArticleFormModal
          article={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            articles.reload();
          }}
        />
      ) : null}
    </>
  );
}

function ArticleFormModal({
  article,
  onClose,
  onSaved,
}: {
  article: Article | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const categories = useAsync(() => referentialApi.categories(), [], { label: 'Catégories' });
  const units = useAsync(() => referentialApi.units(), [], { label: 'Unités' });
  const families = useAsync(() => referentialApi.families(), [], { label: 'Familles' });
  const packaging = useAsync(() => referentialApi.packaging(), [], { label: 'Conditionnements' });
  const origins = useAsync(() => referentialApi.origins(), [], { label: 'Origines' });

  const [form, setForm] = useState<FormState>(
    article
      ? {
          designation: article.designation,
          designation2: article.designation2 ?? '',
          fabricant: article.fabricant ?? '',
          emploiGd: article.emploiGd,
          categoryId: String(article.categoryId),
          familyId: article.familyId ? String(article.familyId) : '',
          application: article.application ?? '',
          unitId: String(article.unitId),
          packagingId: article.packagingId ? String(article.packagingId) : '',
          sourceAchat: article.sourceAchat ?? '',
          originId: article.originId ? String(article.originId) : '',
          periode: article.periode ?? '',
          frequence: article.frequence ? String(article.frequence) : '',
          statut: article.statut,
          unitPrice: article.unitPrice ?? '',
          currency: article.currency,
          isLotTracked: article.isLotTracked,
        }
      : emptyForm,
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Les familles ne concernent que les categories "Matiere premiere" et "Emballage".
  const familyCategories = categories.data?.filter((c) => isFamilyCategory(c)) ?? [];
  const selectedFamilyCat = familyCategories.find((c) => c.id === Number(form.categoryId)) ?? null;
  const isFamilyCat = selectedFamilyCat != null;

  function update<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const payload: ArticlePayload = {
      designation: form.designation,
      designation2: form.designation2 || null,
      fabricant: form.fabricant || null,
      emploiGd: form.emploiGd,
      categoryId: Number(form.categoryId),
      familyId: form.familyId ? Number(form.familyId) : null,
      application: form.application || null,
      unitId: Number(form.unitId),
      packagingId: form.packagingId ? Number(form.packagingId) : null,
      sourceAchat: form.sourceAchat || null,
      originId: ORIGIN_SOURCES.includes(form.sourceAchat) && form.originId ? Number(form.originId) : null,
      periode: form.periode || null,
      frequence: form.frequence ? Number(form.frequence) : null,
      statut: form.statut,
      unitPrice: toNumberOrNull(form.unitPrice),
      currency: form.currency,
      isLotTracked: form.isLotTracked,
    };
    try {
      if (article) await articlesApi.update(article.id, payload);
      else await articlesApi.create(payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, "Enregistrement impossible"));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={article ? `Modifier ${article.code}` : 'Nouvel article'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Désignation">
          <input value={form.designation} onChange={(e) => update('designation', e.target.value)} required />
        </Field>
        <Field label="Désignation 2">
          <input value={form.designation2} onChange={(e) => update('designation2', e.target.value)} />
        </Field>
        <Field label="Fabricant">
          <input value={form.fabricant} onChange={(e) => update('fabricant', e.target.value)} />
        </Field>
        <Field label="Emploi GD">
          <select value={form.emploiGd} onChange={(e) => update('emploiGd', e.target.value)}>
            {EMPLOI_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Catégorie">
          <select
            value={form.categoryId}
            onChange={(e) => {
              const v = e.target.value;
              update('categoryId', v);
              if (!familyCategories.some((c) => c.id === Number(v))) update('familyId', '');
            }}
            required
          >
            <option value="">—</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        {isFamilyCat && selectedFamilyCat ? (
          <Field label="Famille">
            <select value={form.familyId} onChange={(e) => update('familyId', e.target.value)}>
              <option value="">—</option>
              <optgroup label={selectedFamilyCat.label}>
                {families.data
                  ?.filter((f) => f.categoryId === selectedFamilyCat.id)
                  .map((f) => (
                    <option key={f.id} value={f.id}>
                      {f.label}
                    </option>
                  ))}
              </optgroup>
            </select>
          </Field>
        ) : null}
        <Field label="Application">
          <input value={form.application} onChange={(e) => update('application', e.target.value)} />
        </Field>
        <Field label="Unité de mesure">
          <select value={form.unitId} onChange={(e) => update('unitId', e.target.value)} required>
            <option value="">—</option>
            {units.data?.map((u) => (
              <option key={u.id} value={u.id}>
                {u.code} — {u.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Conditionnement">
          <select value={form.packagingId} onChange={(e) => update('packagingId', e.target.value)}>
            <option value="">—</option>
            {packaging.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source d'achat">
          <select
            value={form.sourceAchat}
            onChange={(e) => {
              const v = e.target.value;
              update('sourceAchat', v);
              if (!ORIGIN_SOURCES.includes(v)) update('originId', '');
            }}
          >
            <option value="">—</option>
            {SOURCE_OPTIONS.map((o) => (
              <option key={o} value={o}>
                {o}
              </option>
            ))}
          </select>
        </Field>
        {ORIGIN_SOURCES.includes(form.sourceAchat) ? (
          <Field label="Origine" hint="Recherche par pays">
            <SearchSelect
              options={origins.data ?? []}
              value={form.originId ? Number(form.originId) : null}
              onChange={(id) => update('originId', id ? String(id) : '')}
              placeholder="Rechercher un pays…"
            />
          </Field>
        ) : null}
        <Field label="Période">
          <input value={form.periode} onChange={(e) => update('periode', e.target.value)} />
        </Field>
        <Field label="Fréquence (mois)">
          <input type="number" min="1" value={form.frequence} onChange={(e) => update('frequence', e.target.value)} />
        </Field>
        <Field label="Statut">
          <select value={form.statut} onChange={(e) => update('statut', e.target.value)}>
            <option value="ACTIVE">ACTIVE</option>
            <option value="INACTIVE">INACTIVE</option>
          </select>
        </Field>
        <Field label="Prix unitaire">
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.unitPrice}
            onChange={(e) => update('unitPrice', e.target.value)}
          />
        </Field>
        <Field label="Devise">
          <select value={form.currency} onChange={(e) => update('currency', e.target.value)}>
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Suivi par lot">
          <input
            type="checkbox"
            checked={form.isLotTracked}
            onChange={(e) => update('isLotTracked', e.target.checked)}
          />
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

