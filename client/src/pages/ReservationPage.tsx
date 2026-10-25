import { useState } from 'react';
import { reservationsApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { ReservationFormModal } from '../components/ReservationFormModal';
import type { Reservation, ReservationStatus } from '../types';
import { Qty } from '../components/Qty';
import { formatDate, formatDateTime } from '../utils/format';
import { useAuth } from '../context/AuthContext';

const STATUS_LABEL: Record<ReservationStatus, string> = {
  DEMANDE: 'Demande en attente',
  ACTIF: 'Active (réelle)',
  REALISE: 'Validée',
  PARTIELLEMENT_REALISE: 'Partiellement validée',
  ANNULE: 'Annulée',
  REFUSE: 'Refusée',
  EXPIRE: 'Expirée',
};

const STATUS_TONE: Record<ReservationStatus, string> = {
  DEMANDE: 'badge-warning',
  ACTIF: 'badge-info',
  REALISE: 'badge-green',
  PARTIELLEMENT_REALISE: 'badge-warning',
  ANNULE: 'badge-red',
  REFUSE: 'badge-red',
  EXPIRE: 'badge-neutral',
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'DEMANDE', label: 'Demandes en attente' },
  { value: 'ACTIF', label: 'Actives' },
  { value: 'REALISE', label: 'Validées' },
  { value: 'PARTIELLEMENT_REALISE', label: 'Partiellement validées' },
  { value: 'ANNULE', label: 'Annulées' },
  { value: 'REFUSE', label: 'Refusées' },
  { value: 'EXPIRE', label: 'Expirées' },
];

