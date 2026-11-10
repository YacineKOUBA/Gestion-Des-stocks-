import { useState } from 'react';
import { bonsApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Card, ErrorMessage, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Bon } from '../types';
import { formatDate, formatMoney, formatNumber } from '../utils/format';
import { Qty } from '../components/Qty';
import { BonFormModal } from '../components/BonFormModal';
import { useAuth } from '../context/AuthContext';

export function BonsPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [detail, setDetail] = useState<Bon | null>(null);
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const bons = useAsync(() => bonsApi.list({ limit: pageSize, offset }), [pageSize, offset]);

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
          can('bon:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouveau bon
            </button>
          ) : null
        }
      />

      <Card>
        {bons.error ? <ErrorMessage message={bons.error} /> : null}
        {bons.loading && !bons.data ? (
          <Spinner />
        ) : (
          <>
            <DataTable
              columns={columns}
              rows={bons.data?.items ?? []}
              rowKey={(b) => b.id}
              onRowClick={(b) => setDetail(b)}
              empty="Aucun bon."
            />
            {(() => {
              const total = bons.data?.total ?? 0;
              const firstShown = total === 0 ? 0 : offset + 1;
              const lastShown = Math.min(offset + pageSize, total);
              const canGoBack = offset > 0;
              const canGoForward = offset + pageSize < total;
              if (total <= pageSize && offset === 0) return null;
              return (
                <div className="pagination">
                  <span className="muted">
                    {formatNumber(firstShown)}–{formatNumber(lastShown)} sur {formatNumber(total)} documents
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
              );
            })()}
          </>
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
