import { useEffect, useRef, useState, type FormEvent } from 'react';
import { articlesApi, loansApi, lotsApi, referentialApi, stockApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, SearchSelect, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { OverlapConfirm } from '../components/OverlapConfirm';
import { ApiError, overlapConfirmation } from '../services/api';
import type { Loan, LoanType, ReservationOverlapConfirmation, RestitutionType } from '../types';
import { Qty } from '../components/Qty';
import { formatDate, formatNumber, todayInput } from '../utils/format';
import { useAuth } from '../context/AuthContext';
import { articleSearchOptions, partnerSearchOptions } from '../utils/searchOptions';

export function LoansPage() {
  const { can } = useAuth();
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
          can('loan:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouvelle opération
            </button>
          ) : null
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
              ...(can('loan:write')
                ? [
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
                  ]
                : []),
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

/** Valeur sentinelle du selecteur de lot : saisie d'un lot non encore reference. */
const NEW_LOT = '__NEW__';

/**
 * 409 LOT_EXISTANT : le numero saisi existe deja pour cet article. On renvoie le lot
 * trouve pour proposer « Utiliser ce lot existant » au lieu de fusionner en silence.
 */
function duplicateLotFromError(error: unknown): { id: number; lotNumber: string } | null {
  if (!(error instanceof ApiError) || error.status !== 409) return null;
  const details = error.details as
    | { code?: string; lot?: { id: number; lotNumber: string } }
    | undefined;
  if (details?.code !== 'LOT_EXISTANT' || !details.lot) return null;
  return details.lot;
}

function LoanFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const articles = useAsync(() => articlesApi.list(), [], { label: 'Articles' });
  const partners = useAsync(() => referentialApi.partners(), [], { label: 'Acteurs' });
  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });
  const locations = useAsync(() => stockApi.locations(), [], { label: 'Emplacements' });
  const [form, setForm] = useState({
    type: 'PRET' as LoanType,
    partnerId: '',
    articleId: '',
    lotId: '',
    newLotNumber: '',
    newLotExpiryDate: '',
    depotId: '',
    locationId: '',
    quantity: '',
    loanDate: todayInput(),
    observation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Lot deja existant detecte lors d'une saisie de « nouveau lot » : on demande
  // confirmation avant de rattacher l'emprunt a ce lot plutot que d'en creer un autre.
  const [existingLot, setExistingLot] = useState<{ id: number; lotNumber: string } | null>(null);
  // D20 : un PRET retire du stock, il peut donc empieter sur une reservation.
  const [overlap, setOverlap] = useState<ReservationOverlapConfirmation | null>(null);
  const dernierPayload = useRef<Parameters<typeof loansApi.create>[0] | null>(null);
  // false des que l'utilisateur choisit lui-meme un depot : on ne propose plus rien ensuite.
  const depotAuto = useRef(true);

  const selectedArticle = articles.data?.find((a) => a.id === Number(form.articleId));
  // Un EMPRUNT fait entrer du stock : un lot neuf a zero doit rester selectionnable.
  // Un PRET, lui, ne propose que les lots qui ont encore du stock.
  const isEmprunt = form.type === 'EMPRUNT';
  const lots = useAsync(
    () =>
      form.articleId
        ? lotsApi.list({ articleId: Number(form.articleId), includeExhausted: isEmprunt })
        : Promise.resolve([]),
    [form.articleId, isEmprunt],
    { label: 'Lots' },
  );
  // Le lot est obligatoire des qu'un article est suivi par lot. On se fie au drapeau
  // de l'article, et par securite a la presence de lots : une fiche article dont le
  // drapeau n'aurait pas encore ete mis a jour ne doit pas laisser passer un pret
  // sans lot (le serveur le refuserait de toute facon).
  const articleLots = (lots.data ?? []).filter((l) => l.articleId === Number(form.articleId));
  const lotRequis = Boolean(selectedArticle?.isLotTracked || articleLots.length > 0);
  // meme source de verite que le controle serveur : /loans/disponibilite
  const dispo = useAsync(
    () =>
      form.articleId
        ? loansApi.disponibilite({
            articleId: Number(form.articleId),
            lotId: form.lotId && form.lotId !== NEW_LOT ? Number(form.lotId) : null,
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

  function payloadFromForm(overrideLotId?: number): Parameters<typeof loansApi.create>[0] {
    const newLotMode = form.lotId === NEW_LOT;
    const lotId =
      overrideLotId !== undefined
        ? overrideLotId
        : newLotMode
          ? null
          : form.lotId
            ? Number(form.lotId)
            : null;
    return {
      type: form.type,
      partnerId: Number(form.partnerId),
      articleId: Number(form.articleId),
      lotId,
      newLot:
        overrideLotId !== undefined
          ? null
          : newLotMode
            ? { lotNumber: form.newLotNumber.trim(), expiryDate: form.newLotExpiryDate || null }
            : null,
      depotId: form.depotId ? Number(form.depotId) : null,
      locationId: form.locationId ? Number(form.locationId) : null,
      quantity: Number(form.quantity),
      loanDate: form.loanDate,
      observation: form.observation || null,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    // Le champ « Acteur » / « Article » étant passé en recherche par écriture, le
    // contrôle `required` natif du <select> ne s'applique plus : on le reproduit ici.
    if (!form.partnerId || !form.articleId) {
      setError("Sélectionnez l'acteur et l'article.");
      return;
    }
    // Le lot est obligatoire pour un article suivi par lot : le serveur refuse
    // l'operation sans lot, on bloque donc la saisie ici pour un message clair.
    if (lotRequis && !form.lotId) {
      setError("Sélectionnez le lot de l'article : il est obligatoire pour cet article suivi par lot.");
      return;
    }
    if (form.lotId === NEW_LOT && !form.newLotNumber.trim()) {
      setError('Saisissez le numéro du nouveau lot.');
      return;
    }
    setExistingLot(null);
    await envoyer(payloadFromForm());
  }

  // L'utilisateur confirme que le lot signale comme doublon est bien le bon : on
  // rejoue l'enregistrement en rattachant l'emprunt a ce lot, sans en creer un autre.
  function utiliserLotExistant() {
    const lot = existingLot;
    if (!lot) return;
    setExistingLot(null);
    setForm((prev) => ({ ...prev, lotId: String(lot.id), newLotNumber: '', newLotExpiryDate: '' }));
    void envoyer(payloadFromForm(lot.id));
  }

  async function envoyer(payload: Parameters<typeof loansApi.create>[0]) {
    setSubmitting(true);
    setError(null);
    dernierPayload.current = payload;
    try {
      await loansApi.create(payload);
      setOverlap(null);
      onSaved();
    } catch (err) {
      const conflict = overlapConfirmation(err);
      if (conflict) setOverlap(conflict);
      else {
        const duplicate = duplicateLotFromError(err);
        if (duplicate) setExistingLot(duplicate);
        else setError(errorMessage(err, 'Création impossible'));
      }
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
              setExistingLot(null);
              setForm((prev) => ({
                ...prev,
                type,
                depotId: '',
                locationId: '',
                // Un nouveau lot n'a de sens que pour un emprunt : on efface la saisie
                // si l'utilisateur bascule sur un pret.
                ...(type === 'PRET' && prev.lotId === NEW_LOT
                  ? { lotId: '', newLotNumber: '', newLotExpiryDate: '' }
                  : {}),
              }));
            }}
          >
            <option value="PRET">PRET (sortie de stock)</option>
            <option value="EMPRUNT">EMPRUNT (entrée de stock)</option>
          </select>
        </Field>
        <Field label="Acteur">
          <SearchSelect
            options={partnerSearchOptions(partners.data)}
            value={form.partnerId ? Number(form.partnerId) : null}
            onChange={(id) => update('partnerId', id ? String(id) : '')}
            placeholder="Rechercher un acteur…"
          />
        </Field>
        <Field label="Article">
          <SearchSelect
            options={articleSearchOptions(articles.data)}
            value={form.articleId ? Number(form.articleId) : null}
            onChange={(id) => {
              depotAuto.current = true;
              setExistingLot(null);
              setForm((prev) => ({
                ...prev,
                articleId: id ? String(id) : '',
                lotId: '',
                newLotNumber: '',
                newLotExpiryDate: '',
              }));
            }}
            placeholder="Rechercher un article…"
          />
        </Field>
        {lotRequis ? (
          <Field
            label="Lot (obligatoire)"
            hint={
              lots.loading
                ? 'Chargement des lots…'
                : articleLots.length === 0 && !isEmprunt
                  ? 'Aucun lot disponible pour cet article : créez-en un dans la page « Lots et péremption ».'
                  : isEmprunt
                    ? 'Emprunt d’un lot non référencé : choisissez « Nouveau lot » pour le créer.'
                    : undefined
            }
          >
            <select
              value={form.lotId}
              onChange={(e) => {
                depotAuto.current = true;
                setExistingLot(null);
                update('lotId', e.target.value);
              }}
              required
            >
              <option value="">—</option>
              {articleLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}
                </option>
              ))}
              {isEmprunt ? <option value={NEW_LOT}>+ Nouveau lot (non référencé)</option> : null}
            </select>
          </Field>
        ) : null}
        {form.lotId === NEW_LOT ? (
          <>
            <Field
              label="Numéro du nouveau lot"
              hint="Le lot sera créé et rattaché à l’article lors de l’enregistrement."
            >
              <input
                value={form.newLotNumber}
                onChange={(e) => {
                  setExistingLot(null);
                  update('newLotNumber', e.target.value);
                }}
                maxLength={50}
                placeholder="Ex. LOT-2026-001"
                required
              />
            </Field>
            <Field label="Date de péremption" hint="Recommandée : elle alimente les alertes de péremption.">
              <input
                type="date"
                value={form.newLotExpiryDate}
                onChange={(e) => update('newLotExpiryDate', e.target.value)}
              />
            </Field>
          </>
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
        {existingLot ? (
          <div className="form-grid" style={{ gridColumn: '1 / -1' }}>
            <p className="muted" style={{ margin: 0 }}>
              Le lot « {existingLot.lotNumber} » existe déjà pour cet article. Utiliser ce lot
              existant pour l’emprunt ?
            </p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setExistingLot(null)}>
                Non, saisir un autre numéro
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={utiliserLotExistant}
              >
                Utiliser ce lot existant
              </button>
            </div>
          </div>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      {overlap ? (
        <OverlapConfirm
          conflict={overlap}
          busy={submitting}
          onCancel={() => setOverlap(null)}
          onConfirm={() => {
            const p = dernierPayload.current;
            if (p) void envoyer({ ...p, confirmToken: overlap.confirmToken });
          }}
        />
      ) : null}
    </Modal>
  );
}

function RestitutionModal({ loan, onClose, onSaved }: { loan: Loan; onClose: () => void; onSaved: () => void }) {
  const defaultType: RestitutionType = loan.type === 'PRET' ? 'RESTITUTION_PRET' : 'RESTITUTION_EMPRUNT';
  const [form, setForm] = useState({
    type: defaultType as RestitutionType,
    quantity: String(loan.solde ?? ''),
    restDate: todayInput(),
    lotId: (loan as any).lotId ? String((loan as any).lotId) : (loan.lotNumber ? '' : ''),
    newLotNumber: '',
    newLotExpiryDate: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // Lot deja existant detecte lors d'une saisie de « nouveau lot » : on demande
  // confirmation avant de rattacher la restitution a ce lot.
  const [existingLot, setExistingLot] = useState<{ id: number; lotNumber: string } | null>(null);
  // Un nouveau lot ne peut entrer que lors d'une RESTITUTION_PRET (retour dans notre
  // stock). Une RESTITUTION_EMPRUNT sort le lot vers le preteur : pas de creation.
  const isRestitutionPret = form.type === 'RESTITUTION_PRET';
  // D20 : restituer un EMPRUNT retire du stock, donc peut empieter sur une reservation.
  const [overlap, setOverlap] = useState<ReservationOverlapConfirmation | null>(null);
  const dernierPayload = useRef<Parameters<typeof loansApi.restitute>[0] | null>(null);
  // Suggestions de lots pour l'article du prêt/emprunt
  const lots = useAsync(
    () => (loan.articleId ? lotsApi.list({ articleId: loan.articleId, includeExhausted: true }) : Promise.resolve([] as import('../types').Lot[])),
    [loan.articleId],
    { label: 'Lots' },
  );
  // L'option « Nouveau lot » n'a de sens que pour un article suivi par lot. On se fie
  // au drapeau de l'article, et a la presence de lots en secours (donnee plus ancienne).
  const articleSuiviParLot = Boolean(loan.article?.isLotTracked) || (lots.data?.length ?? 0) > 0;

  function payloadFromForm(overrideLotId?: number): Parameters<typeof loansApi.restitute>[0] {
    const newLotMode = form.lotId === NEW_LOT;
    const lotId =
      overrideLotId !== undefined
        ? overrideLotId
        : newLotMode
          ? null
          : form.lotId
            ? Number(form.lotId)
            : null;
    return {
      loanId: loan.id,
      type: form.type,
      quantity: Number(form.quantity),
      restDate: form.restDate,
      lotId,
      newLot:
        overrideLotId !== undefined
          ? null
          : newLotMode
            ? { lotNumber: form.newLotNumber.trim(), expiryDate: form.newLotExpiryDate || null }
            : null,
    };
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (form.lotId === NEW_LOT && !form.newLotNumber.trim()) {
      setError('Saisissez le numéro du nouveau lot.');
      return;
    }
    setExistingLot(null);
    await envoyer(payloadFromForm());
  }

  // L'utilisateur confirme que le lot signale comme doublon est bien le bon : on
  // rejoue la restitution en rattachant le retour a ce lot, sans en creer un autre.
  function utiliserLotExistant() {
    const lot = existingLot;
    if (!lot) return;
    setExistingLot(null);
    setForm((prev) => ({ ...prev, lotId: String(lot.id), newLotNumber: '', newLotExpiryDate: '' }));
    void envoyer(payloadFromForm(lot.id));
  }

  async function envoyer(payload: Parameters<typeof loansApi.restitute>[0]) {
    setSubmitting(true);
    setError(null);
    dernierPayload.current = payload;
    try {
      await loansApi.restitute(payload);
      setOverlap(null);
      onSaved();
    } catch (err) {
      const conflict = overlapConfirmation(err);
      if (conflict) setOverlap(conflict);
      else {
        const duplicate = duplicateLotFromError(err);
        if (duplicate) setExistingLot(duplicate);
        else setError(errorMessage(err, 'Restitution impossible'));
      }
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
            disabled
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as RestitutionType }))}
          >
            <option value="RESTITUTION_PRET">RESTITUTION_PRET</option>
            <option value="RESTITUTION_EMPRUNT">RESTITUTION_EMPRUNT</option>
          </select>
        </Field>
        <Field label="Lot (facultatif)">
          <select
            value={form.lotId}
            onChange={(e) => {
              setExistingLot(null);
              setForm((prev) => ({ ...prev, lotId: e.target.value }));
            }}
          >
            <option value="">—</option>
            {(lots.data ?? []).map((l) => (
              <option key={l.id} value={String(l.id)}>
                {l.lotNumber}
              </option>
            ))}
            {isRestitutionPret && articleSuiviParLot ? (
              <option value={NEW_LOT}>+ Nouveau lot (non référencé)</option>
            ) : null}
          </select>
          <span className="muted">
            Facultatif : laissez vide pour garder le lot d'origine, ou si le produit n'a pas de lot.
            {loan.lotNumber ? ` Lot d'origine : ${loan.lotNumber}` : ''}
          </span>
        </Field>
        {form.lotId === NEW_LOT ? (
          <>
            <Field
              label="Numéro du nouveau lot"
              hint="Le lot sera créé et rattaché à l’article lors de l’enregistrement."
            >
              <input
                value={form.newLotNumber}
                onChange={(e) => {
                  setExistingLot(null);
                  setForm((prev) => ({ ...prev, newLotNumber: e.target.value }));
                }}
                maxLength={50}
                placeholder="Ex. LOT-2026-001"
                required
              />
            </Field>
            <Field label="Date de péremption" hint="Recommandée : elle alimente les alertes de péremption.">
              <input
                type="date"
                value={form.newLotExpiryDate}
                onChange={(e) => setForm((prev) => ({ ...prev, newLotExpiryDate: e.target.value }))}
              />
            </Field>
          </>
        ) : null}
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
        {existingLot ? (
          <div className="form-grid" style={{ gridColumn: '1 / -1' }}>
            <p className="muted" style={{ margin: 0 }}>
              Le lot « {existingLot.lotNumber} » existe déjà pour cet article. Utiliser ce lot
              existant pour la restitution ?
            </p>
            <div className="form-actions">
              <button type="button" className="btn" onClick={() => setExistingLot(null)}>
                Non, saisir un autre numéro
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting}
                onClick={utiliserLotExistant}
              >
                Utiliser ce lot existant
              </button>
            </div>
          </div>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>

      {overlap ? (
        <OverlapConfirm
          conflict={overlap}
          busy={submitting}
          onCancel={() => setOverlap(null)}
          onConfirm={() => {
            const p = dernierPayload.current;
            if (p) void envoyer({ ...p, confirmToken: overlap.confirmToken });
          }}
        />
      ) : null}
    </Modal>
  );
}
