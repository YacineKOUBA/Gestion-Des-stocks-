import { Modal } from './ui';
import { Qty } from './Qty';
import type { ReservationOverlapConfirmation } from '../types';

/**
 * D20, regle 3 : dialogue oui/non affiche quand une operation retirant du stock
 * empieterait sur une reservation OU genererait un stock négatif.
 */
export function OverlapConfirm({
  conflict,
  context,
  busy,
  onCancel,
  onConfirm,
}: {
  conflict: ReservationOverlapConfirmation;
  /**
   * Origine de l'operation affichee au-dessus du message. Facultif : sert a rappeler
   * au directeur CE QUI va amputer la reservation (creer un mouvement, reactiver un
   * mouvement annule, cloturer un inventaire...), car la formule reste identique.
   */
  context?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const isNegative = conflict.stockApres !== undefined || conflict.stockActuel !== undefined;
  return (
    <Modal title={isNegative ? 'Avertissement - Stock négatif' : 'Lot réservé touché'} onClose={onCancel}>
      {context ? <p className="muted">{context}</p> : null}
      <p>{conflict.message}</p>

      {isNegative ? (
        <div className="detail-summary">
          <div>
            <span className="muted">Stock actuel</span>
            <strong>
              <Qty value={conflict.stockActuel} />
            </strong>
          </div>
          <div>
            <span className="muted">Quantité demandée</span>
            <strong>
              <Qty value={conflict.quantiteDemandee ?? conflict.quantite} />
            </strong>
          </div>
          <div>
            <span className="muted">Stock après</span>
            <strong style={{ color: 'var(--danger)' }}>
              <Qty value={conflict.stockApres} />
            </strong>
          </div>
        </div>
      ) : (
        <div className="detail-summary">
          <div>
            <span className="muted">Stock du lot (Y)</span>
            <strong>
              <Qty value={conflict.stockCellule} />
            </strong>
          </div>
          <div>
            <span className="muted">Déjà réservé (X)</span>
            <strong>
              <Qty value={conflict.reserve} />
            </strong>
          </div>
          <div>
            <span className="muted">À sortir (Z)</span>
            <strong>
              <Qty value={conflict.quantite} />
            </strong>
          </div>
          <div>
            <span className="muted">Empiètement (X + Z − Y)</span>
            <strong>
              <Qty value={conflict.overlap} />
            </strong>
          </div>
        </div>
      )}

      {!isNegative && (conflict.reservations?.length ?? 0) ? (
        <p className="muted">
          Promesses qui seront amputées :{' '}
          {conflict.reservations?.map((r) => `${r.ref} (${r.amputee})`).join(', ')}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button type="button" className={isNegative ? 'btn btn-danger' : 'btn btn-danger'} onClick={onConfirm} disabled={busy}>
          {busy ? 'Enregistrement…' : isNegative ? 'Confirmer et continuer' : 'Oui, amputer les réservations'}
        </button>
      </div>
    </Modal>
  );
}
