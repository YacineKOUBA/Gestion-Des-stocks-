/**
 * Repare les droits du role applicatif `gdtrading` (celui de server/.env).
 *
 * Constat (PostgreSQL 16) :
 *   - depuis PG15, le schema `public` n'accorde plus USAGE a PUBLIC ;
 *   - le role `gdtrading` existe mais n'a AUCUN droit (0 table lisible) ;
 *   - les 31 tables appartiennent a `postgres`.
 * Resultat : toute requete de l'application echoue en 42501
 * "permission denied for schema public", que le handler traduit en 500
 * "Erreur interne" sur /api/auth/login.
 *
 * Correctif : `gdtrading` devient proprietaire de son schema (comme en
 * production, ou le role applicatif fait aussi les migrations), avec les
 * privileges par defaut pour les objets futurs. Aucune donnee n'est modifiee.
 */
import { PrismaClient } from '@prisma/client';

const ROLE = 'gdtrading';
const SCHEMA = 'public';
const ADMIN_URL = process.env.ADMIN_DATABASE_URL!;

async function main() {
  const p = new PrismaClient({ datasources: { db: { url: ADMIN_URL } } });

  const role = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_roles WHERE rolname = '${ROLE}'`,
  );
  if (role[0].n === 0) throw new Error(`Role ${ROLE} absent : a creer d'abord.`);

  // 1. Usage + creation sur le schema.
  await p.$executeRawUnsafe(`GRANT USAGE, CREATE ON SCHEMA ${SCHEMA} TO ${ROLE}`);
  console.log(`GRANT USAGE, CREATE ON SCHEMA ${SCHEMA} -> ${ROLE}`);

  // 2. Propriete des objets existants (tables, sequences, vues).
  const tables = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='${SCHEMA}' AND tableowner='${ROLE}'`,
  );
  const allTables = await p.$queryRawUnsafe<{ name: string }[]>(
    `SELECT tablename AS name FROM pg_tables WHERE schemaname='${SCHEMA}' AND tableowner<>'${ROLE}'`,
  );
  for (const t of allTables) {
    await p.$executeRawUnsafe(`ALTER TABLE ${SCHEMA}."${t.name}" OWNER TO ${ROLE}`);
  }
  console.log(`Proprietaire : ${allTables.length} tables transferees (${tables[0].n} deja OK).`);

  const seqs = await p.$queryRawUnsafe<{ name: string }[]>(
    `SELECT sequencename AS name FROM pg_sequences WHERE schemaname='${SCHEMA}' AND sequenceowner<>'${ROLE}'`,
  );
  for (const s of seqs) {
    await p.$executeRawUnsafe(`ALTER SEQUENCE ${SCHEMA}."${s.name}" OWNER TO ${ROLE}`);
  }
  console.log(`Proprietaire : ${seqs.length} sequences transferees.`);

  const views = await p.$queryRawUnsafe<{ name: string }[]>(
    `SELECT viewname AS name FROM pg_views WHERE schemaname='${SCHEMA}' AND viewowner<>'${ROLE}'`,
  );
  for (const v of views) {
    await p.$executeRawUnsafe(`ALTER VIEW ${SCHEMA}."${v.name}" OWNER TO ${ROLE}`);
  }
  console.log(`Proprietaire : ${views.length} vues transferees.`);

  // 3. Privileges par defaut : les objets crees plus tard par `postgres`
  //    (migrations rejouees a la main) restent accessibles a l'application.
  for (const owner of ['postgres', ROLE]) {
    await p.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${SCHEMA} GRANT ALL PRIVILEGES ON TABLES TO ${ROLE}`,
    );
    await p.$executeRawUnsafe(
      `ALTER DEFAULT PRIVILEGES FOR ROLE ${owner} IN SCHEMA ${SCHEMA} GRANT ALL PRIVILEGES ON SEQUENCES TO ${ROLE}`,
    );
  }
  console.log(`Privileges par defaut configures pour les roles postgres et ${ROLE}.`);

  // 4. Verification.
  const usage = await p.$queryRawUnsafe<{ ok: boolean }[]>(
    `SELECT has_schema_privilege('${ROLE}','${SCHEMA}','USAGE') AS ok`,
  );
  const readable = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables
     WHERE schemaname='${SCHEMA}'
       AND has_table_privilege('${ROLE}', format('%I.%I', schemaname, tablename), 'SELECT,INSERT,UPDATE,DELETE')`,
  );
  const total = await p.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM pg_tables WHERE schemaname='${SCHEMA}'`,
  );
  console.log(`VERIF : USAGE=${usage[0].ok ? 'OUI' : 'NON'} | tables accessibles=${readable[0].n}/${total[0].n}`);
  process.exit(usage[0].ok && readable[0].n === total[0].n ? 0 : 1);
}

main().catch((e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
