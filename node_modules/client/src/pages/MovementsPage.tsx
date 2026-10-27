import { useEffect, useState, useRef, type FormEvent } from 'react';
import {
  articlesApi,
  lotsApi,
  movementsApi,
  referentialApi,
  stockApi,
  type MovementPayload,
} from '../services/endpoints';
import { useAuth } from '../context/AuthContext';
import { errorMessage, useAsync } from '../hooks/useAsync';
import { Badge, Card, ErrorMessage, Field, Modal, PageHeader, SearchSelect, Spinner, SuccessMessage } from '../components/ui';
import { DataTable, type Column } from '../components/DataTable';
import { BonFormModal, type BonFormInitial } from '../components/BonFormModal';
import { OverlapConfirm } from '../components/OverlapConfirm';
import { Qty } from '../components/Qty';
import { overlapConfirmation } from '../services/api';
import type { Movement, Lot, Partner, ReservationOverlapConfirmation } from '../types';
import { formatDate, formatNumber, todayInput, toNumberOrNull } from '../utils/format';
import { articleSearchOptions, partnerSearchOptions } from '../utils/searchOptions';

// PERTE est volontairement absent : le mouvement de perte n'est plus propose ni
// affiche sur cette page. Il reste genere par la cloture d'inventaire (decision
// PERTE), qui ne passe pas par ce formulaire ; l'historique n'est pas efface.
const MOVE_TYPES = ['ENTREE', 'SORTIE', 'TRANSFERT', 'AJUSTEMENT', 'RETOUR', 'INVENTAIRE'];

/**
 * Renomination des types de mouvement a l'affichage (demande de la direction).
 *
 * Les CODES restent inchanges — `ENTREE` et `SORTIE` continuent d'etre envoyes a
 * l'API, filtres et stockes en base. Seul le libelle presente a l'utilisateur
 * change : `ENTREE` devient « RECEPTION » et `SORTIE` devient « LIVRAISON ».
 * Aucune regle metier, aucun filtre serveur et aucune donnee ne sont touches.
 */
const MOVE_TYPE_LABELS: Record<string, string> = {
  ENTREE: 'RECEPTION',
  SORTIE: 'LIVRAISON',
};

/** Natures proposées pour un ajustement NÉGATIF (sortie de stock). */
const ADJUST_NATURES = ['PERTE', 'VOLE', 'CASSE'] as const;

/** Libelle affichable d'un type de mouvement ; un code inconnu reste lisible. */
function moveTypeLabel(code: string | null | undefined): string {
  if (!code) return '—';
  return MOVE_TYPE_LABELS[code] ?? code;
}

// Operations internes : elles ne renvoient ni a un client ni a un fournisseur
// (transfert entre depots, inventaire, ajustement). L'acteur est donc
// PRE-REMPLI avec l'entite interne « GD Trading / BLIDA ». Ce n'est qu'une
// suggestion de saisie : l'utilisateur reste libre de choisir un autre acteur,
// le serveur n'impose rien.
const MOVE_TYPES_ACTEUR_INTERNE = ['TRANSFERT', 'INVENTAIRE', 'AJUSTEMENT'];

/** Libelle de l'entite interne, tolerant au prefixe (« EURL ») et a la casse. */
const ACTEUR_INTERNE_NOM = 'gd trading / blida';

/**
 * Retrouve l'entite interne dans la liste des acteurs. L'identifiant DIFFERE selon
 * les bases (793 en local, absent en production tant qu'il n'a pas ete cree), on
 * ne peut donc pas le figer en dur : c'est le LIBELLE qui sert de cle.
 *
 * On exige les deux mentions « gd trading » ET « blida » pour ne jamais tomber sur
 * un homonyme sans rapport (« HAMZA GD TRADING », « GROSSISTE BLIDA »).
 */
function findActeurInterne(partners: Partner[] | null | undefined): Partner | undefined {
  if (!partners) return undefined;
  const norm = (s: string) => s.trim().toLowerCase();
  return (
    partners.find((p) => p.isActive && norm(p.name) === ACTEUR_INTERNE_NOM) ??
    partners.find(
      (p) => p.isActive && norm(p.name).includes('gd trading') && norm(p.name).includes('blida'),
    )
  );
}

interface BonDraft {
  label: string;
  initial: BonFormInitial;
}

