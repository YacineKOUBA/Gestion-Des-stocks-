export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    /**
     * Charge utile supplementaire serialisee avec l'erreur. Utilisee par D20 :
     * le refus d'empietement sur stock reserve renvoie le detail du conflit
     * (X, Y, Z, overlap) et le jeton de confirmation, pour que le client puisse
     * afficher la question a l'utilisateur sans refaire le calcul.
     */
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (msg: string, details?: unknown) =>
  new ApiError(400, 'BAD_REQUEST', msg, details);
export const unauthorized = (msg = 'Non autorisé') =>
  new ApiError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Accès refusé') =>
  new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Introuvable') =>
  new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string, details?: unknown) =>
  new ApiError(409, 'CONFLICT', msg, details);