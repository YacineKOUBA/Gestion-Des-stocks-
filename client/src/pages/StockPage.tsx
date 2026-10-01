import { useState } from 'react';
import { stockApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Modal, PageHeader, Spinner, observationTone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { StockRow, ThresholdRow } from '../types';
import { formatDate, formatNumber } from '../utils/format';

export function StockPage() {
  const [search, setSearch] = useState('');
  const [depotId, setDepotId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [group, setGroup] = useState<'article' | 'full'>('article');
  const [selectedArticle, setSelectedArticle] = useState<number | null>(null);
  const [selectedThreshold, setSelectedThreshold] = useState<ThresholdRow | null>(null);

  const depots = useAsync(() => stockApi.depots(), []);
  const categories = useAsync(() => stockApi.categories(), []);
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

  // Libelle de la categorie choisie : la carte des seuils filtre sur ThresholdRow.category,
  // qui porte le libelle de la categorie et non son identifiant.
  const selectedCategoryLabel =
    categories.data?.find((c) => String(c.id) === categoryId)?.label ?? '';

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
    { key: 'quantity', header: 'Stock', align: 'right', render: (r) => <Qty value={r.quantity} /> },
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

      <ThresholdsCard
        search={search}
        categoryLabel={selectedCategoryLabel}
        onSelect={setSelectedThreshold}
      />

      {selectedArticle !== null ? (
        <ArticleStockDetail articleId={selectedArticle} onClose={() => setSelectedArticle(null)} />
      ) : null}

      {selectedThreshold !== null ? (
        <ThresholdDetail row={selectedThreshold} onClose={() => setSelectedThreshold(null)} />
      ) : null}
    </>
  );
}

function ThresholdsCard({
  search,
  categoryLabel,
  onSelect,
}: {
  search: string;
  categoryLabel: string;
  onSelect: (row: ThresholdRow) => void;
}) {
  const thresholds = useAsync(() => stockApi.thresholds(), []);
  const needle = search.trim().toLowerCase();
  // Les seuils sont telecharges en une fois (le serveur ne filtre pas sur la categorie),
  // donc la restriction se fait ici, sur le libelle de categorie porte par chaque ligne.
  const filtered = (thresholds.data ?? []).filter(
    (r) =>
      (!categoryLabel || r.category === categoryLabel) &&
      (!needle ||
        r.code.toLowerCase().includes(needle) ||
        r.designation.toLowerCase().includes(needle)),
  );

  const columns: Column<ThresholdRow>[] = [
    { key: 'code', header: 'Code' },
    { key: 'designation', header: 'Désignation' },
    { key: 'stockDisponible', header: 'Disponible', align: 'right', render: (r) => <Qty value={r.stockDisponible} /> },
    { key: 'stockMin', header: 'Min', align: 'right', render: (r) => <Qty value={r.stockMin} /> },
    { key: 'stockAlerte', header: 'Alerte', align: 'right', render: (r) => <Qty value={r.stockAlerte} /> },
    { key: 'stockMax', header: 'Max', align: 'right', render: (r) => <Qty value={r.stockMax} /> },
    { key: 'couvStock', header: 'Couv. (j)', align: 'right', render: (r) => formatNumber(r.couvStock, 1) },
    {
      key: 'observation',
      header: 'Observation',
      render: (r) => <Badge tone={observationTone[r.observation] ?? 'neutral'}>{r.observation}</Badge>,
    },
  ];

  return (
    <Card title="Seuils et observations">
      {thresholds.error ? <ErrorMessage message={thresholds.error} /> : null}
      {thresholds.loading && !thresholds.data ? (
        <Spinner />
      ) : (
        <DataTable
          columns={columns}
          rows={filtered}
          rowKey={(r) => r.articleId}
          onRowClick={onSelect}
          empty="Aucun article."
        />
      )}
    </Card>
  );
}

function ThresholdDetail({ row, onClose }: { row: ThresholdRow; onClose: () => void }) {
  return (
    <Modal title="Détail des seuils" onClose={onClose}>
      <p className="muted">
        <span className="strong">{row.code}</span> — {row.designation}
      </p>
      <div className="detail-summary">
        <div>
          <span className="muted">Stock disponible</span>
          <strong><Qty value={row.stockDisponible} /></strong>
        </div>
        <div>
          <span className="muted">Stock virtuel</span>
          <strong><Qty value={row.stockVirtuel} /></strong>
        </div>
        <div>
          <span className="muted">Sécurité</span>
          <strong><Qty value={row.stockSecurite} /></strong>
        </div>
        <div>
          <span className="muted">Minimum</span>
          <strong><Qty value={row.stockMin} /></strong>
        </div>
        <div>
          <span className="muted">Alerte</span>
          <strong><Qty value={row.stockAlerte} /></strong>
        </div>
        <div>
          <span className="muted">Maximum</span>
          <strong><Qty value={row.stockMax} /></strong>
        </div>
        <div>
          <span className="muted">Couverture (j)</span>
          <strong>{formatNumber(row.couvStock, 1)}</strong>
        </div>
        <div>
          <span className="muted">Observation</span>
          <Badge tone={observationTone[row.observation] ?? 'neutral'}>{row.observation}</Badge>
        </div>
      </div>
    </Modal>
  );
}

function ArticleStockDetail({ articleId, onClose }: { articleId: number; onClose: () => void }) {
  const detail = useAsync(() => stockApi.article(articleId), [articleId]);

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
              { key: 'quantity', header: 'Qté', align: 'right', render: (r) => <Qty value={r.quantity} /> },
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
