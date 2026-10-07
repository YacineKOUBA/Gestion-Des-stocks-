/**
 * Referentiel des conditionnements : les 7 valeurs distinctes de l'onglet PRODUIT
 * (articles.csv, colonne `conditionnement`) doivent exister en base, chacune avec
 * un code.
 *
 * Convention identique aux familles : code = libelle en majuscules (les libelles
 * sont uniques, les codes donc aussi). Idempotent : une ligne deja presente est
 * completee si son code manque, jamais dupliquee.
 */
import { PrismaClient } from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

async function main() {
  const csvPath = path.resolve(__dirname, '../../articles.csv');
  const raw = fs.readFileSync(csvPath, 'utf8').replace(/^\uFEFF/, '');
  const lines = raw.split(/\r?\n/).filter((l) => l.trim());
  const header = lines[0].split(';').map((h) => h.trim());
  const idx = header.indexOf('conditionnement');

  const wanted = new Set<string>();
  for (const line of lines.slice(1)) {
    const v = (line.split(';')[idx] ?? '').trim().toUpperCase();
    if (v) wanted.add(v);
  }

  console.log(`Conditionnements distincts dans le fichier : ${wanted.size}`);
  let created = 0;
  let completed = 0;

  for (const label of [...wanted].sort()) {
    const code = label.slice(0, 10).toUpperCase();
    const existing = await prisma.packaging.findUnique({ where: { label } });
    if (!existing) {
      await prisma.packaging.create({ data: { code, label } });
      created += 1;
      console.log(`  CREATION  ${code.padEnd(10)} ${label}`);
    } else if (existing.code !== code) {
      await prisma.packaging.update({ where: { id: existing.id }, data: { code } });
      completed += 1;
      console.log(`  CODE      ${existing.code} -> ${code}  (${label})`);
    } else {
      console.log(`  OK        ${code.padEnd(10)} ${label}`);
    }
  }

  const all = await prisma.packaging.findMany({ orderBy: { code: 'asc' } });
  console.log(`\nReferentiel Packaging (${all.length}) :`);
  for (const p of all) console.log(`  ${p.code.padEnd(10)} ${p.label}`);
  console.log(`\ncrees=${created} completes=${completed} total=${all.length}`);
  process.exit(0);
}

main().catch(async (e) => {
  console.error('ERREUR :', e);
  process.exit(1);
});
