import { useState } from 'react';
import { auditApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { AuditLog } from '../types';
import { formatDateTime, formatNumber } from '../utils/format';

const ACTIONS = ['CREATION', 'MODIFICATION', 'SUPPRESSION', 'VALIDATION', 'ANNULATION', 'REACTIVATION', 'CONNEXION'];

export function AuditPage() {
  const [search, setSearch] = useState('');
  const [action, setAction] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const logs = useAsync(
    () =>
      auditApi.list({
        search: search || undefined,
        action: action || undefined,
        limit: pageSize,
        offset,
      }),
    [search, action, pageSize, offset],
  );

  // Un changement de filtre ou de taille de page doit revenir au début de la liste.
  function applyFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setOffset(0);
    };
  }

  const total = logs.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + pageSize, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + pageSize < total;

  const columns: Column<AuditLog>[] = [
    { key: 'createdAt', header: 'Date', render: (l) => formatDateTime(l.createdAt) },
    { key: 'user', header: 'Utilisateur', render: (l) => l.user?.login ?? '—' },
    { key: 'action', header: 'Action', render: (l) => <Badge tone={actionTone(l.action)}>{l.action}</Badge> },
    { key: 'entity', header: 'Entité' },
    { key: 'entityId', header: 'Réf.', render: (l) => l.entityId ?? '—' },
    {
      key: 'changes',
      header: 'Détails',
      render: (l) => <span className="muted mono truncate">{l.changes ? JSON.stringify(l.changes) : '—'}</span>,
    },
  ];

  return (
    <>
      <PageHeader title="Journal d'audit" subtitle="Historique complet des actions, paginé" />

      <Card>
        <div className="filters">
          <input
            placeholder="Rechercher (entité, référence, utilisateur, détail…)"
            value={search}
            onChange={(e) => applyFilter(setSearch)(e.target.value)}
          />
          <select value={action} onChange={(e) => applyFilter(setAction)(e.target.value)}>
            <option value="">Toutes les actions</option>
            {ACTIONS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </div>
      </Card>

      <Card>
        {logs.error ? <ErrorMessage message={logs.error} /> : null}
        {logs.data?.truncated ? (
          <div className="alert alert-warning">
            Trop d'entrées correspondent à cette recherche dans les détails : l'affichage est limité aux
            5 000 plus récentes. Affinez la recherche pour tout voir.
          </div>
        ) : null}
        {logs.loading && !logs.data ? (
          <Spinner />
        ) : (
          <DataTable columns={columns} rows={logs.data?.items ?? []} rowKey={(l) => l.id} empty="Aucune entrée d'audit." />
        )}

        {total > pageSize || offset > 0 ? (
          <div className="pagination">
            <span className="muted">
              {formatNumber(firstShown)}–{formatNumber(lastShown)} sur {formatNumber(total)} entrées
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
    </>
  );
}

function actionTone(action: string): string {
  switch (action) {
    case 'CREATION':
      return 'green';
    case 'MODIFICATION':
      return 'info';
    case 'SUPPRESSION':
      return 'red';
    case 'VALIDATION':
      return 'green';
    case 'ANNULATION':
      return 'orange';
    case 'REACTIVATION':
      return 'green';
    default:
      return 'neutral';
  }
}
