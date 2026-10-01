import { useState, type FormEvent } from 'react';
import {
  articlesApi,
  lotsApi,
  movementsApi,
  referentialApi,
  stockApi,
  type MovementPayload,
} from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner, SuccessMessage } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { BonFormModal, type BonFormInitial } from '../components/BonFormModal';
import { Qty } from '../components/Qty';
import type { Movement, Lot } from '../types';
import { formatDate, formatNumber, todayInput, toNumberOrNull } from '../utils/format';

const MOVE_TYPES = ['ENTREE', 'SORTIE', 'TRANSFERT', 'PERTE', 'AJUSTEMENT', 'RETOUR'];

interface BonDraft {
  label: string;
  initial: BonFormInitial;
}

function buildBonDrafts(move: Movement, moveType: string): BonDraft[] {
  const line = {
    articleId: move.articleId,
    lotId: move.lotId,
    quantity: Math.abs(Number(move.quantity)),
    unitPrice: move.unitPrice != null ? Number(move.unitPrice) : null,
    observation: `Mouvement #${move.id}`,
  };
  if (moveType === 'SORTIE') {
    return [
      {
        label: 'bon de sortie',
        initial: { type: 'SORTIE', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  if (moveType === 'TRANSFERT') {
    return [
      {
        label: 'bon de sortie (dépôt source)',
        initial: { type: 'SORTIE', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
      {
        label: "bon d'entrée (dépôt destination)",
        initial: { type: 'ENTREE', depotId: move.depotDestId ?? move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  if (moveType === 'RETOUR') {
    return [
      {
        label: 'bon de retour',
        initial: { type: 'RETOUR', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  return [];
}

export function MovementsPage() {
  const { isAdmin } = useAuth();
  const [type, setType] = useState('');
  const [depotId, setDepotId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<BonDraft[]>([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [bonInitial, setBonInitial] = useState<BonFormInitial | null>(null);

  function advanceDraft() {
    const next = draftIndex + 1;
    if (next >= pending.length) {
      setPending([]);
      setDraftIndex(0);
    } else {
      setDraftIndex(next);
    }
  }

  const depots = useAsync(() => referentialApi.depots(), []);
  const movements = useAsync(
    () =>
      movementsApi.list({
        type: type || undefined,
        depotId: depotId ? Number(depotId) : undefined,
        from: from || undefined,
        to: to || undefined,
        limit: pageSize,
        offset,
      }),
    [type, depotId, from, to, pageSize, offset],
  );

  // Un changement de filtre ou de taille de page doit revenir au début de la liste.
  function applyFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setOffset(0);
    };
  }

  const total = movements.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + pageSize, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + pageSize < total;

  async function handleCancel(move: Movement) {
    if (!window.confirm(`Annuler le mouvement ${move.id} ?`)) return;
    try {
      await movementsApi.cancel(move.id);
      movements.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Annulation impossible'));
    }
  }

  async function handleReactivate(move: Movement) {
    if (
      !window.confirm(
        `Réactiver le mouvement ${move.id} (${move.type?.code ?? ''}) ? Le stock disponible sera recalculé.`,
      )
    )
      return;
    try {
      await movementsApi.reactivate(move.id);
      movements.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Réactivation impossible'));
    }
  }

  async function handleDelete(move: Movement) {
    if (
      !window.confirm(
        `Supprimer définitivement le mouvement ${move.id} du journal des E/S ?\nCette action est irréversible (l'opération reste tracée dans le journal d'audit).`,
      )
    )
      return;
    try {
      await movementsApi.remove(move.id);
      setSuccess(`Mouvement ${move.id} supprimé du journal.`);
      movements.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Suppression impossible'));
    }
  }

  const columns: Column<Movement>[] = [
    { key: 'movementDate', header: 'Date', render: (m) => formatDate(m.movementDate) },
    { key: 'type', header: 'Type', render: (m) => m.type?.code ?? '—' },
    { key: 'article', header: 'Article', render: (m) => (m.article ? `${m.article.code} — ${m.article.designation}` : '—') },
    { key: 'depot', header: 'Dépôt', render: (m) => m.depot?.label ?? '—' },
    { key: 'location', header: 'Emplacement', render: (m) => m.location?.label ?? '—' },
    { key: 'lot', header: 'Lot', render: (m) => m.lot?.lotNumber ?? '—' },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      render: (m) => (
        <span className={m.sens >= 0 ? 'qty-in' : 'qty-out'}>
          <Qty value={m.quantity} sign={m.sens >= 0 ? '+' : '−'} />
        </span>
      ),
    },
    { key: 'partner', header: 'Acteur', render: (m) => m.partner?.name ?? '-' },
    {
      key: 'status',
      header: 'Statut',
      render: (m) => <Badge tone={m.status === 'ACTIF' ? 'green' : 'neutral'}>{m.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mouvement"
        subtitle="Entrées, sorties, transferts, pertes, ajustements et retours"
        actions={
          <button
            type="button"
            className="btn btn-primary"
            onClick={() => {
              setSuccess(null);
              setCreating(true);
            }}
          >
            Nouveau mouvement
          </button>
        }
      />

      <Card>
        <div className="filters">
          <select value={type} onChange={(e) => applyFilter(setType)(e.target.value)}>
            <option value="">Tous les types</option>
            {MOVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
          <select value={depotId} onChange={(e) => applyFilter(setDepotId)(e.target.value)}>
            <option value="">Tous les dépôts</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
          <input type="date" value={to} onChange={(e) => applyFilter(setTo)(e.target.value)} />
        </div>
      </Card>

      <Card>
        {success ? <SuccessMessage message={success} /> : null}
        {movements.error ? <ErrorMessage message={movements.error} /> : null}
        {movements.loading && !movements.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              ...columns,
              ...(isAdmin
                ? ([
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (m: Movement) =>
                        m.status === 'ACTIF' ? (
                          <button type="button" className="btn btn-small" onClick={() => handleCancel(m)}>
                            Annuler
                          </button>
                        ) : (
                          <span className="btn-group">
                            <button type="button" className="btn btn-small" onClick={() => handleReactivate(m)}>
                              Réactiver
                            </button>
                            <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(m)}>
                              Supprimer
                            </button>
                          </span>
                        ),
                    },
                  ] as Column<Movement>[])
                : []),
            ]}
            rows={movements.data?.items ?? []}
            rowKey={(m) => m.id}
            empty="Aucun mouvement."
          />
        )}

        {total > pageSize || offset > 0 ? (
          <div className="pagination">
            <span className="muted">
              {formatNumber(firstShown)}–{formatNumber(lastShown)} sur {formatNumber(total)} mouvements
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
                {[50, 100, 200, 500].map((n) => (
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

      {creating ? (
        <MovementFormModal
          onClose={() => setCreating(false)}
          onSaved={(moveType, move) => {
            setCreating(false);
            setSuccess('Mouvement enregistré.');
            movements.reload();
            const drafts = buildBonDrafts(move, moveType);
            if (drafts.length > 0) {
              setPending(drafts);
              setDraftIndex(0);
            }
          }}
        />
      ) : null}

      {pending.length > 0 && draftIndex < pending.length ? (
        <Modal title="Élaborer un bon" onClose={() => setPending([])}>
          <p>
            Voulez-vous élaborer un {pending[draftIndex].label} pour le mouvement enregistré ?
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={advanceDraft}>
              Non
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setBonInitial(pending[draftIndex].initial)}>
              Oui, élaborer
            </button>
          </div>
        </Modal>
      ) : null}

      {bonInitial ? (
        <BonFormModal
          initial={bonInitial}
          onClose={() => {
            setBonInitial(null);
            advanceDraft();
          }}
          onSaved={() => {
            setBonInitial(null);
            advanceDraft();
          }}
        />
      ) : null}
    </>
  );
}

function MovementFormModal({
  onClose,
  onSaved,
}: {
  onClose: () => void;
  onSaved: (moveType: string, move: Movement) => void;
}) {
  const articles = useAsync(() => articlesApi.list(), []);
  const depots = useAsync(() => referentialApi.depots(), []);
  const locations = useAsync(() => stockApi.locations(), []);
  const partners = useAsync(() => referentialApi.partners(), []);
  // Lots fetches uniquement pour l'article selectionne (le serveur filtre par articleId).
  const [form, setForm] = useState({
    type: 'ENTREE',
    articleId: '',
    quantity: '',
    movementDate: todayInput(),
    depotId: '',
    locationId: '',
    depotDestId: '',
    locationDestId: '',
    lotId: '',
    partnerId: '',
    docNumber: '',
    unitPrice: '',
    observation: '',
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Un RETOUR propose aussi les lots masques pour fin de quantite : la marchandise
  // revient sur le lot dont elle est sortie, meme si ce lot est aujourd'hui a zero.
  const isRetour = form.type === 'RETOUR';
  const lots = useAsync(
    () =>
      form.articleId
        ? lotsApi.list({ articleId: Number(form.articleId), includeExhausted: isRetour })
        : Promise.resolve([] as Lot[]),
    [form.articleId, isRetour],
  );

  const articleLots = (lots.data ?? []).filter((l) => String(l.articleId) === form.articleId);
  // Pour un RETOUR, les lots par lesquels la marchandise est partiee chez un client
  // remontent en tete, du plus recent au plus ancien : ce sont les sorties encore ouvertes
  // qui ont le plus de chances d'etre retournees. Un lot jamais sorti passe en fin de liste.
  const orderedLots = isRetour
    ? [...articleLots].sort((a, b) => {
        const da = a.lastExitAt ? Date.parse(a.lastExitAt) : 0;
        const db = b.lastExitAt ? Date.parse(b.lastExitAt) : 0;
        if (db !== da) return db - da;
        if ((b.sortiQty ?? 0) !== (a.sortiQty ?? 0)) return (b.sortiQty ?? 0) - (a.sortiQty ?? 0);
        return a.lotNumber.localeCompare(b.lotNumber);
      })
    : articleLots;
  const selectedArticle = (articles.data ?? []).find((a) => String(a.id) === form.articleId);
  const lotSelectionnel = articleLots.find((l) => String(l.id) === form.lotId) ?? null;
  const isTransfer = form.type === 'TRANSFERT';

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Prix par defaut : prix de l'article a la selection, puis prix du lot si le lot en a un.
  function handleArticleChange(value: string) {
    const article = (articles.data ?? []).find((a) => String(a.id) === value);
    update('articleId', value);
    // Un lot choisi pour un autre article n'est plus valable.
    update('lotId', '');
    update('unitPrice', article?.unitPrice != null ? String(article.unitPrice) : '');
  }

  function handleLotChange(value: string) {
    update('lotId', value);
    const lot = articleLots.find((l) => String(l.id) === value);
    if (lot?.unitPrice != null) update('unitPrice', String(lot.unitPrice));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const errors: string[] = [];
    if (!form.articleId) errors.push("sélectionnez un article");
    if (!form.depotId) errors.push('sélectionnez un dépôt');
    if (!form.movementDate) errors.push('renseignez la date');
    if (!(Number(form.quantity) > 0)) errors.push('saisissez une quantité supérieure à 0');
    if (isTransfer && !form.depotDestId) errors.push('sélectionnez un dépôt de destination');
    if (selectedArticle?.isLotTracked && !form.lotId) {
      errors.push("cet article est suivi par lot : sélectionnez un lot (créez-en un depuis « Lots » si nécessaire)");
    }
    if (errors.length > 0) {
      setError(`Champs à compléter : ${errors.join(' ; ')}.`);
      return;
    }

    setSubmitting(true);
    const payload: MovementPayload = {
      type: form.type,
      articleId: Number(form.articleId),
      quantity: Number(form.quantity),
      movementDate: form.movementDate,
      depotId: Number(form.depotId),
      locationId: form.locationId ? Number(form.locationId) : null,
      depotDestId: isTransfer && form.depotDestId ? Number(form.depotDestId) : null,
      locationDestId: isTransfer && form.locationDestId ? Number(form.locationDestId) : null,
      lotId: form.lotId ? Number(form.lotId) : null,
      partnerId: form.partnerId ? Number(form.partnerId) : null,
      docNumber: form.docNumber || null,
      unitPrice: toNumberOrNull(form.unitPrice),
      observation: form.observation || null,
    };
    try {
      const created = await movementsApi.create(payload);
      const createdMove = (created as { sortie?: Movement }).sortie ?? (created as Movement);
      onSaved(form.type, createdMove);
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouveau mouvement" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid" noValidate>
        <ErrorMessage message={error} />
        <Field label="Type">
          <select value={form.type} onChange={(e) => update('type', e.target.value)}>
            {MOVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
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
        <Field label="Date">
          <input type="date" value={form.movementDate} onChange={(e) => update('movementDate', e.target.value)} required />
        </Field>
        <Field label="Dépôt">
          <select value={form.depotId} onChange={(e) => update('depotId', e.target.value)} required>
            <option value="">—</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
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
        {isTransfer ? (
          <>
            <Field label="Dépôt destination">
              <select value={form.depotDestId} onChange={(e) => update('depotDestId', e.target.value)} required>
                <option value="">—</option>
                {depots.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Emplacement destination">
              <select value={form.locationDestId} onChange={(e) => update('locationDestId', e.target.value)}>
                <option value="">—</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field
          label={selectedArticle?.isLotTracked ? 'Lot (obligatoire)' : 'Lot'}
          hint={
            selectedArticle?.isLotTracked && articleLots.length === 0
              ? "Aucun lot pour cet article : créez-en un dans la page « Lots »."
              : isRetour && articleLots.length > 0
                ? 'Les lots par lesquels la marchandise est partie chez un client sont proposés en premier, y compris épuisés : le stock peut ainsi revenir sur le lot d’origine.'
                : undefined
          }
        >
            <select value={form.lotId} onChange={(e) => handleLotChange(e.target.value)}>
              <option value="">-</option>
              {orderedLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}
                  {l.sortiQty ? ` (sorti ${formatNumber(l.sortiQty)}${l.exhausted ? ', épuisé' : ''})` : l.exhausted ? ' (épuisé)' : ` (${formatNumber(l.quantity)})`}
                </option>
              ))}
            </select>
            {lotSelectionnel ? (
              <p className="muted">
                Stock du lot {lotSelectionnel.lotNumber} :{' '}
                <Qty value={lotSelectionnel.quantity} />
              </p>
            ) : null}
        </Field>
        <Field label="Acteur">
          <select value={form.partnerId} onChange={(e) => update('partnerId', e.target.value)}>
            <option value="">—</option>
            {partners.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="N° document">
          <input value={form.docNumber} onChange={(e) => update('docNumber', e.target.value)} />
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
