export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export const badRequest = (msg: string) => new ApiError(400, 'BAD_REQUEST', msg);
export const unauthorized = (msg = 'Non autorisé') =>
  new ApiError(401, 'UNAUTHORIZED', msg);
export const forbidden = (msg = 'Accès refusé') =>
  new ApiError(403, 'FORBIDDEN', msg);
export const notFound = (msg = 'Introuvable') =>
  new ApiError(404, 'NOT_FOUND', msg);
export const conflict = (msg: string) => new ApiError(409, 'CONFLICT', msg);