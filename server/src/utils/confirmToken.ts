import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * D20, decision 7 : le depassement de stock reserve se confirme par un JETON.
 *
 * Le serveur refuse d'abord l'ecriture (409) et renvoie un jeton. Le client
 * affiche la demande de confirmation a l'utilisateur ; si il accepte, il
 * renvoie la meme operation avec le jeton, et l'ecriture est alors acceptee.
 *
 * Le jeton n'est pas une autorisation en carton : il est signe, il expire, et il
 * est lie a l'operation exacte qui l'a declenche. Un jeton obtenu pour une sortie
 * de 10 unites ne peut pas servir a faire passer une sortie de 500 unites, ni a
 * faire toucher un autre lot, ni a autoriser un autre utilisateur.
 *
 * La cle est tiree au demarrage du processus et n'est jamais ecrite sur disque :
 * un redemarrage invalide les jetons en cours, ce qui est sans consequence (ils
 * durent quelques minutes et l'utilisateur peut toujours reessayer).
 */
const SECRET = randomBytes(32);

/** duree de validite d'un jeton : assez pour repondre a une boite de dialogue, pas plus. */
const TTL_MS = 5 * 60 * 1000;

export type ConfirmPayload = Record<string, string | number>;

function sign(text: string): string {
  return createHmac('sha256', SECRET).update(text).digest('base64url');
}

/** Emet un jeton lie a `payload`. Le jeton contient le payload : il est verifiable seul. */
export function issueConfirmToken(payload: ConfirmPayload, now = Date.now()): string {
  const body = JSON.stringify({ ...payload, iat: now });
  const encoded = Buffer.from(body, 'utf8').toString('base64url');
  return `${encoded}.${sign(encoded)}`;
}

/**
 * Verifie qu'un jeton est authentique, non expire, et qu'il a bien ete emis
 * pour exactement `expected`. Renvoie false plutot que de lever : un jeton
 * invalide est un refus d'ecriture, pas une erreur serveur.
 */
export function verifyConfirmToken(
  token: string | null | undefined,
  expected: ConfirmPayload,
  now = Date.now(),
): boolean {
  if (!token) return false;
  const dot = token.lastIndexOf('.');
  if (dot <= 0) return false;
  const encoded = token.slice(0, dot);
  const signature = token.slice(dot + 1);

  const attendu = sign(encoded);
  const a = Buffer.from(attendu);
  const b = Buffer.from(signature);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return false;

  let body: Record<string, unknown>;
  try {
    body = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'));
  } catch {
    return false;
  }

  const iat = Number(body.iat);
  if (!Number.isFinite(iat) || now - iat > TTL_MS || iat - now > 60_000) return false;

  // Le jeton doit avoir ete emis pour cette operation, pas pour une autre.
  for (const [k, v] of Object.entries(expected)) {
    if (body[k] !== v) return false;
  }
  // ...et il ne doit pas porter d'execution non declaree.
  for (const k of Object.keys(body)) {
    if (k === 'iat') continue;
    if (!(k in expected)) return false;
  }
  return true;
}