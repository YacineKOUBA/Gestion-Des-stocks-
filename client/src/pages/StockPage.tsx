import { useState } from 'react';
import { stockApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Modal, PageHeader, Spinner, observationTone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { StockRow } from '../types';
import { formatDate, formatPercent } from '../utils/format';

export function StockPage() {
  const [search, setSearch] = useState('');
  const [depotId, setDepotId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [group, setGroup] = useState<'article' | 'full'>('article');
  const [selectedArticle, setSelectedArticle] = useState<number | null>(null);
  // const [selectedThreshold, setSelectedThreshold] = useState<ThresholdRow | null>(null);

  const depots = useAsync(() => stockApi.depots(), [], { label: 'Dépôts' });
  const categories = useAsync(() => stockApi.categories(), [], { label: 'Catégories' });
  const rows = useAsync(
    () =>
      stockApi.rows({
        group,
        search: search || undefined,
        depotId: depotId ? Number(depotId) : undefined,
        categoryId: categoryId ? Number(categoryId) : undefined,
      }),
    [group, search, depotId, categoryId],
  );

  const columns: Column<StockRow>[] = [
    { key: 'articleCode', header: 'Code' },
    { key: 'designation', header: 'Désignation' },
    { key: 'category', header: 'Catégorie' },
    { key: 'family', header: 'Famille' },
    ...(group === 'full'
      ? ([
          { key: 'depot', header: 'Dépôt' },
          { key: 'location', header: 'Emplacement' },
          { key: 'lot', header: 'Lot' },
          { key: 'expiryDate', header: 'Péremption', render: (r) => formatDate(r.expiryDate) },
        ] as Column<StockRow>[])
      : []),
    { key: 'unit', header: 'Unité de mesure' },
    { key: 'quantity', header: 'Quantité', align: 'right', render: (r) => <Qty value={r.quantity} /> },
    {
      key: 'reservedQuantity',
      header: 'Déjà réservé',
      align: 'right',
      render: (r) =>
        r.reservedQuantity > 0 ? (
          <span className="reserved-cell">
            <Qty value={r.reservedQuantity} />
            <span className="muted"> ({formatPercent(r.reservedPercent)})</span>
          </span>
        ) : (
          <span className="muted">—</span>
        ),
    },
    {
      key: 'freeQuantity',
      header: 'Stock libre',
      align: 'right',
      render: (r) => <Qty value={r.freeQuantity} />,
    },
  ];

  return (
    <>
      <PageHeader title="État de stock" subtitle="Stock disponible calculé depuis les mouvements actifs" />

      <Card>
        <div className="filters">
          <input
            placeholder="Rechercher (code ou désignation)"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)}>
            <option value="">Tous les dépôts</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
            <option value="">Toutes les catégories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select value={group} onChange={(e) => setGroup(e.target.value as 'article' | 'full')}>
            <option value="article">Par article</option>
            <option value="full">Par article / lot / dépôt</option>
          </select>
        </div>
      </Card>

      <Card>
        {rows.error ? <ErrorMessage message={rows.error} /> : null}
        {rows.loading && !rows.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={rows.data ?? []}
            rowKey={(r, i) => `${r.articleId}-${r.lot ?? ''}-${r.depot ?? ''}-${i}`}
            onRowClick={(r) => setSelectedArticle(r.articleId)}
            empty="Aucun stock à afficher."
          />
        )}
      </Card>

      {/* Masqué temporairement jusqu'à nouvel ordre
      <ThresholdsCard
        search={search}
        categoryLabel={selectedCategoryLabel}
        onSelect={setSelectedThreshold}
      />
      */}

      {selectedArticle !== null ? (
        <ArticleStockDetail articleId={selectedArticle} onClose={() => setSelectedArticle(null)} />
      ) : null}

      {/* {selectedThreshold !== null ? (
        <ThresholdDetail row={selectedThreshold} onClose={() => setSelectedThreshold(null)} />
      ) : null} */}
    </>
  );
}

function ArticleStockDetail({ articleId, onClose }: { articleId: number; onClose: () => void }) {
  const detail = useAsync(() => stockApi.article(articleId), [articleId]);

  // Totaux des promesses : le detail par lot/emplacement n additionne pas lui-meme.
  const totaux = (detail.data?.lignes ?? []).reduce(
    (a, l) => ({
      reserved: a.reserved + (l.reservedQuantity ?? 0),
      free: a.free + (l.freeQuantity ?? l.quantity),
    }),
    { reserved: 0, free: 0 },
  );
  const reservedPct = detail.data?.stockDisponible
    ? (totaux.reserved / detail.data.stockDisponible) * 100
    : 0;

  return (
    <Modal title="Détail du stock" onClose={onClose}>
      {detail.error ? <ErrorMessage message={detail.error} /> : null}
      {detail.loading && !detail.data ? (
        <Spinner />
      ) : detail.data ? (
        <>
          <div className="detail-summary">
            <div>
              <span className="muted">Stock disponible</span>
              <strong><Qty value={detail.data.stockDisponible} /></strong>
            </div>
            <div>
              <span className="muted">Déjà réservé</span>
              <strong>
                <Qty value={totaux.reserved} />
                {totaux.reserved > 0 ? (
                  <span className="muted"> ({formatPercent(reservedPct)})</span>
                ) : null}
              </strong>
            </div>
            <div>
              <span className="muted">Stock libre</span>
              <strong><Qty value={totaux.free} /></strong>
            </div>
            <div>
              <span className="muted">Encours (commandes)</span>
              <strong><Qty value={detail.data.encours} /></strong>
            </div>
            <div>
              <span className="muted">Stock virtuel</span>
              <strong><Qty value={detail.data.stockVirtuel} /></strong>
            </div>
            <div>
              <span className="muted">Observation</span>
              <Badge tone={observationTone[detail.data.seuils.observation] ?? 'neutral'}>
                {detail.data.seuils.observation}
              </Badge>
            </div>
          </div>
          <DataTable
            columns={[
              { key: 'depot', header: 'Dépôt' },
              { key: 'location', header: 'Emplacement' },
              { key: 'lot', header: 'Lot' },
              { key: 'expiryDate', header: 'Péremption', render: (r) => formatDate(r.expiryDate) },
              { key: 'unit', header: 'Unité de mesure' },
              { key: 'quantity', header: 'Quantité', align: 'right', render: (r) => <Qty value={r.quantity} /> },
              {
                key: 'reservedQuantity',
                header: 'Déjà réservé',
                align: 'right',
                render: (r) =>
                  r.reservedQuantity > 0 ? (
                    <span className="reserved-cell">
                      <Qty value={r.reservedQuantity} />
                      <span className="muted"> ({formatPercent(r.reservedPercent)})</span>
                    </span>
                  ) : (
                    <span className="muted">—</span>
                  ),
              },
              {
                key: 'freeQuantity',
                header: 'Stock libre',
                align: 'right',
                render: (r) => <Qty value={r.freeQuantity} />,
              },
            ]}
            rows={detail.data.lignes}
            rowKey={(r, i) => `${r.lot ?? ''}-${r.depot ?? ''}-${i}`}
            empty="Aucune ligne de stock."
          />
        </>
      ) : null}
    </Modal>
  );
}
