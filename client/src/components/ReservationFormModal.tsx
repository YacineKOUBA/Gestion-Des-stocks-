import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react';
import {
  articlesApi,
  referentialApi,
  reservationsApi,
  usersApi,
} from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { ErrorMessage, Field, Modal } from './ui';
import type { ReservationAvailability } from '../types';
import { Qty } from './Qty';
import { todayInput } from '../utils/format';
import { useAuth } from '../context/AuthContext';

interface LineDraft {
  articleId: string;
  quantity: string;
}

const emptyLine: LineDraft = { articleId: '', quantity: '' };

export function ReservationFormModal({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const { user } = useAuth();
  const articles = useAsync(() => articlesApi.list({}), []);
  const partners = useAsync(() => referentialApi.partners(), []);
  const users = useAsync(() => usersApi.list(), []);

  const [lines, setLines] = useState<LineDraft[]>([{ ...emptyLine }]);
  const [partnerId, setPartnerId] = useState('');
  const [staffLabel, setStaffLabel] = useState('');
  const [startDate, setStartDate] = useState(todayInput());
  const [endDate, setEndDate] = useState(todayInput());
  const [observation, setObservation] = useState('');
  const [dispo, setDispo] = useState<Record<number, ReservationAvailability>>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<ReactNode>(null);

  // Personnel saisi a la main ; propose l'utilisateur connecte tant que le champ
  // n'a pas ete renseigne, puis une resolution par nom ou identifiant a la validation.
  useEffect(() => {
    if (!user) return;
    setStaffLabel((prev) => prev || user.displayName || user.login);
  }, [user]);

  function resolveStaff() {
    const q = staffLabel.trim().toLowerCase();
    if (!q) return undefined;
    return users.data?.find(
      (u) => u.displayName?.toLowerCase() === q || u.login.toLowerCase() === q,
    );
  }
  // Disponibilite reelle de chaque article selectionne (sert a plafonner les quantites).
  const articleIds = useMemo(
    () => [...new Set(lines.map((l) => Number(l.articleId)).filter((n) => n > 0))],
    [lines],
  );
  useEffect(() => {
    let annule = false;
    for (const id of articleIds) {
      reservationsApi
        .availability(id)
        .then((r) => {
          if (!annule) setDispo((prev) => ({ ...prev, [id]: r }));
        })
        .catch(() => {
          if (!annule) setDispo((prev) => ({ ...prev, [id]: { articleId: id, total: 0, lignes: [] } }));
        });
    }
    return () => {
      annule = true;
    };
  }, [articleIds]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setLines((prev) => prev.map((l, i) => (i === index ? { ...l, ...patch } : l)));
  }

  /** Apercu FEFO : quels lots seront consommes, dans l'ordre de peremption. */
  function fefoPreview(articleId: number, quantity: number): ReactNode[] {
    const rows = dispo[articleId]?.lignes ?? [];
    let reste = quantity;
    const out: ReactNode[] = [];
    for (const r of rows) {
      if (reste <= 0) break;
      // FEFO sur le stock LIBRE : ce qui est deja promis ne peut pas etre repris.
      const part = Math.min(r.libre, reste);
      reste -= part;
      out.push(
        <span key={`${r.lotNumber ?? 'sans-lot'}-${out.length}`}>
          {`${r.lotNumber ? `Lot ${r.lotNumber}` : 'Sans lot'}${r.expiryDate ? ` (péremption ${r.expiryDate})` : ''} : `}
          <Qty value={part} />
        </span>,
      );
    }
    return out;
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const valides = lines.filter((l) => l.articleId && Number(l.quantity) > 0);
    if (valides.length === 0) {
      setError('Ajoutez au moins un article avec une quantité supérieure à 0.');
      return;
    }
    if (!partnerId) {
      setError("Sélectionnez l'acteur concerné.");
      return;
    }
    if (!staffLabel.trim()) {
      setError('Indiquez le personnel interne concerné par la réservation.');
      return;
    }
    if (endDate < startDate) {
      setError('La date de fin doit être postérieure ou égale à la date de début.');
      return;
    }
    for (const l of valides) {
      const art = articles.data?.find((a) => a.id === Number(l.articleId));
      const info = dispo[Number(l.articleId)];
      const libreArticle = info?.total ?? 0;
      // Le serveur plafonne le CUMUL des reservations ACTIF a pctPlafond % du stock
      // physique. Une ligne seule peut donc depasser ce qu'il reste autorise meme
      // si le stock libre suffit : on compare le cumul par article.
      const demande = valides
        .filter((x) => Number(x.articleId) === Number(l.articleId))
        .reduce((a, x) => a + Number(x.quantity), 0);
      const dispoArticle = Math.min(libreArticle, info?.plafondRestant ?? libreArticle);
      if (demande > dispoArticle) {
        const plafondLimite = (info?.plafondRestant ?? libreArticle) < libreArticle;
        setError(
          plafondLimite ? (
            <>
              {`Plafond de réservation atteint pour ${art?.code ?? ''} : `}
              <Qty value={info?.plafondRestant ?? 0} />
              {` encore mobilisables (${info?.pctPlafond ?? 15} % du stock). Réduisez la quantité.`}
            </>
          ) : (
            <>
              {`Quantité indisponible pour ${art?.code ?? ''} : `}
              <Qty value={libreArticle} />
              {' en stock libre. Le stock se bloque dès la réservation, vérifiez la disponibilité.'}
            </>
          ),
        );
        return;
      }
    }

    setSubmitting(true);
    try {
      await reservationsApi.create({
        partnerId: Number(partnerId),
        staffLabel: staffLabel.trim(),
        // Rattache l'utilisateur si le texte saisi correspond a un compte existant.
        staffId: resolveStaff()?.id ?? null,
        startDate,
        endDate,
        observation: observation || null,
        lines: valides.map((l) => ({ articleId: Number(l.articleId), quantity: Number(l.quantity) })),
      });
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouvelle réservation" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />

        <Field
          label="Personnel interne GD Trading"
          hint="Texte libre : n'a pas besoin d'être un utilisateur de l'application."
        >
          <input
            list="reservation-staff-list"
            value={staffLabel}
            onChange={(e) => setStaffLabel(e.target.value)}
            placeholder="Magasinier"
            required
          />
          <datalist id="reservation-staff-list">
            {users.data?.map((u) => (
              <option key={u.id} value={u.displayName ?? u.login} />
            ))}
          </datalist>
        </Field>

        <Field label="Acteur">
          <select value={partnerId} onChange={(e) => setPartnerId(e.target.value)} required>
            <option value="">—</option>
            {partners.data?.filter((p) => p.isActive).map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Début de la réservation">
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>

        <Field label="Fin de la réservation" hint="À cette date, la réservation est annulée automatiquement et le stock est libéré.">
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} required />
        </Field>

        <Field label="Observation">
          <input value={observation} onChange={(e) => setObservation(e.target.value)} placeholder="Facultatif" />
        </Field>

        <div className="form-section-title">
          <strong>Articles réservés</strong>
          <button
            type="button"
            className="btn btn-small"
            onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}
          >
            + Ajouter un article
          </button>
        </div>

        {lines.map((line, index) => {
          const art = articles.data?.find((a) => a.id === Number(line.articleId));
          const info = line.articleId ? dispo[Number(line.articleId)] : undefined;
          const libreArticle = info?.total ?? 0;
          const plafondRestant = info?.plafondRestant ?? 0;
          const plafondLimite = plafondRestant < libreArticle;
          const maxLigne = Math.min(libreArticle, plafondRestant);
          const qte = Number(line.quantity) || 0;
          const trop = qte > maxLigne;
          return (
            <div className="line-editor" key={index}>
              <select value={line.articleId} onChange={(e) => updateLine(index, { articleId: e.target.value })} required>
                <option value="">Article…</option>
                {articles.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.code} — {a.designation}
                  </option>
                ))}
              </select>
              <input
                type="number"
                step="0.001"
                min="0"
                placeholder="Quantité"
                value={line.quantity}
                onChange={(e) => updateLine(index, { quantity: e.target.value })}
                required
              />
              <span className="muted">
                {trop ? '⚠ ' : ''}
                {art?.unit?.code ? `${art.unit.code} · ` : ''}
                libre <Qty value={libreArticle} />
                {line.articleId ? (
                  <>
                    {' · plafond restant '}
                    <Qty value={plafondRestant} />
                    {` (${info?.pctPlafond ?? 15} %)`}
                  </>
                ) : null}
              </span>
              {lines.length > 1 ? (
                <button
                  type="button"
                  className="btn btn-small btn-danger"
                  onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
                >
                  ×
                </button>
              ) : null}
              {trop && plafondLimite ? (
                <span className="muted">
                  Le plafond de {info?.pctPlafond ?? 15} % est atteint pour cet article : la quantité
                  demandée dépasse ce qu'il reste autorisé.
                </span>
              ) : null}
              {qte > 0 && !trop && maxLigne > 0 ? (
                <span className="muted">
                  Lots pris (péremption la plus proche d’abord) : {fefoPreview(Number(line.articleId), qte).join(' · ')}
                </span>
              ) : null}
            </div>
          );
        })}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : 'Réserver'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
