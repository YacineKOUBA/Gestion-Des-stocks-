import { useState, type FormEvent } from 'react';
import { settingsApi } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Card, ErrorMessage, Field, PageHeader, Spinner } from '../components/ui';
import { useAuth } from '../context/AuthContext';

/**
 * Parametres numeriques : le champ passe en `type="number"` avec son pas et ses
 * bornes. La page est volontairement generique — un champ par parametre, sans
 * durcir — mais le plafond de reservation est une regle de gestion saisie a la
 * main : « 15,5 » y renvoyait silencieusement a 15 %. Le controle cote serveur
 * refuse desormais la virgule en expliquant pourquoi ; le type numerique evite
 * surtout qu'on la tape.
 */
const NUMERIQUES: Record<string, { step: string; min?: string; max?: string }> = {
  JOURS_SECURITE: { step: '1', min: '0' },
  JOURS_MIN: { step: '1', min: '0' },
  ALERTE_PEREMPTION_JOURS: { step: '1', min: '0' },
  COEF_MAXI: { step: '0.01', min: '0', max: '1' },
  COEF_ALERTE: { step: '0.01', min: '0' },
  RESERVATION_PLAFOND_PCT: { step: '0.5', min: '0', max: '100' },
};

export function SettingsPage() {
  const { can } = useAuth();
  const settings = useAsync(() => settingsApi.list(), []);
  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const current = settings.data ?? [];

  function valueOf(code: string): string {
    return values[code] ?? current.find((s) => s.code === code)?.value ?? '';
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);
    try {
      await settingsApi.update(values);
      setValues({});
      setSuccess('Paramètres enregistrés.');
      settings.reload();
    } catch (err) {
      setError(errorMessage(err, 'Enregistrement impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <PageHeader title="Paramètres" subtitle="Seuils et constantes de calcul (réservé aux administrateurs)" />

      <Card>
        {settings.error ? <ErrorMessage message={settings.error} /> : null}
        {settings.loading && !settings.data ? (
          <Spinner />
        ) : (
          <>
            {can('settings:write') ? (
              <form onSubmit={handleSubmit} className="form-grid">
                <ErrorMessage message={error} />
                {success ? <div className="alert alert-success">{success}</div> : null}
                {current.map((setting) => {
                  const num = NUMERIQUES[setting.code];
                  return (
                    <Field key={setting.code} label={setting.label ?? setting.code} hint={setting.code}>
                      <input
                        value={valueOf(setting.code)}
                        onChange={(e) => setValues((prev) => ({ ...prev, [setting.code]: e.target.value }))}
                        {...(num ? { type: 'number', step: num.step, min: num.min, max: num.max } : {})}
                      />
                    </Field>
                  );
                })}
                <div className="form-actions">
                  <button
                    type="submit"
                    className="btn btn-primary"
                    disabled={submitting || Object.keys(values).length === 0}
                  >
                    {submitting ? 'Enregistrement…' : 'Enregistrer'}
                  </button>
                </div>
              </form>
            ) : (
              /* Consultation seule : les valeurs restent visibles, mais non editables. */
              current.map((setting) => {
                const num = NUMERIQUES[setting.code];
                return (
                  <Field key={setting.code} label={setting.label ?? setting.code} hint={setting.code}>
                    <input
                      value={setting.value}
                      readOnly
                      disabled
                      {...(num ? { type: 'number', step: num.step, min: num.min, max: num.max } : {})}
                    />
                  </Field>
                );
              })
            )}
          </>
        )}
      </Card>
    </>
  );
}
