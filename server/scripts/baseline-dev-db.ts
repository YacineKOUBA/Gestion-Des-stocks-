/**
 * Baseline de la base de developpement.
 *
 * La base `gdtrading` a ete construite sans historique Prisma : elle n'a pas de
 * table `_prisma_migrations`, donc `prisma migrate deploy` refuse avec P3005
 * alors que son schema correspond bien aux 30 premieres migrations.
 *
 * On recopie les lignes de la base de repetition (ou la meme chaine de
 * migrations vient d'etre appliquee de zero) pour les 30 premieres migrations :
 * la 31 (`add_packaging_code`) reste a appliquer par `migrate deploy` sur
 * `gdtrading`, ce qui verifie le chemin normal de deploiement.
 *
 * PostgreSQL refuse les references inter-bases : on lit donc avec un second
 * PrismaClient connecte a la base de repetition.
 *
 * Nettoie au passage la table `prisma_migrations` (mauvais nom) creee par une
 * tentative precedente.
 */
import { PrismaClient } from '@prisma/client';

const NEW_MIGRATION = '20261007100000_add_packaging_code';
const BASELINE_URL = process.env.BASELINE_DATABASE_URL!;

type MigrationRow = {
  id: string;
  checksum: string;
  finished_at: Date | null;
  migration_name: string;
  logs: string | null;
  rolled_back_at: Date | null;
  started_at: Date;
  applied_steps_count: number;
};

async function main() {
  const target = new PrismaClient(); // DATABASE_URL = gdtrading
  const source = new PrismaClient({ datasources: { db: { url: BASELINE_URL } } });

  // Table au mauvais nom creee par erreur : on la supprime (elle est vide).
  const wrong = await target.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = 'prisma_migrations'`,
  );
  if (wrong[0].n > 0) {
    const rows = await target.$queryRawUnsafe<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM "prisma_migrations"',
    );
    if (rows[0].n === 0) {
      await target.$executeRawUnsafe('DROP TABLE "prisma_migrations"');
      console.log('Table parasite "prisma_migrations" (vide) supprimee.');
    } else {
      throw new Error('"prisma_migrations" contient des lignes : intervention manuelle requise.');
    }
  }

  const exists = await target.$queryRawUnsafe<{ n: number }[]>(
    `SELECT count(*)::int AS n FROM information_schema.tables
     WHERE table_schema = 'public' AND table_name = '_prisma_migrations'`,
  );
  if (exists[0].n > 0) {
    const rows = await target.$queryRawUnsafe<{ n: number }[]>(
      'SELECT count(*)::int AS n FROM "_prisma_migrations"',
    );
    if (rows[0].n > 0) {
      console.log(`_prisma_migrations contient deja ${rows[0].n} lignes : rien a faire.`);
      process.exit(0);
    }
  }

  // Structure exacte de la table que Prisma cree lui-meme.
  await target.$executeRawUnsafe(`
    CREATE TABLE public."_prisma_migrations" (
      "id" VARCHAR(36) NOT NULL,
      "checksum" VARCHAR(64) NOT NULL,
      "finished_at" TIMESTAMPTZ,
      "migration_name" VARCHAR(255) NOT NULL,
      "logs" TEXT,
      "rolled_back_at" TIMESTAMPTZ,
      "started_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
      "applied_steps_count" INTEGER NOT NULL DEFAULT 0,
      CONSTRAINT "_prisma_migrations_pkey" PRIMARY KEY ("id")
    )
  `);
  console.log('Table _prisma_migrations creee.');

  const rows = await source.$queryRawUnsafe<MigrationRow[]>(
    `SELECT * FROM public._prisma_migrations WHERE "migration_name" <> '${NEW_MIGRATION}' ORDER BY "started_at"`,
  );

  for (const r of rows) {
    await target.$executeRawUnsafe(
      `INSERT INTO public._prisma_migrations
         ("id", "checksum", "finished_at", "migration_name", "logs", "rolled_back_at", "started_at", "applied_steps_count")
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      r.id,
      r.checksum,
      r.finished_at,
      r.migration_name,
      r.logs,
      r.rolled_back_at,
      r.started_at,
      r.applied_steps_count,
    );
  }

  console.log(`Baseline : ${rows.length} migrations enregistrees (hors ${NEW_MIGRATION}).`);
  console.log(`Reste a appliquer : ${NEW_MIGRATION} (via prisma migrate deploy).`);
  process.exit(0);
}

main().catch((e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
