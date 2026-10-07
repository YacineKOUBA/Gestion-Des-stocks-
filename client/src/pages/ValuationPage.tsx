import { useMemo, useState } from 'react';
import { referentialApi, valuationApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, PageHeader, Spinner, lotTone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { ValuationResult } from '../types';
import { formatDate, formatMoney, formatNumber } from '../utils/format';

type Row = ValuationResult['rows'][number];

export function ValuationPage() {
  const [categoryId, setCategoryId] = useState('');
  const [familyId, setFamilyId] = useState('');
  const [depotId, setDepotId] = useState('');

  const categories = useAsync(() => referentialApi.categories(), [], { label: 'Catégories' });
  const families = useAsync(() => referentialApi.families(), [], { label: 'Familles' });
  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });

  // Familles disponibles : celles de la categorie choisie, sinon toutes les familles.
  const familyOptions = useMemo(() => {
    const all = families.data ?? [];
    if (!categoryId) return all;
    return all.filter((f) => f.categoryId === Number(categoryId));
  }, [families.data, categoryId]);
  // La famille choisie appartient a une categorie : on aligne le filtre categorie dessus.
  const onFamilyChange = (value: string) => {
    setFamilyId(value);
    const fam = (families.data ?? []).find((f) => f.id === Number(value));
    if (fam?.categoryId != null) setCategoryId(String(fam.categoryId));
  };
  // Changement de categorie : on ne garde la famille que si elle appartient toujours a la categorie.
  const onCategoryChange = (value: string) => {
    setCategoryId(value);
    const fam = (families.data ?? []).find((f) => f.id === Number(familyId));
    if (fam && value && fam.categoryId !== Number(value)) setFamilyId('');
  };
  const valuation = useAsync(
    () =>
      valuationApi.get({
        categoryId: categoryId ? Number(categoryId) : undefined,
        familyId: familyId ? Number(familyId) : undefined,
        depotId: depotId ? Number(depotId) : undefined,
      }),
    [categoryId, familyId, depotId],
  );

  const columns: Column<Row>[] = [
    { key: 'articleCode', header: 'Code' },
    { key: 'designation', header: 'Désignation' },
    { key: 'category', header: 'Catégorie', render: (r) => r.category ?? '—' },
    { key: 'family', header: 'Famille', render: (r) => r.family ?? '—' },
    { key: 'unit', header: 'Unité de mesure', render: (r) => r.unit ?? '—' },
    {
      key: 'lots',
      header: 'Lots',
      align: 'right',
      // Nombre de lots valorises : le detail (prix et quantite par lot) est dans le deploiement.
      render: (r) => (r.lots?.length ? `${r.lots.length} lot${r.lots.length > 1 ? 's' : ''}` : '—'),
    },
    { key: 'quantity', header: 'Quantité', align: 'right', render: (r) => <Qty value={r.quantity} /> },
    {
      key: 'unitPrice',
      header: 'Prix unitaire moyen',
      align: 'right',
      render: (r) => formatMoney(r.unitPrice, r.currency),
    },
    { key: 'value', header: 'Valeur', align: 'right', render: (r) => formatMoney(r.value, r.currency) },
  ];

  // Detail du prix moyen pondere : une ligne par lot, avec le prix qui lui est reellement
  // applique. Un lot qui n'a pas de prix propre est valorise au prix de l'article (repli).
  // Les colonnes dependent de la ligne parente (devise) : elles sont donc construites a la volee.
  const lotColumns = (row: Row): Column<Row['lots'][number]>[] => [
    { key: 'lotNumber', header: 'Lot', render: (l) => l.lotNumber ?? 'Article non lot-tracé' },
    {
      key: 'flag',
      header: 'Péremption',
      render: (l) => (l.flag ? <Badge tone={lotTone[l.flag] ?? 'neutral'}>{l.flag}</Badge> : '—'),
    },
    { key: 'expiryDate', header: 'DLC', render: (l) => formatDate(l.expiryDate) },
    {
      key: 'quantity',
      header: 'Quantité du lot',
      align: 'right',
      render: (l) => <Qty value={l.quantity} />,
    },
    {
      key: 'unitPrice',
      header: 'Prix unitaire du lot',
      align: 'right',
      render: (l) => formatMoney(l.unitPrice, row.currency),
    },
    {
      key: 'priceSource',
      header: 'Origine du prix',
      render: (l) =>
        l.priceSource === 'LOT' ? 'Prix du lot' : <span className="muted">Prix de l’article (repli)</span>,
    },
    {
      key: 'value',
      header: 'Valeur du lot',
      align: 'right',
      render: (l) => formatMoney(l.value, row.currency),
    },
  ];

  const renderLotDetail = (r: Row) => (
    <div className="lot-detail">
      <p className="lot-detail-formula">
        Prix unitaire moyen = Σ (prix unitaire du lot × quantité du lot) ÷ {formatNumber(r.quantity)}{' '}
        {r.unit ?? ''} = <strong>{formatMoney(r.unitPrice, r.currency)}</strong>
      </p>
      <DataTable
        columns={lotColumns(r)}
        rows={r.lots ?? []}
        rowKey={(l, i) => String(l.lotId ?? `sans-lot-${i}`)}
        empty="Aucun lot en stock pour cet article."
      />
    </div>
  );

  // Recapitulatif de la valorisation groupee par famille.
  // INVARIANT UNITE : les quantites ne sont cumulees qu'a l'interieur d'une MEME unite
  // (et les valeurs qu'a l'interieur d'une MEME devise). Cumuler par famille seule
  // reviendrait a additionner des quantites exprimees dans des unites differentes.
  interface FamilyTotal {
    family: string;
    unit: string;
    currency: string;
    quantity: number;
    value: number;
  }
  const parFamille = useMemo<FamilyTotal[]>(() => {
    const acc = new Map<string, FamilyTotal>();
    for (const r of valuation.data?.rows ?? []) {
      const family = r.family ?? 'Sans famille';
      const unit = r.unit ?? '—';
      const key = `${family}|${unit}|${r.currency}`;
      const cur = acc.get(key) ?? { family, unit, currency: r.currency, quantity: 0, value: 0 };
      cur.quantity += r.quantity;
      cur.value += r.value;
      acc.set(key, cur);
    }
    return [...acc.values()].sort((a, b) => b.value - a.value);
  }, [valuation.data]);

  const familyColumns: Column<FamilyTotal>[] = [
    { key: 'family', header: 'Famille' },
    { key: 'unit', header: 'Unité de mesure' },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      render: (r) => <Qty value={r.quantity}>{` ${r.unit}`}</Qty>,
    },
    { key: 'value', header: 'Valeur', align: 'right', render: (r) => formatMoney(r.value, r.currency) },
  ];

  return (
    <>
      <PageHeader
        title="Valorisation du stock"
        subtitle="Valeur du stock par article — prix unitaire moyen pondéré des lots en stock (chaque lot est valorisé à son propre prix, sinon à celui de l’article). Cliquez sur une ligne pour voir le détail par lot."
      />

      <Card>
        <div className="filters">
          <select
            value={categoryId}
            onChange={(e) => onCategoryChange(e.target.value)}
          >
            <option value="">Toutes les catégories</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <select
            value={familyId}
            onChange={(e) => onFamilyChange(e.target.value)}
          >
            <option value="">Toutes les familles</option>
            {familyOptions.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label}
              </option>
            ))}
          </select>
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)}>
            <option value="">Tous les dépôts</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </div>
      </Card>

      {valuation.data ? (
        <div className="kpi-grid">
          {Object.entries(valuation.data.totals ?? {}).map(([code, amount]) => (
            <div className="kpi kpi-info" key={code}>
              <span className="kpi-value">{formatMoney(amount, code)}</span>
              <span className="kpi-label">{code}</span>
            </div>
          ))}
          <div className="kpi">
            <span className="kpi-value">{valuation.data.rows.length}</span>
            <span className="kpi-label">Articles valorisés</span>
          </div>
        </div>
      ) : null}

      <Card>
        {valuation.error ? <ErrorMessage message={valuation.error} /> : null}
        {valuation.loading && !valuation.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={valuation.data?.rows ?? []}
            rowKey={(r) => r.articleId}
            empty="Aucune donnée."
            renderExpanded={renderLotDetail}
          />
        )}
      </Card>

      <Card title="Valorisation par famille">
        {valuation.loading && !valuation.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={familyColumns}
            rows={parFamille}
            rowKey={(r) => `${r.family}|${r.unit}|${r.currency}`}
            empty="Aucune famille à valoriser."
          />
        )}
      </Card>
    </>
  );
}
