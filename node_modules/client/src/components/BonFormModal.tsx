import { useEffect, useState, type FormEvent } from 'react';
import { articlesApi, bonsApi, lotsApi, referentialApi, type BonPayload } from '../services/endpoints';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { ErrorMessage, Field, Modal } from './ui';
import type { BonType, Lot } from '../types';
import { formatDate, todayInput } from '../utils/format';
import { CURRENCY_OPTIONS } from '../utils/currencies';

interface LineDraft {
  articleId: string;
  lotId: string;
  quantity: string;
  unitPrice: string;
  observation: string;
}

const emptyLine: LineDraft = { articleId: '', lotId: '', quantity: '', unitPrice: '', observation: '' };

export interface BonFormInitialLine {
  articleId: number;
  lotId?: number | null;
  quantity: number;
  unitPrice?: number | null;
  observation?: string | null;
}

export interface BonFormInitial {
  type: BonType;
  depotId?: number | null;
  depotDestId?: number | null;
  partnerId?: number | null;
  currency?: string;
  lines?: BonFormInitialLine[];
}

export function BonFormModal({
  onClose,
  onSaved,
  initial,
}: {
  onClose: () => void;
  onSaved: () => void;
  initial?: BonFormInitial;
}) {
  const articles = useAsync(() => articlesApi.list(), [], { label: 'Articles' });
  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });
  const partners = useAsync(() => referentialApi.partners(), [], { label: 'Acteurs' });

  const [form, setForm] = useState({
    type: initial?.type ?? ('SORTIE' as BonType),
    depotId: initial?.depotId != null ? String(initial.depotId) : '',
    depotDestId: initial?.depotDestId != null ? String(initial.depotDestId) : '',
    partnerId: initial?.partnerId != null ? String(initial.partnerId) : '',
    currency: initial?.currency ?? 'DZD',
    bonDate: todayInput(),
  });
  const [lines, setLines] = useState<LineDraft[]>(
    initial?.lines?.length
      ? initial.lines.map((l) => ({
          articleId: String(l.articleId),
          lotId: l.lotId != null ? String(l.lotId) : '',
          quantity: String(l.quantity),
          unitPrice: l.unitPrice != null ? String(l.unitPrice) : '',
          observation: l.observation ?? '',
        }))
      : [{ ...emptyLine }],
  );
  const [lotOptions, setLotOptions] = useState<Record<number, Lot[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Charge les lots des articles deja pre-remplis (bon cree depuis un mouvement).
  useEffect(() => {
    let cancelled = false;
    const ids = [...new Set((initial?.lines ?? []).map((l) => l.articleId))];
    ids.forEach(async (id) => {
      if (lotOptions[id] !== undefined) return;
      try {
        const lots = await lotsApi.list({ articleId: id });
        if (!cancelled) setLotOptions((prev) => ({ ...prev, [id]: lots }));
      } catch {
        if (!cancelled) setLotOptions((prev) => ({ ...prev, [id]: [] }));
      }
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function updateLine(index: number, key: keyof LineDraft, value: string) {
    setLines((prev) => prev.map((line, i) => (i === index ? { ...line, [key]: value } : line)));
  }

  // Le prix unitaire suit le lot : si le lot choisi a un prix propre, il est applique a la ligne.
  function handleLotChange(index: number, value: string) {
    const lots = lotOptions[Number(lines[index].articleId)] ?? [];
    const lot = lots.find((l) => String(l.id) === value);
    updateLine(index, 'lotId', value);
    if (lot?.unitPrice != null) updateLine(index, 'unitPrice', String(lot.unitPrice));
  }

  // A la selection d'un article : PU, lot et devise renseignes automatiquement (deja connus).
  async function handleArticleChange(index: number, value: string) {
    const articleId = value ? Number(value) : 0;
    const article = articles.data?.find((a) => a.id === articleId);
    setLines((prev) =>
      prev.map((line, i) =>
        i === index
          ? { ...line, articleId: value, unitPrice: article?.unitPrice != null ? String(article.unitPrice) : '', lotId: '' }
          : line,
      ),
    );
    // La devise du bon suit celle de l'article selectionne.
    if (article?.currency) setForm((prev) => ({ ...prev, currency: article.currency }));
    if (articleId && lotOptions[articleId] === undefined) {
      try {
        const lots = await lotsApi.list({ articleId });
        setLotOptions((prev) => ({ ...prev, [articleId]: lots }));
        // Un seul lot disponible : le selectionner automatiquement (prix du lot si defini).
        if (lots.length === 1) {
          setLines((prev) =>
            prev.map((line, i) => {
              if (i !== index) return line;
              const lot = lots[0];
              return {
                ...line,
                lotId: String(lot.id),
                ...(lot.unitPrice != null ? { unitPrice: String(lot.unitPrice) } : {}),
              };
            }),
          );
        }
      } catch {
        setLotOptions((prev) => ({ ...prev, [articleId]: [] }));
      }
    }
  }

  // INVARIANT DEVISE : un bon est libelle dans une seule devise, celle de ses articles.
  // On releve les devises des lignes pour verrouiller le champ Devise des que les
  // lignes sont toutes dans la meme devise, et signaler le melange avant l'enregistrement.
  const lignesRemplies = lines.filter((l) => l.articleId);
  const devisesLignes = [
    ...new Set(
      lignesRemplies
        .map((l) => articles.data?.find((a) => a.id === Number(l.articleId))?.currency)
        .filter((c): c is string => !!c),
    ),
  ].sort();
  const deviseBloquee = devisesLignes.length === 1 ? devisesLignes[0] : null;
  const devisesMelangees = devisesLignes.length > 1;

  useEffect(() => {
    if (deviseBloquee) setForm((prev) => (prev.currency === deviseBloquee ? prev : { ...prev, currency: deviseBloquee }));
  }, [deviseBloquee]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    if (devisesMelangees) {
      setError(
        `Bon impossible : vos lignes sont dans plusieurs devises (${devisesLignes.join(', ')}). ` +
          `Un bon doit être libellé dans une seule devise : unifiez les prix des articles concernés.`,
      );
      setSubmitting(false);
      return;
    }
    const payload: BonPayload = {
      type: form.type,
      depotId: form.depotId ? Number(form.depotId) : null,
      depotDestId: form.type === 'TRANSFERT' && form.depotDestId ? Number(form.depotDestId) : null,
      partnerId: form.partnerId ? Number(form.partnerId) : null,
      bonDate: form.bonDate,
      currency: form.currency,
      lines: lines
        .filter((l) => l.articleId && l.quantity)
        .map((l) => ({
          articleId: Number(l.articleId),
          lotId: l.lotId ? Number(l.lotId) : null,
          quantity: Number(l.quantity),
          unitPrice: l.unitPrice ? Number(l.unitPrice) : null,
          observation: l.observation || null,
        })),
    };
    if (payload.lines.length === 0) {
      setError('Ajoutez au moins une ligne.');
      setSubmitting(false);
      return;
    }
    try {
      await bonsApi.create(payload);
      onSaved();
    } catch (err) {
      setError(errorMessage(err, 'Création impossible'));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title="Nouveau bon" onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid">
        <ErrorMessage message={error} />
        <Field label="Type">
          <select
            value={form.type}
            onChange={(e) => setForm((prev) => ({ ...prev, type: e.target.value as BonType }))}
          >
            <option value="ENTREE">ENTREE</option>
            <option value="SORTIE">SORTIE</option>
            <option value="LIVRAISON">LIVRAISON</option>
            <option value="TRANSFERT">TRANSFERT</option>
            <option value="RETOUR">RETOUR</option>
          </select>
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={form.bonDate}
            onChange={(e) => setForm((prev) => ({ ...prev, bonDate: e.target.value }))}
            required
          />
        </Field>
        <Field
          label="Devise"
          hint={
            deviseBloquee
              ? 'Verrouillée sur la devise des articles de vos lignes.'
              : devisesMelangees
                ? 'Devises multiples dans les lignes : unifiez-les avant d’enregistrer.'
                : undefined
          }
        >
          <select
            value={form.currency}
            onChange={(e) => setForm((prev) => ({ ...prev, currency: e.target.value }))}
            disabled={!!deviseBloquee}
          >
            {CURRENCY_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Dépôt">
          <select
            value={form.depotId}
            onChange={(e) => setForm((prev) => ({ ...prev, depotId: e.target.value }))}
          >
            <option value="">—</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        {form.type === 'TRANSFERT' ? (
          <Field label="Dépôt destination">
            <select
              value={form.depotDestId}
              onChange={(e) => setForm((prev) => ({ ...prev, depotDestId: e.target.value }))}
            >
              <option value="">—</option>
              {depots.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Field label="Acteur">
          <select
            value={form.partnerId}
            onChange={(e) => setForm((prev) => ({ ...prev, partnerId: e.target.value }))}
          >
            <option value="">—</option>
            {partners.data?.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </Field>

        <div className="form-section-title">
          Lignes
          <button type="button" className="btn btn-small" onClick={() => setLines((prev) => [...prev, { ...emptyLine }])}>
            Ajouter une ligne
          </button>
        </div>
        {lines.map((line, index) => (
          <div className="line-editor" key={index}>
            <select value={line.articleId} onChange={(e) => handleArticleChange(index, e.target.value)} required>
              <option value="">Article…</option>
              {articles.data?.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.designation}
                </option>
              ))}
            </select>
            <select
              value={line.lotId}
              onChange={(e) => handleLotChange(index, e.target.value)}
              disabled={!line.articleId || (lotOptions[Number(line.articleId)]?.length ?? 0) === 0}
            >
              <option value="">
                {!line.articleId
                  ? 'Lot…'
                  : (lotOptions[Number(line.articleId)]?.length ?? 0) === 0
                    ? 'Aucun lot'
                    : 'Lot…'}
              </option>
              {(lotOptions[Number(line.articleId)] ?? []).map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}
                  {l.expiryDate ? ` (exp. ${formatDate(l.expiryDate)})` : ''}
                </option>
              ))}
            </select>
            <input
              type="number"
              step="0.001"
              min="0.001"
              placeholder="Qté"
              value={line.quantity}
              onChange={(e) => updateLine(index, 'quantity', e.target.value)}
              required
            />
            <input
              type="number"
              step="0.0001"
              min="0"
              placeholder="PU (auto)"
              value={line.unitPrice}
              onChange={(e) => updateLine(index, 'unitPrice', e.target.value)}
            />
            <input
              placeholder="Observation"
              value={line.observation}
              onChange={(e) => updateLine(index, 'observation', e.target.value)}
            />
            {lines.length > 1 ? (
              <button
                type="button"
                className="btn btn-small btn-danger"
                onClick={() => setLines((prev) => prev.filter((_, i) => i !== index))}
              >
                ×
              </button>
            ) : null}
          </div>
        ))}

        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting || devisesMelangees}>
            {submitting ? 'Enregistrement…' : 'Enregistrer'}
          </button>
        </div>
      </form>
    </Modal>
  );
}