export function ReservationPage() {
  const { can } = useAuth();
  const [statut, setStatut] = useState('');
  const [formOpen, setFormOpen] = useState(false);
  const [detail, setDetail] = useState<Reservation | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [notes, setNotes] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  // D34 : validation en deux etapes, dans des fenetres dediees.
  // Etape 1 : la reservation a-t-elle ete integralement prise (OUI / NON) ?
  // Etape 2 (si NON) : saisie des quantites reellement prises par ligne.
  const [validateTarget, setValidateTarget] = useState<Reservation | null>(null);
  const [partialTarget, setPartialTarget] = useState<Reservation | null>(null);
  const [partialQtys, setPartialQtys] = useState<Record<string, string>>({});
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);

  const reservations = useAsync(() => reservationsApi.list({ status: statut || undefined }), [statut]);
  const synthese = useAsync(() => reservationsApi.synthesis(), []);

  /** Ouvre l'etape 1 de la validation. Ferme le detail pour ne pas empiler deux fenetres. */
  function openValidation(reservation: Reservation) {
    setActionError(null);
    setNotes([]);
    setValidationError(null);
    setPartialTarget(null);
    setValidateTarget(reservation);
    setDetail(null);
  }

  async function applyValidated(updated: Reservation & { notes?: string[] }) {
    setNotes(updated.notes ?? []);
    setValidateTarget(null);
    setPartialTarget(null);
    setPartialQtys({});
    setDetail(updated);
    reservations.reload();
    synthese.reload();
  }

  /** OUI : la reservation a ete integralement prise -> sorties completes, statut REALISE. */
  async function confirmFullValidation() {
    if (!validateTarget) return;
    setValidating(true);
    setValidationError(null);
    try {
      const updated = await reservationsApi.validate(validateTarget.id);
      await applyValidated(updated);
    } catch (err) {
      setValidationError(errorMessage(err, 'Validation impossible'));
    } finally {
      setValidating(false);
    }
  }

  /** NON : on passe a la saisie des quantites reellement prises. */
  function goPartial() {
    if (!validateTarget) return;
    const initial: Record<string, string> = {};
    for (const line of validateTarget.lines) initial[line.id] = String(line.quantity);
    setPartialQtys(initial);
    setValidationError(null);
    setPartialTarget(validateTarget);
    setValidateTarget(null);
  }

  /** Confirme la validation partielle : seules les quantites saisies sortent, le reste est libere. */
  async function confirmPartialValidation() {
    if (!partialTarget) return;
    const partial: Array<{ lineId: string; quantityTaken: number }> = [];
    for (const line of partialTarget.lines) {
      const raw = (partialQtys[line.id] ?? '').trim().replace(',', '.');
      const taken = raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(taken) || taken < 0) {
        setValidationError(`Quantité invalide pour ${line.code}.`);
        return;
      }
      if (taken > Number(line.quantity) + 1e-9) {
        setValidationError(
          `La quantité prise pour ${line.code} ne peut pas dépasser la quantité réservée (${line.quantity}).`,
        );
        return;
      }
      partial.push({ lineId: line.id, quantityTaken: taken });
    }
    setValidating(true);
    setValidationError(null);
    try {
      const updated = await reservationsApi.validate(partialTarget.id, partial);
      await applyValidated(updated);
    } catch (err) {
      setValidationError(errorMessage(err, 'Validation impossible'));
    } finally {
      setValidating(false);
    }
  }

  async function runAction(id: string, action: 'annuler' | 'approuver' | 'refuser', label: string) {
    if (!window.confirm(`${label} la réservation ${id} ?`)) return;
    setBusy(id);
    setActionError(null);
    setNotes([]);
    try {
      // D33 : une DEMANDE doit etre approuvee pour devenir une reservation REELLE.
      let updated: Reservation;
      if (action === 'approuver') {
        updated = await reservationsApi.approve(id);
      } else if (action === 'refuser') {
        updated = await reservationsApi.refuse(id);
      } else {
        updated = await reservationsApi.cancel(id);
      }
      setDetail((prev) => (prev && prev.id === updated.id ? updated : prev));
      reservations.reload();
      synthese.reload();
    } catch (err) {
      setActionError(errorMessage(err, 'Opération impossible'));
    } finally {
      setBusy(null);
    }
  }

  const columns: Column<Reservation>[] = [
    { key: 'ref', header: 'Référence' },
    { key: 'partner', header: 'Acteur', render: (r) => r.partner.name },
    {
      key: 'staff',
      header: 'Personnel',
      render: (r) => r.staffLabel,
    },
    {
      key: 'period',
      header: 'Période',
      render: (r) => `${formatDate(r.startDate)} → ${formatDate(r.endDate)}`,
    },
    {
      key: 'lines',
      header: 'Articles',
      render: (r) => (
        <span className="truncate">
          {r.lines.map((l, i) => (
            <span key={l.id}>
              {i > 0 ? ', ' : ''}
              {l.code} (
              <Qty value={l.quantity}>{l.unit ? ` ${l.unit}` : null}</Qty>)
            </span>
          ))}
        </span>
      ),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (r) => <Badge tone={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge>,
    },
    // D19/D33 : approuver une DEMANDE (ADMIN/TOP_MGMT), valider une RESERVATION REELLE
    // (ADMIN), annuler DEMANDE ou RESERVATION (selon droit).
    ...(can('reservation:write') || can('reservation:decide') || can('reservation:approve')
      ? [
          {
            key: 'actions',
            header: '',
            className: 'right',
            render: (r: Reservation) =>
              r.status === 'DEMANDE' ? (
                <div className="row-actions">
                  {can('reservation:approve') ? (
                    <>
                      <button
                        type="button"
                        className="btn btn-small btn-primary"
                        disabled={busy === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runAction(r.id, 'approuver', 'Approuver');
                        }}
                      >
                        Approuver
                      </button>
                      <button
                        type="button"
                        className="btn btn-small btn-danger"
                        disabled={busy === r.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          void runAction(r.id, 'refuser', 'Refuser');
                        }}
                      >
                        Refuser
                      </button>
                    </>
                  ) : null}
                  {can('reservation:write') && !can('reservation:approve') ? (
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      disabled={busy === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction(r.id, 'annuler', 'Annuler');
                      }}
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              ) : r.status === 'ACTIF' ? (
                <div className="row-actions">
                  {can('reservation:decide') ? (
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      disabled={busy === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        openValidation(r);
                      }}
                    >
                      Valider
                    </button>
                  ) : null}
                  {can('reservation:write') ? (
                    <button
                      type="button"
                      className="btn btn-small btn-danger"
                      disabled={busy === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction(r.id, 'annuler', 'Annuler');
                      }}
                    >
                      Annuler
                    </button>
                  ) : null}
                </div>
              ) : (
                <span className="muted">
                  {r.closeReason === 'EXPIRE'
                    ? 'Expirée automatiquement'
                    : r.closeReason === 'REFUSE'
                      ? 'Refusée par la direction'
                      : '—'}
                </span>
              ),
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        title="Réservations"
        subtitle="Stock bloqué pour un acteur sur une période donnée"
        actions={
          can('reservation:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setFormOpen(true)}>
              + Nouvelle réservation
            </button>
          ) : null
        }
      />

      {synthese.data ? (
        <div className="kpi-grid">
          <div className="kpi kpi-warning">
            <span className="kpi-value">{synthese.data.demandesEnAttente ?? 0}</span>
            <span className="kpi-label">Demandes en attente</span>
          </div>
          <div className="kpi kpi-info">
            <span className="kpi-value">{synthese.data.actives}</span>
            <span className="kpi-label">Réservations actives</span>
          </div>
          <div className="kpi kpi-danger">
            <span className="kpi-value">{synthese.data.refusees ?? 0}</span>
            <span className="kpi-label">Demandes refusées</span>
          </div>
          <div className="kpi kpi-orange">
            <span className="kpi-value">{synthese.data.expire7}</span>
            <span className="kpi-label">Expirent sous 7 jours</span>
          </div>
          <div className="kpi kpi-green">
            <span className="kpi-value">{synthese.data.realises}</span>
            <span className="kpi-label">Validées</span>
          </div>
          <div className="kpi">
            <span className="kpi-value">{synthese.data.expirees}</span>
            <span className="kpi-label">Expirées</span>
          </div>
        </div>
      ) : null}

      <Card>
        <div className="filters">
          <select value={statut} onChange={(e) => setStatut(e.target.value)}>
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        {actionError ? <ErrorMessage message={actionError} /> : null}
        {reservations.error ? <ErrorMessage message={reservations.error} /> : null}
        {reservations.loading && !reservations.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={reservations.data ?? []}
            rowKey={(r) => r.id}
            onRowClick={(r) => setDetail(r)}
            empty="Aucune réservation."
          />
        )}
      </Card>

      {formOpen ? (
        <ReservationFormModal
          onClose={() => setFormOpen(false)}
          onSaved={() => {
            setFormOpen(false);
            reservations.reload();
            synthese.reload();
          }}
        />
      ) : null}

      {detail ? (
        <Modal title={`Réservation ${detail.ref}`} onClose={() => setDetail(null)}>
          <div className="detail-summary">
            <div>
              <span className="muted">Acteur</span>
              <strong>{detail.partner.name}</strong>
            </div>
            <div>
              <span className="muted">Personnel</span>
              <strong>{detail.staffLabel}</strong>
            </div>
            <div>
              <span className="muted">PAR</span>
              <strong>
                {detail.creator ? (detail.creator.displayName ?? detail.creator.login ?? `utilisateur ${detail.creator.id}`) : '—'}
              </strong>
            </div>
            <div>
              <span className="muted">Période</span>
              <strong>
                {formatDate(detail.startDate)} → {formatDate(detail.endDate)}
              </strong>
            </div>
            <div>
              <span className="muted">Statut</span>
              <strong>
                <Badge tone={STATUS_TONE[detail.status]}>{STATUS_LABEL[detail.status]}</Badge>
              </strong>
            </div>
            <div>
              <span className="muted">Créée le</span>
              <strong>{formatDateTime(detail.createdAt)}</strong>
            </div>
            {detail.closedAt ? (
              <div>
                <span className="muted">Clôturée le</span>
                <strong>
                  {formatDateTime(detail.closedAt)}
                  {detail.closer ? ` par ${detail.closer.displayName ?? detail.closer.id}` : ''}
                  {detail.closeReason === 'EXPIRE' ? ' (échéance)' : ''}
                </strong>
              </div>
            ) : null}
          </div>

          {detail.observation ? <p className="muted">{detail.observation}</p> : null}

          <h3 className="form-section-title">Articles réservés</h3>
          <DataTable
            columns={[
              { key: 'code', header: 'Article' },
              {
                key: 'quantity',
                header: 'Quantité',
                align: 'right',
                render: (r) => <Qty value={r.quantity}>{r.unit ? ` ${r.unit}` : null}</Qty>,
              },
            ] as Column<{ code: string; quantity: number; unit: string | null }>[]}
            rows={detail.lines.map((l) => ({
              code: `${l.code} — ${l.designation}`,
              quantity: l.quantity,
              unit: l.unit,
            }))}
            rowKey={(r) => r.code}
            empty="Aucun article."
          />

          <h3 className="form-section-title">Lots réservés (FEFO à la création)</h3>
          <DataTable
            columns={[
              { key: 'lot', header: 'Lot' },
              { key: 'expiry', header: 'Péremption' },
              { key: 'place', header: 'Dépôt / emplacement' },
              {
                key: 'quantity',
                header: 'Réservé',
                align: 'right',
                render: (r) => <Qty value={r.quantity}>{r.unit ? ` ${r.unit}` : null}</Qty>,
              },
              {
                key: 'remaining',
                header: 'Encore promis',
                align: 'right',
                render: (r) => <Qty value={r.remaining}>{r.unit ? ` ${r.unit}` : null}</Qty>,
              },
              { key: 'status', header: 'État' },
            ] as Column<{
              lot: string;
              expiry: string;
              place: string;
              quantity: number;
              remaining: number;
              unit: string | null;
              status: string;
            }>[]}
            rows={detail.allocations.map((a) => {
              // L'unité est portée par la ligne d'article : on la retrouve par article.
              const unit = detail.lines.find((l) => l.articleId === a.articleId)?.unit ?? null;
              return {
                lot: a.lotNumber ?? '—',
                expiry: a.expiryDate ? formatDate(a.expiryDate) : '—',
                place: [a.depot, a.location].filter(Boolean).join(' / '),
                quantity: a.quantity,
                remaining: a.remaining,
                unit,
                status:
                  detail.status !== 'ACTIF'
                    ? 'Consommée'
                    : a.remaining === 0
                      ? 'Intégralement sortie'
                      : a.takenQuantity > 0
                        ? `Amputée de ${a.takenQuantity}`
                        : 'Active',
              };
            })}
            rowKey={(r, i) => `${r.lot}-${i}`}
            empty="Aucun lot réservé."
          />

          {notes.length ? (
            <div className="detail-summary">
              <div>
                <span className="muted">Note de validation</span>
                {notes.map((n, i) => (
                  <p key={i} className="strong">
                    {n}
                  </p>
                ))}
              </div>
            </div>
          ) : null}

          {detail.moves.length ? (
            <>
              <h3 className="form-section-title">Sorties enregistrées à la validation</h3>
              <DataTable
                columns={[
                  { key: 'lot', header: 'Lot' },
                  { key: 'expiry', header: 'Péremption' },
                  {
                    key: 'quantity',
                    header: 'Sorti',
                    align: 'right',
                    render: (r) => <Qty value={r.quantity}>{r.unit ? ` ${r.unit}` : null}</Qty>,
                  },
                  { key: 'place', header: 'Dépôt / emplacement' },
                  { key: 'status', header: 'Mouvement' },
                ] as Column<{ lot: string; expiry: string; quantity: number; unit: string | null; place: string; status: string }>[]}
                rows={detail.moves.map((m) => ({
                  lot: m.lotNumber ?? '—',
                  expiry: m.expiryDate ? formatDate(m.expiryDate) : '—',
                  quantity: m.quantity,
                  unit: m.unit,
                  place: [m.depot, m.location].filter(Boolean).join(' / '),
                  status: m.status === 'ACTIF' ? 'Actif' : 'Annulé',
                }))}
                rowKey={(r, i) => `${r.lot}-${i}`}
                empty="Aucune sortie."
              />
            </>
          ) : null}

          {detail.status === 'ACTIF' && (can('reservation:write') || can('reservation:decide')) ? (
            <div className="form-actions">
              {can('reservation:write') ? (
                <button
                  type="button"
                  className="btn btn-danger"
                  disabled={busy === detail.id}
                  onClick={() => void runAction(detail.id, 'annuler', 'Annuler')}
                >
                  Annuler la réservation
                </button>
              ) : null}
              {can('reservation:decide') ? (
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={busy === detail.id}
                  onClick={() => openValidation(detail)}
                >
                  Valider
                </button>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}

      {/* D34 - Etape 1 : la reservation a-t-elle ete integralement prise ? */}
      {validateTarget ? (
        <Modal title={`Valider la réservation ${validateTarget.ref}`} onClose={() => setValidateTarget(null)}>
          <p className="validation-question">La réservation a-t-elle été intégralement prise ?</p>

          <div className="validation-summary">
            <div>
              <span className="muted">Acteur</span>
              <strong>{validateTarget.partner.name}</strong>
            </div>
            <div>
              <span className="muted">Période</span>
              <strong>
                {formatDate(validateTarget.startDate)} → {formatDate(validateTarget.endDate)}
              </strong>
            </div>
          </div>

          <DataTable
            columns={[
              { key: 'code', header: 'Article' },
              {
                key: 'quantity',
                header: 'Quantité réservée',
                align: 'right',
                render: (r) => <Qty value={r.quantity}>{r.unit ? ` ${r.unit}` : null}</Qty>,
              },
            ] as Column<{ code: string; quantity: number; unit: string | null }>[]}
            rows={validateTarget.lines.map((l) => ({
              code: `${l.code} — ${l.designation}`,
              quantity: l.quantity,
              unit: l.unit,
            }))}
            rowKey={(r) => r.code}
            empty="Aucun article."
          />

          {validationError ? <ErrorMessage message={validationError} /> : null}

          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setValidateTarget(null)} disabled={validating}>
              Fermer
            </button>
            <button type="button" className="btn btn-danger" onClick={goPartial} disabled={validating}>
              Non
            </button>
            <button type="button" className="btn btn-primary" onClick={() => void confirmFullValidation()} disabled={validating}>
              {validating ? 'Validation…' : 'Oui'}
            </button>
          </div>
        </Modal>
      ) : null}

      {/* D34 - Etape 2 : quantites reellement prises (validation partielle) */}
      {partialTarget ? (
        <Modal title={`Quantités réellement prises — ${partialTarget.ref}`} onClose={() => setPartialTarget(null)}>
          <p className="validation-question">
            Indiquez la quantité réellement prise pour chaque article. Les quantités non prises seront automatiquement
            libérées et la réservation sera marquée « Partiellement validée ».
          </p>

          <div className="table-wrap">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Article</th>
                  <th className="right">Réservée</th>
                  <th className="right">Prise</th>
                  <th className="right">Libérée</th>
                </tr>
              </thead>
              <tbody>
                {partialTarget.lines.map((line) => {
                  const reserved = Number(line.quantity);
                  const raw = (partialQtys[line.id] ?? '').replace(',', '.');
                  const taken = raw === '' ? 0 : Number(raw);
                  const released = Number.isFinite(taken) ? Math.max(reserved - taken, 0) : reserved;
                  return (
                    <tr key={line.id}>
                      <td>
                        {line.code} — {line.designation}
                      </td>
                      <td className="right">
                        <Qty value={reserved}>{line.unit ? ` ${line.unit}` : null}</Qty>
                      </td>
                      <td className="right">
                        <input
                          type="number"
                          min="0"
                          max={reserved}
                          step="any"
                          value={partialQtys[line.id] ?? ''}
                          onChange={(e) => setPartialQtys((prev) => ({ ...prev, [line.id]: e.target.value }))}
                          className="qty-input"
                          aria-label={`Quantité prise pour ${line.code}`}
                        />
                      </td>
                      <td className="right">
                        <Qty value={released}>{line.unit ? ` ${line.unit}` : null}</Qty>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {validationError ? <ErrorMessage message={validationError} /> : null}

          <div className="form-actions">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setPartialTarget(null);
                setValidateTarget(partialTarget);
                setValidationError(null);
              }}
              disabled={validating}
            >
              Retour
            </button>
            <button type="button" className="btn" onClick={() => setPartialTarget(null)} disabled={validating}>
              Annuler
            </button>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => void confirmPartialValidation()}
              disabled={validating}
            >
              {validating ? 'Validation…' : 'Confirmer la validation partielle'}
            </button>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