function buildBonDrafts(move: Movement, moveType: string): BonDraft[] {
  const line = {
    articleId: move.articleId,
    lotId: move.lotId,
    quantity: Math.abs(Number(move.quantity)),
    unitPrice: move.unitPrice != null ? Number(move.unitPrice) : null,
    observation: `Mouvement #${move.id}`,
  };
  if (moveType === 'SORTIE') {
    return [
      {
        label: 'bon de sortie',
        initial: { type: 'SORTIE', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  if (moveType === 'TRANSFERT') {
    return [
      {
        label: 'bon de sortie (dépôt source)',
        initial: { type: 'SORTIE', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
      {
        label: "bon d'entrée (dépôt destination)",
        initial: { type: 'ENTREE', depotId: move.depotDestId ?? move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  if (moveType === 'RETOUR') {
    return [
      {
        label: 'bon de retour',
        initial: { type: 'RETOUR', depotId: move.depotId, partnerId: move.partnerId, lines: [line] },
      },
    ];
  }
  return [];
}

export function MovementsPage() {
  const { can } = useAuth();
  const [type, setType] = useState('');
  const [depotId, setDepotId] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [pageSize, setPageSize] = useState(100);
  const [offset, setOffset] = useState(0);
  const [creating, setCreating] = useState(false);
  // D30 : ligne en cours de correction (administrateur uniquement).
  const [editing, setEditing] = useState<Movement | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [pending, setPending] = useState<BonDraft[]>([]);
  const [draftIndex, setDraftIndex] = useState(0);
  const [bonInitial, setBonInitial] = useState<BonFormInitial | null>(null);
  // D20 : reactiver un mouvement annule retire de nouveau du stock. Si cela mord dans
  // une reservation ACTIF, le serveur refuse (409) et renvoie un jeton signe : on
  // affiche le meme dialogue que pour une creation, puis on rejoue la reactivation.
  // Le mouvement vise est memorise avec le conflit : le dialogue doit pouvoir le nommer.
  const [reactivateOverlap, setReactivateOverlap] = useState<{
    move: Movement;
    conflict: ReservationOverlapConfirmation;
  } | null>(null);
  const [reactivateBusy, setReactivateBusy] = useState(false);
  // F3 : meme asymetrie pour l'annulation. Annuler une ENTREE — ou la moitie SORTIE
  // d'un TRANSFERT — retire du stock et peut donc mordre une reservation ACTIF. Le
  // serveur refuse (409) et renvoie un jeton signe ; on reutilise le dialogue D20.
  const [cancelOverlap, setCancelOverlap] = useState<{
    move: Movement;
    conflict: ReservationOverlapConfirmation;
  } | null>(null);
  const [cancelBusy, setCancelBusy] = useState(false);

  function advanceDraft() {
    const next = draftIndex + 1;
    if (next >= pending.length) {
      setPending([]);
      setDraftIndex(0);
    } else {
      setDraftIndex(next);
    }
  }

  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });
  const movements = useAsync(
    () =>
      movementsApi.list({
        type: type || undefined,
        // Le mouvement de perte est retire de la page : le serveur l'exclut du
        // comptage et de la liste, sinon la pagination et le total ("X sur N")
        // compteraient des lignes invisibles.
        excludeType: 'PERTE',
        depotId: depotId ? Number(depotId) : undefined,
        from: from || undefined,
        to: to || undefined,
        limit: pageSize,
        offset,
      }),
    [type, depotId, from, to, pageSize, offset],
  );

  // Un changement de filtre ou de taille de page doit revenir au début de la liste.
  function applyFilter(setter: (v: string) => void) {
    return (value: string) => {
      setter(value);
      setOffset(0);
    };
  }

  const total = movements.data?.total ?? 0;
  const firstShown = total === 0 ? 0 : offset + 1;
  const lastShown = Math.min(offset + pageSize, total);
  const canGoBack = offset > 0;
  const canGoForward = offset + pageSize < total;

  async function handleCancel(move: Movement, confirmToken?: string | null) {
    // Premier essai : confirmation classique. Rejeu apres accord d'empietement : le
    // dialogue D20 a deja fait office de confirmation, on ne redemande rien.
    if (confirmToken == null && !window.confirm(`Annuler le mouvement ${move.id} ?`)) return;
    try {
      await movementsApi.cancel(move.id, confirmToken ?? null);
      setCancelOverlap(null);
      setSuccess(`Mouvement ${move.id} annulé.`);
      movements.reload();
    } catch (err) {
      const conflict = overlapConfirmation(err);
      if (conflict) {
        setCancelOverlap({ move, conflict });
      } else {
        window.alert(errorMessage(err, 'Annulation impossible'));
      }
    } finally {
      setCancelBusy(false);
    }
  }

  async function handleReactivate(move: Movement, confirmToken?: string | null) {
    // Premier essai : on demande la confirmation classique. Rejeu apres accord
    // d'empietement : le dialogue D20 a deja fait office de confirmation.
    if (
      confirmToken == null &&
      !window.confirm(
        `Réactiver le mouvement ${move.id} (${moveTypeLabel(move.type?.code)}) ? Le stock disponible sera recalculé.`,
      )
    )
      return;
    try {
      await movementsApi.reactivate(move.id, confirmToken ?? null);
      setReactivateOverlap(null);
      setSuccess(`Mouvement ${move.id} réactivé.`);
      movements.reload();
    } catch (err) {
      const conflict = overlapConfirmation(err);
      if (conflict) {
        setReactivateOverlap({ move, conflict });
      } else {
        window.alert(errorMessage(err, 'Réactivation impossible'));
      }
    } finally {
      setReactivateBusy(false);
    }
  }

  async function handleDelete(move: Movement) {
    if (
      !window.confirm(
        `Supprimer définitivement le mouvement ${move.id} du journal des E/S ?\nCette action est irréversible (l'opération reste tracée dans le journal d'audit).`,
      )
    )
      return;
    try {
      await movementsApi.remove(move.id);
      setSuccess(`Mouvement ${move.id} supprimé du journal.`);
      movements.reload();
    } catch (err) {
      window.alert(errorMessage(err, 'Suppression impossible'));
    }
  }

  const columns: Column<Movement>[] = [
    {
      key: 'item',
      header: 'ITEM',
      align: 'right',
      className: 'col-item',
      // Numero de ligne chronologique, pas un identifiant : le tout premier mouvement
      // (le plus ancien) porte 1, et chaque mouvement suivant incremente. Le tableau
      // est affiche du PLUS RECENT au plus ancien (tri serveur), donc le numero se
      // deduit du total et du rang de la ligne dans l'ensemble pagine : `offset + index`
      // est le rang absolu de la ligne, et `total - rang` remonte vers 1 pour l'ancien.
      render: (_m, index) => formatNumber(total - (offset + index)),
    },
    { key: 'movementDate', header: 'Date', render: (m) => formatDate(m.movementDate) },
    { key: 'type', header: 'Type', render: (m) => moveTypeLabel(m.type?.code) },
    { key: 'article', header: 'Article', render: (m) => (m.article ? `${m.article.code} — ${m.article.designation}` : '—') },
    { key: 'depot', header: 'Dépôt', render: (m) => m.depot?.label ?? '—' },
    { key: 'location', header: 'Emplacement', render: (m) => m.location?.label ?? '—' },
    { key: 'lot', header: 'Lot', render: (m) => m.lot?.lotNumber ?? '—' },
    {
      key: 'quantity',
      header: 'Quantité',
      align: 'right',
      render: (m) => (
        <span className={m.sens >= 0 ? 'qty-in' : 'qty-out'}>
          <Qty value={m.quantity} sign={m.sens >= 0 ? '+' : '−'} />
        </span>
      ),
    },
    { key: 'partner', header: 'Acteur', render: (m) => m.partner?.name ?? '-' },
    {
      key: 'observation',
      header: 'Observation',
      // Un ajustement négatif n'a pas d'observation libre : la colonne affiche la
      // nature et le motif saisis dans le formulaire (« PERTE — Marchandise cassée »).
      render: (m) =>
        m.adjustNature
          ? [m.adjustNature, m.adjustMotif].filter(Boolean).join(' — ')
          : (m.observation ?? '—'),
    },
    {
      key: 'status',
      header: 'Statut',
      render: (m) => <Badge tone={m.status === 'ACTIF' ? 'green' : 'neutral'}>{m.status}</Badge>,
    },
  ];

  return (
    <>
      <PageHeader
        title="Mouvement"
        subtitle="Réceptions, livraisons, transferts, ajustements et retours"
        actions={
          can('movement:write') ? (
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setSuccess(null);
                setCreating(true);
              }}
            >
              Nouveau mouvement
            </button>
          ) : null
        }
      />

      <Card>
        <div className="filters">
          <select value={type} onChange={(e) => applyFilter(setType)(e.target.value)}>
            <option value="">Tous les types</option>
            {MOVE_TYPES.map((t) => (
              <option key={t} value={t}>
                {moveTypeLabel(t)}
              </option>
            ))}
          </select>
          <select value={depotId} onChange={(e) => applyFilter(setDepotId)(e.target.value)}>
            <option value="">Tous les dépôts</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
          <input type="date" value={from} onChange={(e) => applyFilter(setFrom)(e.target.value)} />
          <input type="date" value={to} onChange={(e) => applyFilter(setTo)(e.target.value)} />
        </div>
      </Card>

      <Card>
        {success ? <SuccessMessage message={success} /> : null}
        {movements.error ? <ErrorMessage message={movements.error} /> : null}
        {movements.loading && !movements.data ? (
          <Spinner />
        ) : (
          <DataTable
            columns={[
              ...columns,
              ...(can('movement:revise') || can('movement:edit')
                ? ([
                    {
                      key: 'actions',
                      header: 'Actions',
                      render: (m: Movement) =>
                        m.status === 'ACTIF' ? (
                          <span className="btn-group">
                            {/* D30 : correction d'une ligne. `movement:edit` est reserve a
                                l'administrateur ; le serveur refuse de toute facon (403),
                                mais autant ne pas montrer le bouton. */}
                            {can('movement:edit') ? (
                              <button
                                type="button"
                                className="btn btn-small"
                                onClick={() => {
                                  setSuccess(null);
                                  setEditing(m);
                                }}
                              >
                                Modifier
                              </button>
                            ) : null}
                            <button type="button" className="btn btn-small" onClick={() => handleCancel(m)}>
                              Annuler
                            </button>
                          </span>
                        ) : (
                          <span className="btn-group">
                            <button type="button" className="btn btn-small" onClick={() => handleReactivate(m)}>
                              Réactiver
                            </button>
                            <button type="button" className="btn btn-small btn-danger" onClick={() => handleDelete(m)}>
                              Supprimer
                            </button>
                          </span>
                        ),
                    },
                  ] as Column<Movement>[])
                : []),
            ]}
            rows={movements.data?.items ?? []}
            rowKey={(m) => m.id}
            empty="Aucun mouvement."
          />
        )}

        {total > pageSize || offset > 0 ? (
          <div className="pagination">
            <span className="muted">
              {formatNumber(firstShown)}–{formatNumber(lastShown)} sur {formatNumber(total)} mouvements
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

      {creating ? (
        <MovementFormModal
          onClose={() => setCreating(false)}
          onSaved={(moveType, move) => {
            setCreating(false);
            setSuccess('Mouvement enregistré.');
            movements.reload();
            const drafts = buildBonDrafts(move, moveType);
            if (drafts.length > 0) {
              setPending(drafts);
              setDraftIndex(0);
            }
          }}
        />
      ) : null}

      {/* D30 : correction d'une ligne existante. Pas d'elaboration de bon ici : la
          correction d'un mouvement deja ecrit ne cree pas une nouvelle piece. */}
      {editing ? (
        <MovementFormModal
          movement={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            setSuccess(`Mouvement ${editing.id} modifié.`);
            movements.reload();
          }}
        />
      ) : null}

      {pending.length > 0 && draftIndex < pending.length ? (
        <Modal title="Élaborer un bon" onClose={() => setPending([])}>
          <p>
            Voulez-vous élaborer un {pending[draftIndex].label} pour le mouvement enregistré ?
          </p>
          <div className="form-actions">
            <button type="button" className="btn" onClick={advanceDraft}>
              Non
            </button>
            <button type="button" className="btn btn-primary" onClick={() => setBonInitial(pending[draftIndex].initial)}>
              Oui, élaborer
            </button>
          </div>
        </Modal>
      ) : null}

      {bonInitial ? (
        <BonFormModal
          initial={bonInitial}
          onClose={() => {
            setBonInitial(null);
            advanceDraft();
          }}
          onSaved={() => {
            setBonInitial(null);
            advanceDraft();
          }}
        />
      ) : null}

      {/* D20 : rejouer la reactivation avec le jeton signe si l'utilisateur accepte
          que la promesse soit amputee. */}
      {reactivateOverlap ? (
        <OverlapConfirm
          conflict={reactivateOverlap.conflict}
          context={`Réactivation du mouvement ${reactivateOverlap.move.id} : cette opération retire du stock.`}
          busy={reactivateBusy}
          onCancel={() => setReactivateOverlap(null)}
          onConfirm={() => {
            setReactivateBusy(true);
            void handleReactivate(reactivateOverlap.move, reactivateOverlap.conflict.confirmToken);
          }}
        />
      ) : null}

      {/* F3 : meme dialogue pour l'annulation, qui retire elle aussi du stock. */}
      {cancelOverlap ? (
        <OverlapConfirm
          conflict={cancelOverlap.conflict}
          context={`Annulation du mouvement ${cancelOverlap.move.id} : cette opération retire du stock.`}
          busy={cancelBusy}
          onCancel={() => setCancelOverlap(null)}
          onConfirm={() => {
            setCancelBusy(true);
            void handleCancel(cancelOverlap.move, cancelOverlap.conflict.confirmToken);
          }}
        />
      ) : null}
    </>
  );
}

function MovementFormModal({
  onClose,
  onSaved,
  movement,
}: {
  onClose: () => void;
  onSaved: (moveType: string, move: Movement) => void;
  /** D30 : ligne a CORRIGER. Absent = nouvelle saisie. */
  movement?: Movement;
}) {
  // D26 : l'AJUSTEMENT est reserve a l'administrateur (movement:adjust). Ce filtre n'est
  // qu'un confort d'ecran : le vrai controle reste la route de creation, qui refuse en
  // 403 tout AJUSTEMENT saisi par un profil non admin.
  const { can, user } = useAuth();
  const enEdition = movement != null;
  const articles = useAsync(() => articlesApi.list(), [], { label: 'Articles' });
  const depots = useAsync(() => referentialApi.depots(), [], { label: 'Dépôts' });
  const locations = useAsync(() => stockApi.locations(), [], { label: 'Emplacements' });
  const partners = useAsync(() => referentialApi.partners(), [], { label: 'Acteurs' });
  // Lots fetches uniquement pour l'article selectionne (le serveur filtre par articleId).
  const [form, setForm] = useState(() =>
    movement
      ? {
          type: movement.type?.code ?? 'ENTREE',
          articleId: String(movement.articleId),
          // `quantity` arrive en Decimal serialise : on l'affiche sans zero inutile.
          quantity: String(Number(movement.quantity)),
          movementDate: movement.movementDate.slice(0, 10),
          depotId: String(movement.depotId),
          locationId: movement.locationId != null ? String(movement.locationId) : '',
          depotDestId: movement.depotDestId != null ? String(movement.depotDestId) : '',
          locationDestId: movement.locationDestId != null ? String(movement.locationDestId) : '',
          lotId: movement.lotId != null ? String(movement.lotId) : '',
          partnerId: movement.partnerId != null ? String(movement.partnerId) : '',
          docNumber: movement.docNumber ?? '',
          unitPrice: movement.unitPrice != null ? String(Number(movement.unitPrice)) : '',
          observation: movement.observation ?? '',
          sens: String(movement.sens),
          adjustNature: movement.adjustNature ?? '',
          adjustMotif: movement.adjustMotif ?? '',
        }
      : {
          type: 'ENTREE',
          articleId: '',
          quantity: '',
          movementDate: todayInput(),
          depotId: '',
          locationId: '',
          depotDestId: '',
          locationDestId: '',
          lotId: '',
          partnerId: '',
          docNumber: '',
          unitPrice: '',
          observation: '',
          sens: '1',
          adjustNature: '',
          adjustMotif: '',
        },
  );
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  // D20 : conflit d'empietement renvoye par le serveur (409), a confirmer explicitement.
  const [overlap, setOverlap] = useState<ReservationOverlapConfirmation | null>(null);
  const dernierPayload = useRef<MovementPayload | null>(null);

  // Un RETOUR propose aussi les lots masques pour fin de quantite : la marchandise
  // revient sur le lot dont elle est sortie, meme si ce lot est aujourd'hui a zero.
  const isRetour = form.type === 'RETOUR';
  const lots = useAsync(
    () =>
      form.articleId
        ? lotsApi.list({ articleId: Number(form.articleId), includeExhausted: isRetour })
        : Promise.resolve([] as Lot[]),
    [form.articleId, isRetour],
    { label: 'Lots' },
  );

  const articleLots = (lots.data ?? []).filter((l) => String(l.articleId) === form.articleId);
  // Pour un RETOUR, les lots par lesquels la marchandise est partiee chez un client
  // remontent en tete, du plus recent au plus ancien : ce sont les sorties encore ouvertes
  // qui ont le plus de chances d'etre retournees. Un lot jamais sorti passe en fin de liste.
  const orderedLots = isRetour
    ? [...articleLots].sort((a, b) => {
        const da = a.lastExitAt ? Date.parse(a.lastExitAt) : 0;
        const db = b.lastExitAt ? Date.parse(b.lastExitAt) : 0;
        if (db !== da) return db - da;
        if ((b.sortiQty ?? 0) !== (a.sortiQty ?? 0)) return (b.sortiQty ?? 0) - (a.sortiQty ?? 0);
        return a.lotNumber.localeCompare(b.lotNumber);
      })
    : articleLots;
  const selectedArticle = (articles.data ?? []).find((a) => String(a.id) === form.articleId);
  const lotSelectionnel = articleLots.find((l) => String(l.id) === form.lotId) ?? null;
  const isTransfer = form.type === 'TRANSFERT';
  // Un ajustement peut être POSITIF (entrée en stock) ou NÉGATIF (sortie). Le
  // négatif doit être qualifié : nature + motif remplacent alors l'observation.
  const isAjustement = form.type === 'AJUSTEMENT';
  const isAjustementNegatif = isAjustement && form.sens === '-1';
  // D26 : l'AJUSTEMENT n'est propose qu'aux profils qui en ont le droit (administrateur).
  const typesDisponibles = can('movement:adjust') ? MOVE_TYPES : MOVE_TYPES.filter((t) => t !== 'AJUSTEMENT');
  // D31 : le champ Date est verrouille pour le Magasinier, et POUR LUI SEUL. La regle ne
  // vise que la SAISIE d'un nouveau mouvement : la correction d'une ligne existante
  // (`enEdition`) est de toute facon reservee a l'administrateur, qui garde la main.
  // On teste le ROLE et non un droit : la demande nomme le profil, et un futur droit
  // accorde au magasinier ne doit pas rouvrir ce champ par effet de bord.
  const dateVerrouillee = !enEdition && user?.role === 'MAGASINIER';

  function update(key: keyof typeof form, value: string) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  // Operations internes : l'acteur est pre-rempli avec l'entite « GD Trading /
  // BLIDA ». L'effet ne se declenche qu'au CHANGEMENT de type (et sur le chargement
  // des acteurs) : une fois pre-rempli, une correction manuelle de l'utilisateur
  // n'est pas ecrasee, puisque `form.type` n'a pas bouge. L'acteur interne est
  // recherche par libelle (son identifiant differe selon les bases) ; s'il n'existe
  // pas encore le champ reste vide et l'operation s'enregistre sans acteur.
  const acteurInterneId = findActeurInterne(partners.data)?.id;
  useEffect(() => {
    if (!MOVE_TYPES_ACTEUR_INTERNE.includes(form.type)) return;
    if (!acteurInterneId) return;
    const valeur = String(acteurInterneId);
    setForm((prev) => (prev.partnerId === valeur ? prev : { ...prev, partnerId: valeur }));
  }, [form.type, acteurInterneId]);

  // Prix par defaut : prix de l'article a la selection, puis prix du lot si le lot en a un.
  function handleArticleChange(value: string) {
    const article = (articles.data ?? []).find((a) => String(a.id) === value);
    update('articleId', value);
    // Un lot choisi pour un autre article n'est plus valable.
    update('lotId', '');
    update('unitPrice', article?.unitPrice != null ? String(article.unitPrice) : '');
  }

  function handleLotChange(value: string) {
    update('lotId', value);
    const lot = articleLots.find((l) => String(l.id) === value);
    if (lot?.unitPrice != null) update('unitPrice', String(lot.unitPrice));
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);

    const errors: string[] = [];
    if (!form.articleId) errors.push("sélectionnez un article");
    if (!form.depotId) errors.push('sélectionnez un dépôt');
    if (!form.movementDate) errors.push('renseignez la date');
    if (!(Number(form.quantity) > 0)) errors.push('saisissez une quantité supérieure à 0');
    if (isTransfer && !form.depotDestId) errors.push('sélectionnez un dépôt de destination');
    if (isAjustementNegatif && !form.adjustNature) {
      errors.push("sélectionnez la nature de l'ajustement (PERTE, VOLE ou CASSE)");
    }
    if (isAjustementNegatif && !form.adjustMotif.trim()) {
      errors.push("renseignez le motif de l'ajustement");
    }
    if (selectedArticle?.isLotTracked && !form.lotId) {
      errors.push("cet article est suivi par lot : sélectionnez un lot (créez-en un depuis « Lots » si nécessaire)");
    }
    if (errors.length > 0) {
      setError(`Champs à compléter : ${errors.join(' ; ')}.`);
      return;
    }

    setSubmitting(true);
    const payload: MovementPayload = {
      type: form.type,
      articleId: Number(form.articleId),
      quantity: Number(form.quantity),
      // D31 : date verrouillee (Magasinier) => on impose le jour meme, sans dependre de
      // l'etat du champ. Le serveur reste l'autorite ; ici on garantit seulement qu'aucune
      // valeur perimee ne parte.
      movementDate: dateVerrouillee ? todayInput() : form.movementDate,
      depotId: Number(form.depotId),
      locationId: form.locationId ? Number(form.locationId) : null,
      depotDestId: isTransfer && form.depotDestId ? Number(form.depotDestId) : null,
      locationDestId: isTransfer && form.locationDestId ? Number(form.locationDestId) : null,
      lotId: form.lotId ? Number(form.lotId) : null,
      partnerId: form.partnerId ? Number(form.partnerId) : null,
      docNumber: form.docNumber || null,
      unitPrice: toNumberOrNull(form.unitPrice),
      // Ajustement : le sens est explicite (1 = entrée, -1 = sortie). Les autres
      // types gardent leur sens imposé par le serveur.
      ...(isAjustement ? { sens: Number(form.sens) } : {}),
      // Ajustement négatif : nature + motif remplacent l'observation libre.
      adjustNature: isAjustementNegatif ? form.adjustNature : null,
      adjustMotif: isAjustementNegatif ? form.adjustMotif.trim() : null,
      observation: isAjustementNegatif ? null : form.observation || null,
    };
    await envoyer(payload);
  }

  /** Envoie l'operation ; en cas d'empietement, ouvre le dialogue de confirmation. */
  async function envoyer(payload: MovementPayload) {
    setSubmitting(true);
    setError(null);
    dernierPayload.current = payload;
    try {
      if (enEdition) {
        const updated = await movementsApi.update(movement.id, payload);
        setOverlap(null);
        onSaved(form.type, updated);
        return;
      }
      const created = await movementsApi.create(payload);
      const createdMove = (created as { sortie?: Movement }).sortie ?? (created as Movement);
      setOverlap(null);
      onSaved(form.type, createdMove);
    } catch (err) {
      const conflict = overlapConfirmation(err);
      if (conflict) {
        setOverlap(conflict);
      } else {
        setError(errorMessage(err, enEdition ? 'Modification impossible' : 'Création impossible'));
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal title={enEdition ? `Modifier le mouvement ${movement.id}` : 'Nouveau mouvement'} onClose={onClose}>
      <form onSubmit={handleSubmit} className="form-grid" noValidate>
        <ErrorMessage message={error} />
        <Field label="Type">
          <select value={form.type} onChange={(e) => update('type', e.target.value)}>
            {typesDisponibles.map((t) => (
              <option key={t} value={t}>
                {moveTypeLabel(t)}
              </option>
            ))}
          </select>
        </Field>
        {isAjustement ? (
          <Field
            label="Sens de l'ajustement"
            hint="Positif : entrée en stock (+). Négatif : sortie de stock (−)."
          >
            <select value={form.sens} onChange={(e) => update('sens', e.target.value)}>
              <option value="1">Positif (+)</option>
              <option value="-1">Négatif (−)</option>
            </select>
          </Field>
        ) : null}
        <Field label="Article">
          <SearchSelect
            options={articleSearchOptions(articles.data)}
            value={form.articleId ? Number(form.articleId) : null}
            onChange={(id) => handleArticleChange(id ? String(id) : '')}
            placeholder="Rechercher un article…"
          />
        </Field>
        <Field label="Quantité">
          <input
            type="number"
            step="0.001"
            min="0.001"
            value={form.quantity}
            onChange={(e) => update('quantity', e.target.value)}
            required
          />
        </Field>
        <Field label="Date">
          <input
            type="date"
            value={form.movementDate}
            onChange={(e) => update('movementDate', e.target.value)}
            // D31 : le magasinier ne choisit pas la date d'un NOUVEAU mouvement, elle est
            // attribuee automatiquement (le jour meme). Il saisit l'entree/sortie au moment
            // ou elle a lieu ; antidater une ecriture fausserait l'historique et le stock
            // valorise a une date donnee. L'administrateur, lui, garde la main pour
            // corriger apres coup.
            disabled={dateVerrouillee}
            title={dateVerrouillee ? 'Date attribuée automatiquement (profil Magasinier)' : undefined}
            required
          />
        </Field>
        <Field label="Dépôt">
          <select value={form.depotId} onChange={(e) => update('depotId', e.target.value)} required>
            <option value="">—</option>
            {depots.data?.map((d) => (
              <option key={d.id} value={d.id}>
                {d.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Emplacement">
          <select value={form.locationId} onChange={(e) => update('locationId', e.target.value)}>
            <option value="">—</option>
            {locations.data?.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </Field>
        {isTransfer ? (
          <>
            <Field label="Dépôt destination">
              <select value={form.depotDestId} onChange={(e) => update('depotDestId', e.target.value)} required>
                <option value="">—</option>
                {depots.data?.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Emplacement destination">
              <select value={form.locationDestId} onChange={(e) => update('locationDestId', e.target.value)}>
                <option value="">—</option>
                {locations.data?.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.label}
                  </option>
                ))}
              </select>
            </Field>
          </>
        ) : null}
        <Field
          label={selectedArticle?.isLotTracked ? 'Lot (obligatoire)' : 'Lot'}
          hint={
            selectedArticle?.isLotTracked && articleLots.length === 0
              ? "Aucun lot pour cet article : créez-en un dans la page « Lots »."
              : isRetour && articleLots.length > 0
                ? 'Les lots par lesquels la marchandise est partie chez un client sont proposés en premier, y compris épuisés : le stock peut ainsi revenir sur le lot d’origine.'
                : undefined
          }
        >
            <select value={form.lotId} onChange={(e) => handleLotChange(e.target.value)}>
              <option value="">-</option>
              {orderedLots.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.lotNumber}
                  {l.sortiQty ? ` (sorti ${formatNumber(l.sortiQty)}${l.exhausted ? ', épuisé' : ''})` : l.exhausted ? ' (épuisé)' : ` (${formatNumber(l.quantity)})`}
                </option>
              ))}
            </select>
            {lotSelectionnel ? (
              <p className="muted">
                Stock du lot {lotSelectionnel.lotNumber} :{' '}
                <Qty value={lotSelectionnel.quantity} />
              </p>
            ) : null}
        </Field>
        <Field
          label="Acteur"
          hint={
            MOVE_TYPES_ACTEUR_INTERNE.includes(form.type)
              ? 'Acteur proposé automatiquement pour cette opération interne : modifiable.'
              : undefined
          }
        >
          <SearchSelect
            options={partnerSearchOptions(partners.data)}
            value={form.partnerId ? Number(form.partnerId) : null}
            onChange={(id) => update('partnerId', id ? String(id) : '')}
            placeholder="Rechercher un acteur…"
          />
        </Field>
        <Field label="N° document">
          <input value={form.docNumber} onChange={(e) => update('docNumber', e.target.value)} />
        </Field>
        <Field label="Prix unitaire">
          <input
            type="number"
            step="0.0001"
            min="0"
            value={form.unitPrice}
            onChange={(e) => update('unitPrice', e.target.value)}
          />
        </Field>
        {isAjustementNegatif ? (
          <>
            <Field label="Nature">
              <select
                value={form.adjustNature}
                onChange={(e) => update('adjustNature', e.target.value)}
                required
              >
                <option value="">—</option>
                {ADJUST_NATURES.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Motif">
              <input
                value={form.adjustMotif}
                onChange={(e) => update('adjustMotif', e.target.value)}
                maxLength={255}
                placeholder="Précisez le motif…"
                required
              />
            </Field>
          </>
        ) : (
          <Field label="Observation">
            <input value={form.observation} onChange={(e) => update('observation', e.target.value)} />
          </Field>
        )}
        <div className="form-actions">
          <button type="button" className="btn" onClick={onClose}>
            Annuler
          </button>
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {submitting ? 'Enregistrement…' : enEdition ? 'Enregistrer les modifications' : 'Enregistrer'}
          </button>
        </div>
      </form>

      {overlap ? (
        <OverlapConfirm
          conflict={overlap}
          busy={submitting}
          onCancel={() => setOverlap(null)}
          onConfirm={() => {
            const p = dernierPayload.current;
            if (p) void envoyer({ ...p, confirmToken: overlap.confirmToken });
          }}
        />
      ) : null}
    </Modal>
  );
}
