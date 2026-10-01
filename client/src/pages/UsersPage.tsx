import { useState, type FormEvent } from 'react';
import { referentialApi, usersApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, Spinner } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import type { User } from '../types';
import { useAuth } from '../context/AuthContext';

export function UsersPage() {
  const { can } = useAuth();
  const [creating, setCreating] = useState(false);
  const [editing, setEditing] = useState<User | null>(null);
  const users = useAsync(() => usersApi.list(), []);

  const columns: Column<User>[] = [
    { key: 'login', header: 'Identifiant' },
    { key: 'displayName', header: 'Nom', render: (u) => u.displayName ?? '—' },
    { key: 'role', header: 'Rôle', render: (u) => <Badge tone={u.role?.code === 'ADMIN' ? 'info' : 'neutral'}>{u.role?.label ?? u.role?.code ?? '—'}</Badge> },
    {
      key: 'isActive',
      header: 'Statut',
      render: (u) => <Badge tone={u.isActive ? 'green' : 'red'}>{u.isActive ? 'ACTIF' : 'INACTIF'}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Utilisateurs"
        subtitle="Comptes et rôles (réservé aux administrateurs)"
        actions={
          can('user:write') ? (
            <button type="button" className="btn btn-primary" onClick={() => setCreating(true)}>
              Nouvel utilisateur
            </button>
          ) : null
        }
      />

      <Card>
        {users.error ? <ErrorMessage message={users.error} /> : null}
        {users.loading && !users.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              ...columns,
              ...(can('user:write')
                ? [
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (u: User) => (
                        <button type="button" className="btn btn-small" onClick={() => setEditing(u)}>
                          Modifier
                        </button>
                      ),
                    },
                  ]
                : []),
            ]}
            rows={users.data ?? []}
            rowKey={(u) => u.id}
            empty="Aucun utilisateur."
          />
        )}
      </Card>

      {creating ? (
        <UserCreateModal
          onClose={() => setCreating(false)}
          onSaved={() => {
            setCreating(false);
            users.reload();
          }}
        />
      ) : null}

      {editing ? (
        <UserEditModal
          user={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            users.reload();
          }}
        />
      ) : null}
    </>
  );
}

function UserCreateModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const roles = useAsync(() => referentialApi.roles(), []);
  const [form, setForm] = useState({ login: '', password: '', displayName: '', roleId: '' });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await usersApi.create({
        login: form.login,
        password: form.password,
        displayName: form.displayName || null,
        roleId: Number(form.roleId),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouvel utilisateur" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Identifiant">
          <input value={form.login} onChange={(e) => update('login', e.target.value)} required />
        </Field>
        <Field label="Mot de passe" hint="6 caractères minimum">
          <input type="password" value={form.password} onChange={(e) => update('password', e.target.value)} required />
        </Field>
        <Field label="Nom affiché">
          <input value={form.displayName} onChange={(e) => update('displayName', e.target.value)} />
        </Field>
        <Field label="Rôle">
          <select value={form.roleId} onChange={(e) => update('roleId', e.target.value)} required>
            <option value="">—</option>
            {roles.data?.map((r) => (
              <option key={r.id} value={r.id}>
                {r.code} — {r.label}
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

function UserEditModal({ user, onClose, onSaved }: { user: User; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    displayName: user.displayName ?? '',
    password: '',
    isActive: user.isActive,
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await usersApi.update(user.id, {
        displayName: form.displayName || null,
        password: form.password || null,
        isActive: form.isActive,
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Modification impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={`Modifier ${user.login}`} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Nom affiché">
          <input
            value={form.displayName}
            onChange={(e) => setForm((prev) => ({ ...prev, displayName: e.target.value }))}
          />
        </Field>
        <Field label="Nouveau mot de passe" hint="Laisser vide pour ne pas changer">
          <input
            type="password"
            value={form.password}
            onChange={(e) => setForm((prev) => ({ ...prev, password: e.target.value }))}
          />
        </Field>
        <Field label="Compte actif">
          <input
            type="checkbox"
            checked={form.isActive}
            onChange={(e) => setForm((prev) => ({ ...prev, isActive: e.target.checked }))}
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
