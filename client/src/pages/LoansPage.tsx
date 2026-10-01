import { useEffect, useRef, useState, type FormEvent } from 'react';
import { articlesApi, loansApi, lotsApi, referentialApi, stockApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Loan, LoanType, RestitutionType } from '../types';
import { Qty } from '../components/Qty';
import { formatDate, formatNumber, todayInput } from '../utils/format';

export function LoansPage() {
  const [creating, setCreating] = useState(false);
  const [restituting, setRestituting] = useState<Loan | null>(null);
  const loans = useAsync(() => loansApi.list(), []);
  const synthesis = useAsync(() => loansApi.synthesis(), []);

  const columns: Column<Loan>[] = [
    { key: 'loanDate', header: 'Date', render: (l) => formatDate(l.loanDate) },
    { key: 'type', header: 'Type', render: (l) => <Badge tone={l.type === 'PRET' ? 'info' : 'orange'}>{l.type}</Badge> },
    { key: 'partner', header: 'Acteur', render: (l) => l.partner?.name ?? '-' },
    { key: 'article', header: 'Article', render: (l) => (l.article ? `${l.article.code} — ${l.article.designation}` : '—') },
    {
      key: 'depot',
      header: 'Dépôt',
      render: (l) => (l.depot ? `${l.depot}${l.emplacement ? ` / ${l.emplacement}` : ''}` : '—'),
    },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      render: (l) => <Qty value={l.quantity}>{l.article?.unit?.code ? ` ${l.article.unit.code}` : null}</Qty>,
    },
    {
      key: 'restitue',
      header: 'Restitué',
      align: 'right',
      render: (l) => <Qty value={l.restitue ?? 0}>{l.article?.unit?.code ? ` ${l.article.unit.code}` : null}</Qty>,
    },
    {
      key: 'solde',
      header: 'Reste à restituer',
      align: 'right',
      render: (l) => <Qty value={l.solde ?? 0}>{l.article?.unit?.code ? ` ${l.article.unit.code}` : null}</Qty>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Prêt / Emprunt"
        subtitle="Opérations de prêt et d'emprunt avec restitutions"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Nouvelle opération
          </button>
        }
      />

      {synthesis.data ? (
        <div className="kpi-grid">
          <div className="kpi kpi-info">
            <span className="kpi-value">{formatNumber(synthesis.data.nbPret)}</span>
            <span className="kpi-label">Total prêté</span>
          </div>
          <div className="kpi kpi-orange">
            <span className="kpi-value">{formatNumber(synthesis.data.nbEmprunt)}</span>
            <span className="kpi-label">Total emprunté</span>
          </div>
          <div className="kpi kpi-green">
            <span className="kpi-value">{formatNumber(synthesis.data.nbRestituees)}</span>
            <span className="kpi-label">Total restitué</span>
          </div>
          <div className="kpi kpi-red">
            <span className="kpi-value">{formatNumber(synthesis.data.nbRestitueesIncompletes)}</span>
            <span className="kpi-label">Reste à restituer</span>
          </div>
        </div>
      ) : null}

      <Card>
        {loans.error ? <ErrorMessage message={loans.error} /> : null}
        {loans.loading && !loans.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              ...columns,
              {
                key: 'actions',
                header: 'Actions',
                render: (l: Loan) =>
                  (l.solde ?? 0) > 0 ? (
                    <button type="button" className="btn btn-small" onClick={() => setRestituting(l)}>
                      Restitution
                    </button>
                  ) : null,
              },
            ]}
            rows={loans.data ?? []}
            rowKey={(l) => l.id}
            empty="Aucune opération."
          />
        )}
      </Card>

      {creating ? (
        <LoanFormModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            loans.reload();
            synthesis.reload();
          }}
        />
      ) : null}

      {restituting ? (
        <RestitutionModal
          loan={restituting}
          onClose={() => setRestituting(null)}
          onSaved={() => {
            setRestituting(null);
            loans.reload();
            synthesis.reload();
          }}
        />
      ) : null}
    </>
  );
}

function LoanFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const articles = useAsync(() => articlesApi.list(), []);
  const partners = useAsync(() => referentialApi.partners(), []);
  const depots = useAsync(() => referentialApi.depots(), []);
  const locations = useAsync(() => stockApi.locations(), []);
  const [form, setForm] = useState({
    type: 'PRET' as LoanType,
    partnerId: '',
    articleId: '',
    lotId: '',
    depotId: '',
    locationId: '',
    quantity: '',
    loanDate: todayInput(),
    observation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // false des que l'utilisateur choisit lui-meme un depot : on ne propose plus rien ensuite.
  const depotAuto = useRef(true);

  const selectedArticle = articles.data?.find((a) => a.id === Number(form.articleId));
  const lots = useAsync(
    () => (form.articleId ? lotsApi.list({ articleId: Number(form.articleId) }) : Promise.resolve([])),
    [form.articleId],
  );
  // meme source de verite que le controle serveur : /loans/disponibilite
  const dispo = useAsync(
    () =>
      form.articleId
        ? loansApi.disponibilite({
            articleId: Number(form.articleId),
            lotId: form.lotId ? Number(form.lotId) : null,
            depotId: form.depotId ? Number(form.depotId) : null,
            locationId: form.locationId ? Number(form.locationId) : null,
          })
        : Promise.resolve(null),
    [form.articleId, form.lotId, form.depotId, form.locationId],
  );
  // Depot le moins rempli : proposition du serveur pour un EMPRUNT (entree de stock).
  // Occupation mesuree en lignes de stock (article x lot) : les quantites de depots
  // distincts ne sont pas additionnables entre unites differentes.
  const depotStock = useAsync(() => loansApi.depotSuggestion(), []);
  const occupationParDepot = new Map((depotStock.data?.parDepot ?? []).map((d) => [d.depotId, d.nbLignes]));
  const unit = selectedArticle?.unit?.code;

  // Tant que l'utilisateur n'a pas choisi de depot, on le propose : depot ou l'article est
  // reellement stocke pour un PRET, depot le moins rempli pour un EMPRUNT.
  useEffect(() => {
    if (!depotAuto.current) return;
    const propose = form.type === 'EMPRUNT' ? depotStock.data?.suggested.depotId : dispo.data?.depotConseille;
    if (!propose) return;
    setForm((prev) => (prev.depotId && Number(prev.depotId) !== propose ? prev : { ...prev, depotId: String(propose) }));
  }, [dispo.data, depotStock.data, form.type, form.articleId, form.lotId]);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loansApi.create({
        type: form.type,
        partnerId: Number(form.partnerId),
        articleId: Number(form.articleId),
        lotId: form.lotId ? Number(form.lotId) : null,
        depotId: form.depotId ? Number(form.depotId) : null,
        locationId: form.locationId ? Number(form.locationId) : null,
        quantity: Number(form.quantity),
        loanDate: form.loanDate,
        observation: form.observation || null,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouvelle opération de prêt/emprunt" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Type">
          <select
            value={form.type}
            onChange={(e) => {
              const type = e.target.value as LoanType;
              // PRET : le serveur propose le depot ou le stock se trouve. EMPRUNT : le moins rempli.
              depotAuto.current = true;
              setForm((prev) => ({ ...prev, type, depotId: '', locationId: '' }));
            }}
          >
            <option value="PRET">PRET (sortie de stock)</option>
            <option value="EMPRUNT">EMPRUNT (entrée de stock)</option>
          </select>
        </Field>
        <Field label="Acteur">
          <select value={form.partnerId} onChange={(e) => update('partnerId', e.target.value)} required>
            <option value="">—</option>
            {partners.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Article">
          <select
            value={form.articleId}
            onChange={(e) => {
              depotAuto.current = true;
              setForm((prev) => ({ ...prev, articleId: e.target.value, lotId: '' }));
            }}
            required
          >
            <option value="">—</option>
            {articles.data?.map((a) => (
              <option key={a.id} value={a.id}>
                {a.code} — {a.designation}
              </option>
            ))}
          </select>
        </Field>
        {selectedArticle?.isLotTracked ? (
          <Field label="Lot">
            <select
              value={form.lotId}
              onChange={(e) => {
                depotAuto.current = true;
                update('lotId', e.target.value);
              }}
              required
            >
              <option value="">—</option>
              {lots.data?.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Quantité">
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            required
          />
        </Field>
        <Field
          label="Dépôt"
          hint={
            depotStock.data
              ? `Suggestion : ${depotStock.data.suggested.label} (le moins rempli)`
              : undefined
          }
        >
          <select
            value={form.depotId}
            onChange={(e) => {
              depotAuto.current = false;
              setForm((prev) => ({ ...prev, depotId: e.target.value, locationId: '' }));
            }}
            required
          >
            <option value="">—</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {occupationParDepot.has(d.id) ? `${d.label} (${occupationParDepot.get(d.id)} ligne(s) en stock)` : d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Emplacement">
          <select value={form.locationId} onChange={(e) => update('locationId', e.target.value)}>
            <option value="">—</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        {form.articleId ? (
          <p className="muted">
            {dispo.loading ? (
              'Stock disponible : …'
            ) : (
              <>
                Stock disponible :{' '}
                <Qty value={dispo.data?.disponible ?? 0}>{unit ? ` ${unit}` : null}</Qty>
                {dispo.data?.tousDepots ? ' (tous les dépôts — choisissez un dépôt et un emplacement)' : ''}
              </>
            )}
          </p>
        ) : null}
        <Field label="Date">
          <input type="date" value={form.loanDate} onChange={(e) => update('loanDate', e.target.value)} required />
        </Field>
        <Field label="Observation">
          <input value={form.observation} onChange={(e) => update('observation', e.target.value)} />
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

function RestitutionModal({ loan, onClose, onSaved }: { loan: Loan; onClose: () => void; onSaved: () => void }) {
  const defaultType: RestitutionType = loan.type === 'PRET' ? 'RESTITUTION_PRET' : 'RESTITUTION_EMPRUNT';
  const [form, setForm] = useState({
    type: defaultType as RestitutionType,
    quantity: String(loan.solde ?? ''),
    restDate: todayInput(),
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await loansApi.restitute({
        loanId: loan.id,
        type: form.type,
        quantity: Number(form.quantity),
        restDate: form.restDate,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Restitution impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Restitution" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <p className="muted">
          {loan.partner?.name} — reste à restituer :{' '}
          <Qty value={loan.solde ?? 0}>
            {loan.article?.unit?.code ? ` ${loan.article.unit.code}` : null}
          </Qty>
        </p>
        <Field label="Type de restitution">
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as RestitutionType }))}
          >
            <option value="RESTITUTION_PRET">RESTITUTION_PRET</option>
            <option value="RESTITUTION_EMPRUNT">RESTITUTION_EMPRUNT</option>
          </select>
        </Field>
        <Field label="Quantité">
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={form.quantity}
            onChange={(e) => setForm((prev) => ({ ...prev, quantity: e.target.value }))}
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={form.restDate}
            onChange={(e) => setForm((prev) => ({ ...prev, restDate: e.target.value }))}
            required
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
