import { Modal } from './ui';
import { Qty } from './Qty';
import type { ReservationOverlapConfirmation } from '../types';

/**
 * D20, regle 3 : dialogue oui/non affiche quand une operation retirant du stock
 * empieterait sur une reservation. On montre au directeur les trois quantites qui
 * fondent la decision (Y stock du lot, X deja reserve, Z a sortir) et l'overlap
 * exact `X + Z − Y`. La confirmation renvoie le jeton signe avec la MEME operation :
 * le serveur revalide alors les quantites avant d'ecrire.
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
  return (
    <Modal title="Lot réservé touché" onClose={onCancel}>
      {context ? <p className="muted">{context}</p> : null}
      <p>{conflict.message}</p>

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

      {conflict.reservations.length ? (
        <p className="muted">
          Promesses qui seront amputées :{' '}
          {conflict.reservations.map((r) => `${r.ref} (${r.amputee})`).join(', ')}
        </p>
      ) : null}

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Non, ne pas toucher
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Oui, amputer les réservations'}
        </button>
      </div>
    </Modal>
  );
}
