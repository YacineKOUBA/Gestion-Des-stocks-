import { Modal } from './ui';
import type { LinkedMovementConfirmation } from '../types';

/**
 * Avertissement affiché avant d'annuler un mouvement qui appartient à un AUTRE
 * document : prêt, emprunt, restitution, validation de réservation ou clôture
 * d'inventaire.
 *
 * Le serveur ne se contente pas d'annuler la ligne : il corrige le document lié
 * (suppression du prêt/de la restitution, réouverture de la réservation ou de la
 * ligne d'inventaire) dans la même transaction. Le stock, lui, se recalcule tout
 * seul à partir des mouvements actifs.
 *
 * Ce dialogue est distinct de `OverlapConfirm` : une même annulation peut aussi
 * retirer du stock et déclencher l'avertissement de stock négatif, avec un second
 * jeton. Le client conserve les deux confirmations et rejoue l'annulation avec.
 */
export function MovementLinkConfirm({
  confirmation,
  context,
  busy,
  onCancel,
  onConfirm,
}: {
  confirmation: LinkedMovementConfirmation;
  context?: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal title="Avertissement - Mouvement lié à un document" onClose={onCancel}>
      {context ? <p className="muted">{context}</p> : null}
      <p>{confirmation.message}</p>

      <div className="linked-movement-list">
        {confirmation.links.map((link, index) => (
          <div className="linked-movement-item" key={`${link.kind}-${link.ref}-${index}`}>
            <div className="linked-movement-head">
              <strong>{link.ref}</strong>
              <span className="badge">{link.label}</span>
            </div>
            <div className="muted">{link.detail}</div>
            <div>{link.consequence}</div>
          </div>
        ))}
      </div>

      <p className="muted">
        En confirmant, le stock sera recalculé à partir des mouvements actifs et les
        documents ci-dessus seront remis dans leur état antérieur à ce mouvement.
      </p>

      <div className="form-actions">
        <button type="button" className="btn" onClick={onCancel} disabled={busy}>
          Annuler
        </button>
        <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={busy}>
          {busy ? 'Enregistrement…' : 'Oui, annuler et corriger'}
        </button>
      </div>
    </Modal>
  );
}
