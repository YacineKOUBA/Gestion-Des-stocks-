/**
 * Cree (si absente) une base de repetition pour rejouer la chaine complete des
 * migrations Prisma. Sert a recuperer les checksums officiels de chaque
 * migration afin de baseliner la base de developpement, qui n'a aucun historique
 * (P3005) alors que son schema est deja en place.
 */
import { PrismaClient } from '@prisma/client';

const BASELINE = 'gdtrading_baseline';

async function main() {
  const admin = new PrismaClient({ datasources: { db: { url: process.env.ADMIN_DATABASE_URL! } } });
  const rows = await admin.$queryRawUnsafe<{ datname: string }[]>(
    `SELECT datname FROM pg_database WHERE datname = '${BASELINE}'`,
  );
  if (rows.length === 0) {
    await admin.$executeRawUnsafe(`CREATE DATABASE "${BASELINE}"`);
    console.log(`Base creee : ${BASELINE}`);
  } else {
    console.log(`Base deja presente : ${BASELINE}`);
  }
  await admin.$disconnect();
  process.exit(0);
}

main().catch((e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
