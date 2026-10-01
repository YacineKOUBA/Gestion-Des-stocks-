import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { inventoriesApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { InventoryDecision, InventoryLine } from '../types';
import { formatDateTime } from '../utils/format';

export function InventoryDetailPage() {
  const { id = '' } = useParams();
  const { isAdmin } = useAuth();
  const detail = useAsync(() => inventoriesApi.get(id), [id]);
  const [countTarget, setCountTarget] = useState<InventoryLine | null>(null);
  const [validating, setValidating] = useState<InventoryLine | null>(null);

  async function handlePopulate() {
    if (!detail.data?.depotId) {
      window.alert("Aucun dépôt associé à cette campagne.");
      return;
    }
    try {
      await inventoriesApi.populate(id, detail.data.depotId);
      detail.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Population impossible'));
    }
  }

  async function handleClose() {
    if (!window.confirm('Clôturer cette campagne ?')) return;
    try {
      await inventoriesApi.close(id);
      detail.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Clôture impossible'));
    }
  }

  const isOpen = detail.data?.status === 'OUVERTE';

  const columns: Column<InventoryLine>[] = [
    { key: 'article', header: 'Article', render: (l) => (l.article ? `${l.article.code} — ${l.article.designation}` : '—') },
    { key: 'lot', header: 'Lot', render: (l) => l.lot?.lotNumber ?? '—' },
    { key: 'location', header: 'Emplacement', render: (l) => l.location?.label ?? '—' },
    { key: 'qtyTheoretical', header: 'Théorique', align: 'right', render: (l) => <Qty value={l.qtyTheoretical} /> },
    { key: 'qtyCounted', header: 'Compté', align: 'right', render: (l) => (l.qtyCounted ? <Qty value={l.qtyCounted} /> : '—') },
    {
      key: 'variance',
      header: 'Écart',
      align: 'right',
      render: (l) =>
        l.variance ? (
          <span className={Number(l.variance) < 0 ? 'qty-out' : 'qty-in'}>
            <Qty value={l.variance} />
          </span>
        ) : (
          '—'
        ),
    },
    { key: 'status', header: 'Statut', render: (l) => <Badge tone={lineTone(l.status)}>{l.status}</Badge> },
    {
      key: 'actions',
      header: 'Actions',
      render: (l) =>
        l.status !== 'VALIDE' && l.status !== 'REFUSE' ? (
          <div className="row-actions">
            {isOpen ? (
              <button type="button" className="btn btn-small" onClick={() => setCountTarget(l)}>
                Compter
              </button>
            ) : null}
            {isAdmin ? (
              <button type="button" className="btn btn-small" onClick={() => setValidating(l)}>
                Valider
              </button>
            ) : null}
          </div>
        ) : null,
    },
  ];

  if (detail.loading && !detail.data) return <Spinner />;
  if (detail.error) return <ErrorMessage message={detail.error} />;
  if (!detail.data) return null;

  return (
    <>
      <PageHeader
        title={`Inventaire ${detail.data.code}`}
        subtitle={detail.data.title ?? undefined}
        actions={
          <div className="row-actions">
            <Link to="/inventaires" className="btn">
              Retour
            </Link>
            {isAdmin && isOpen ? (
              <>
                <button type="button" className="btn" onClick={handlePopulate}>
                  Générer les lignes
                </button>
                <button type="button" className="btn btn-primary" onClick={handleClose}>
                  Clôturer
                </button>
              </>
            ) : null}
          </div>
        }
      />

      <Card>
        <div className="detail-summary">
          <div>
            <span className="muted">Dépôt</span>
            <strong>{detail.data.depot?.label ?? '—'}</strong>
          </div>
          <div>
            <span className="muted">Statut</span>
            <Badge tone={isOpen ? 'orange' : 'green'}>{detail.data.status}</Badge>
          </div>
          <div>
            <span className="muted">Ouvert le</span>
            <strong>{formatDateTime(detail.data.openedAt)}</strong>
          </div>
          <div>
            <span className="muted">Clôturé le</span>
            <strong>{detail.data.closedAt ? formatDateTime(detail.data.closedAt) : '—'}</strong>
          </div>
        </div>
      </Card>

      <Card title={`Lignes (${detail.data.lines.length})`}>
        <DataTable columns={columns} rows={detail.data.lines} rowKey={(l) => l.id} empty="Aucune ligne." />
      </Card>

      {countTarget ? (
        <CountModal
          inventoryId={id}
          line={countTarget}
          onClose={() => setCountTarget(null)}
          onSaved={() => {
            setCountTarget(null);
            detail.reload();
          }}
        />
      ) : null}

      {validating ? (
        <ValidateModal
          inventoryId={id}
          line={validating}
          onClose={() => setValidating(null)}
          onSaved={() => {
            setValidating(null);
            detail.reload();
          }}
        />
      ) : null}
    </>
  );
}

function lineTone(status: string): string {
  switch (status) {
    case 'VALIDE':
      return 'green';
    case 'COMPTE':
      return 'info';
    case 'A_COMPTER':
      return 'orange';
    case 'REFUSE':
      return 'red';
    default:
      return 'neutral';
  }
}

function CountModal({
  inventoryId,
  line,
  onClose,
  onSaved,
}: {
  inventoryId: string;
  line: InventoryLine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [qtyCounted, setQtyCounted] = useState(
    line.qtyCounted ? String(Number(line.qtyCounted)) : '',
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await inventoriesApi.countLine(inventoryId, line.id, { qtyCounted: Number(qtyCounted) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Saisie impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Saisir la quantité comptée" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <div className="detail-summary">
          <div>
            <span className="muted">Article</span>
            <strong>{line.article ? `${line.article.code} — ${line.article.designation}` : '—'}</strong>
          </div>
          <div>
            <span className="muted">Lot</span>
            <strong>{line.lot?.lotNumber ?? '—'}</strong>
          </div>
          <div>
            <span className="muted">Emplacement</span>
            <strong>{line.location?.label ?? '—'}</strong>
          </div>
          <div>
            <span className="muted">Théorique</span>
            <strong><Qty value={line.qtyTheoretical} /></strong>
          </div>
        </div>
        <Field label="Quantité comptée">
          <input
            type="number"
            step="0.001"
            min="0"
            value={qtyCounted}
            onChange={(e) => setQtyCounted(e.target.value)}
            required
            autoFocus
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

function ValidateModal({
  inventoryId,
  line,
  onClose,
  onSaved,
}: {
  inventoryId: string;
  line: InventoryLine;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [decision, setDecision] = useState<InventoryDecision>('AJUSTEMENT');
  const [lossReason, setLossReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await inventoriesApi.validateLine(inventoryId, line.id, {
        decision,
        lossReason: decision === 'PERTE' ? lossReason : undefined,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Validation impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Valider la ligne d'inventaire" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <p className="muted">
          Article : {line.article?.code} — {line.article?.designation}
          <br />
            Écart : <Qty value={line.variance} />
        </p>
        <Field label="Décision">
          <select value={decision} onChange={(e) => setDecision(e.target.value as InventoryDecision)}>
            <option value="AJUSTEMENT">AJUSTEMENT</option>
            <option value="PERTE">PERTE</option>
          </select>
        </Field>
        {decision === 'PERTE' ? (
          <Field label="Motif de la perte">
            <input value={lossReason} onChange={(e) => setLossReason(e.target.value)} />
          </Field>
        ) : null}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Validation…' : 'Valider'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
