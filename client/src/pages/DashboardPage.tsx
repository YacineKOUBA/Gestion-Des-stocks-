import { Link } from 'react-router-dom';
import { dashboardApi, loansApi } from '../services/endpoints';
import { useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, PageHeader, Spinner, lotTone, observationTone } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { Qty } from '../components/Qty';
import type { Loan } from '../types';
import { formatDate, formatNumber } from '../utils/format';
import { useAuth } from '../context/AuthContext';

export function DashboardPage() {
  const { can } = useAuth();
  const kpis = useAsync(() => dashboardApi.kpis(), []);
  const alerts = useAsync(() => dashboardApi.alerts(), []);
  const flags = useAsync(() => dashboardApi.lotsFlags(), []);
  // D17 : la carte des prets n'est interrogee que si le profil y a droit, sinon
  // l'appel echouerait en 403 et afficherait une erreur sur le tableau de bord.
  const peutVoirPrets = can('loan:read');
  const loans = useAsync(
    () => (peutVoirPrets ? loansApi.list() : Promise.resolve([] as Loan[])),
    [peutVoirPrets],
  );

  const loansEnCours = (loans.data ?? []).filter((l) => (l.solde ?? 0) > 0);

  const loanColumns: Column<Loan>[] = [
    { key: 'partner', header: 'Acteur', render: (l) => l.partner?.name ?? '-' },
    {
      key: 'type',
      header: "Type d'opération",
      render: (l) => <Badge tone={l.type === 'PRET' ? 'info' : 'orange'}>{l.type}</Badge>,
    },
    { key: 'loanDate', header: 'Date prêt / emprunt', render: (l) => formatDate(l.loanDate) },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      render: (l) => (
        <Qty value={l.quantity}>{l.article?.unit?.code ? ` ${l.article.unit.code}` : null}</Qty>
      ),
    },
    {
      key: 'solde',
      header: 'Reste à restituer',
      align: 'right',
      render: (l) => (
        <span className={(l.solde ?? 0) > 0 ? 'qty-out' : 'qty-in'}>
          <Qty value={l.solde ?? 0}>{l.article?.unit?.code ? ` ${l.article.unit.code}` : null}</Qty>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Tableau de bord" subtitle="Vue d'ensemble du stock (30 derniers jours)" />

      {kpis.error ? <ErrorMessage message={kpis.error} /> : null}
      {kpis.loading && !kpis.data ? (
        <Spinner />
      ) : kpis.data ? (
        <div className="kpi-grid">
          <Kpi label="Articles actifs" value={kpis.data.nbArticles} />
          <Kpi label="Lots suivis" value={kpis.data.nbLots} />
          <Kpi label="Mouvements (30 jours)" value={kpis.data.nbMouvements} />
          <Kpi label="Entrées (30 jours)" value={formatNumber(kpis.data.entreesPeriode)} note={`${kpis.data.ajustementsEntrees} ajustements inclus`} />
          <Kpi label="Sorties (30 jours)" value={formatNumber(kpis.data.sortiesPeriode)} note={`${kpis.data.ajustementsSorties} ajustements inclus`} />
          <Kpi label="Pertes (30 jours)" value={formatNumber(kpis.data.pertes)} tone={kpis.data.pertes > 0 ? 'red' : 'green'} />
          <Kpi label="Alertes stock" value={kpis.data.alertes} tone={kpis.data.alertes > 0 ? 'red' : 'green'} />
        </div>
      ) : null}

      <div className="grid-2">
        <Card title="Alertes de stock">
          {alerts.error ? <ErrorMessage message={alerts.error} /> : null}
          {alerts.loading && !alerts.data ? (
            <Spinner />
          ) : alerts.data && alerts.data.stock.length > 0 ? (
            <ul className="alert-list">
              {alerts.data.stock.map((row) => (
                <li key={row.articleId}>
                  <Link to="/articles" className="strong">
                    {row.code}
                  </Link>
                  <span className="grow">{row.designation}</span>
                  <Badge tone={observationTone[row.observation] ?? 'neutral'}>{row.observation}</Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">Aucune alerte de stock.</p>
          )}
        </Card>

        <Card title="Lots proches de la péremption">
          {flags.error ? <ErrorMessage message={flags.error} /> : null}
          {flags.loading && !flags.data ? (
            <Spinner />
          ) : flags.data ? (
            <>
              <div className="flag-counts">
                {Object.entries(flags.data.counts).map(([flag, count]) => (
                  <div key={flag} className="flag-count">
                    <Badge tone={lotTone[flag] ?? 'neutral'}>{flag}</Badge>
                    <span>{count}</span>
                  </div>
                ))}
              </div>
              {flags.data.lots.filter((l) => l.flag === 'PERIME' || l.flag === 'ORANGE').length > 0 ? (
                <ul className="alert-list">
                  {flags.data.lots
                    .filter((l) => l.flag === 'PERIME' || l.flag === 'ORANGE')
                    .slice(0, 8)
                    .map((l) => (
                      <li key={l.lotId}>
                        <span className="strong">{l.articleCode}</span>
                        <span className="grow">
                          {l.designation} — lot {l.lotNumber}
                        </span>
                        <span className="muted">{formatDate(l.expiryDate)}</span>
                        <Badge tone={lotTone[l.flag] ?? 'neutral'}>{l.flag}</Badge>
                      </li>
                    ))}
                </ul>
              ) : (
                <p className="empty">Aucun lot périmé ou arrivant à péremption sous 3 mois.</p>
              )}
            </>
          ) : null}
        </Card>
      </div>

      {peutVoirPrets ? (
        <Card title="Prêts / emprunts en cours">
          {loans.error ? <ErrorMessage message={loans.error} /> : null}
          {loans.loading && !loans.data ? (
            <Spinner />
          ) : (
            <DataTable
              columns={loanColumns}
              rows={loansEnCours}
              rowKey={(l) => l.id}
              empty="Aucun prêt / emprunt en cours."
            />
          )}
        </Card>
      ) : null}
    </>
  );
}

function Kpi({ label, value, note, tone = 'neutral' }: { label: string; value: number | string; note?: string; tone?: string }) {
  return (
    <div className={`kpi kpi-${tone}`}>
      <span className="kpi-value">{value}</span>
      <span className="kpi-label">{label}</span>
      {note ? <span className="kpi-note">{note}</span> : null}
    </div>
  );
}
