import { useState } from 'react';
import { bonsApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Card, ErrorMessage, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Bon } from '../types';
import { formatDate, formatMoney } from '../utils/format';
import { Qty } from '../components/Qty';
import { BonFormModal } from '../components/BonFormModal';

export function BonsPage() {
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Bon | null>(null);
  const bons = useAsync(() => bonsApi.list(), []);

  const columns: Column<Bon>[] = [
    { key: 'ref', header: 'Référence' },
    { key: 'type', header: 'Type' },
    { key: 'bonDate', header: 'Date', render: (b) => formatDate(b.bonDate) },
    { key: 'depot', header: 'Dépôt', render: (b) => b.depot?.label ?? '—' },
    { key: 'partner', header: 'Acteur', render: (b) => b.partner?.name ?? '-' },
    { key: 'lines', header: 'Lignes', align: 'right', render: (b) => b.lines.length },
    { key: 'montantTotal', header: 'Montant', align: 'right', render: (b) => formatMoney(b.montantTotal, b.currency) },
  ];

  return (
    <>
      <PageHeader
        title="Document"
        subtitle="Bons de sortie, livraison, transfert et retour (prix unitaire et montants)"
        actions={
          <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
            Nouveau bon
          </button>
        }
      />

      <Card>
        {bons.error ? <ErrorMessage message={bons.error} /> : null}
        {bons.loading && !bons.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={bons.data ?? []}
            rowKey={(b) => b.id}
            onRowClick={(b) => setDetail(b)}
            empty="Aucun bon."
          />
        )}
      </Card>

      {creating ? (
        <BonFormModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            bons.reload();
          }}
        />
      ) : null}

      {detail ? (
        <Modal
          title={`Bon ${detail.ref}`}
          onClose={() => setDetail(null)}
          actions={
            <button type="button" className="btn" onClick={() => window.print()}>
              Imprimer
            </button>
          }
        >
          <div className="print-area">
            <div className="detail-summary">
              <div>
                <span className="muted">Type</span>
                <strong>{detail.type}</strong>
              </div>
              <div>
                <span className="muted">Devise</span>
                <strong>{detail.currency}</strong>
              </div>
              <div>
                <span className="muted">Date</span>
                <strong>{formatDate(detail.bonDate)}</strong>
              </div>
              <div>
                <span className="muted">Dépôt</span>
                <strong>{detail.depot?.label ?? '—'}</strong>
              </div>
              <div>
                <span className="muted">Acteur</span>
                <strong>{detail.partner?.name ?? '—'}</strong>
              </div>
            </div>
            <DataTable
              columns={[
                { key: 'article', header: 'Article', render: (l) => (l.article ? `${l.article.code} — ${l.article.designation}` : '—') },
                { key: 'lot', header: 'Lot', render: (l) => l.lot?.lotNumber ?? '—' },
                { key: 'quantity', header: 'Quantité', align: 'right', render: (l) => <Qty value={l.quantity} /> },
                { key: 'unitPrice', header: 'PU', align: 'right', render: (l) => (l.unitPrice != null ? formatMoney(l.unitPrice, detail.currency) : '—') },
                { key: 'montant', header: 'Montant', align: 'right', render: (l) => formatMoney(l.montant, detail.currency) },
                { key: 'observation', header: 'Observation', render: (l) => l.observation ?? '—' },
              ]}
              rows={detail.lines}
              rowKey={(l) => l.id}
              empty="Aucune ligne."
            />
            <div className="detail-summary" style={{ marginTop: 12 }}>
              <div>
                <span className="muted">Montant total</span>
                <strong>{formatMoney(detail.montantTotal, detail.currency)}</strong>
              </div>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
