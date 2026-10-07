import { useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { inventoriesApi, referentialApi } from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { Inventory } from '../types';
import { formatDateTime } from '../utils/format';

export function InventoriesPage() {
  const { can } = useAuth();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const inventories = useAsync(() => inventoriesApi.list(), []);

  const columns: Column<Inventory>[] = [
    { key: 'code', header: 'Code' },
    { key: 'title', header: 'Titre', render: (i) => i.title ?? '—' },
    { key: 'depot', header: 'Dépôt', render: (i) => i.depot?.label ?? '—' },
    { key: 'openedAt', header: 'Ouvert le', render: (i) => formatDateTime(i.openedAt) },
    {
      key: 'status',
      header: 'Statut',
      render: (i) => <Badge tone={i.status === 'OUVERTE' ? 'orange' : 'green'}>{i.status}</Badge>,
    },
    { key: 'lines', header: 'Lignes', align: 'right', render: (i) => i._count?.lines ?? 0 },
  ];

  return (
    <>
      <PageHeader
        title="Inventaire"
        subtitle="Campagnes de comptage et ajustements"
        actions={
          can('inventory:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouvelle campagne
            </button>
          ) : null
        }
      />

      <Card>
        {inventories.error ? <ErrorMessage message={inventories.error} /> : null}
        {inventories.loading && !inventories.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={columns}
            rows={inventories.data ?? []}
            rowKey={(i) => i.id}
            onRowClick={(i) => navigate(`/inventaires/${i.id}`)}
            empty="Aucune campagne d'inventaire."
          />
        )}
      </Card>

      {creating ? (
        <OpenInventoryModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            inventories.reload();
          }}
        />
      ) : null}
    </>
  );
}

function OpenInventoryModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });
  const [title, setTitle] = useState('');
  const [depotId, setDepotId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await inventoriesApi.open({ title: title || undefined, depotId: Number(depotId) });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouvelle campagne d'inventaire" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Titre">
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex. Inventaire mensuel" />
        </Field>
        <Field label="Dépôt">
          <select value={depotId} onChange={(e) => setDepotId(e.target.value)} required>
            <option value="">—</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Création…' : 'Créer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
