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
  ACTIF: 'Active',
  REALISE: 'Validée',
  ANNULE: 'Annulée',
  EXPIRE: 'Expirée',
};

const STATUS_TONE: Record<ReservationStatus, string> = {
  ACTIF: 'badge-info',
  REALISE: 'badge-green',
  ANNULE: 'badge-red',
  EXPIRE: 'badge-neutral',
};

const FILTER_OPTIONS: { value: string; label: string }[] = [
  { value: '', label: 'Toutes' },
  { value: 'ACTIF', label: 'Actives' },
  { value: 'REALISE', label: 'Validées' },
  { value: 'ANNULE', label: 'Annulées' },
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

  const reservations = useAsync(() => reservationsApi.list({ status: statut || undefined }), [statut]);
  const synthese = useAsync(() => reservationsApi.synthesis(), []);

  async function runAction(id: string, action: 'valider' | 'annuler', label: string) {
    if (!window.confirm(`${label} la réservation ${id} ?`)) return;
    setBusy(id);
    setActionError(null);
    setNotes([]);
    try {
      // D20 : la validation transforme la promesse en SORTIES reelles. Une note
      // signale les lots amputes avant validation, et la validation est refusee
      // (400) si le stock ne couvre plus la promesse.
      const updated = action === 'valider' ? await reservationsApi.validate(id) : await reservationsApi.cancel(id);
      if (action === 'valider' && 'notes' in updated && updated.notes?.length) setNotes(updated.notes);
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
    // D19 : valider et annuler ne relevent plus du meme droit. Valider transforme
    // les mouvements de blocage en SORTIES (sortie reelle du stock), annuler rend
    // simplement le stock : un profil peut donc annuler sans pouvoir valider.
    ...(can('reservation:write') || can('reservation:decide')
      ? [
          {
            key: 'actions',
            header: '',
            className: 'right',
            render: (r: Reservation) =>
              r.status === 'ACTIF' ? (
                <div className="row-actions">
                  {can('reservation:decide') ? (
                    <button
                      type="button"
                      className="btn btn-small btn-primary"
                      disabled={busy === r.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        void runAction(r.id, 'valider', 'Valider');
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
                  {r.closeReason === 'EXPIRE' ? 'Expirée automatiquement' : '—'}
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
          <div className="kpi kpi-info">
            <span className="kpi-value">{synthese.data.actives}</span>
            <span className="kpi-label">Réservations actives</span>
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
                  onClick={() => void runAction(detail.id, 'valider', 'Valider')}
                >
                  Valider
                </button>
              ) : null}
            </div>
          ) : null}
        </Modal>
      ) : null}
    </>
  );
}
