/**
 * Import des fournisseurs a partir de la capture "fournisseurs.png".
 * Transcription OCR validee + corrections :
 *   - 14 : AZELICS (corrige depuis AZEUCS)
 *   - 23 : ETI-SASU (corrige depuis ETI.SASU)
 *
 * Insertion directe via Prisma (le POST /referential/partners force le type ENTITE
 * dans l'API). Type impose : FOURNISSEUR.
 *
 * Idempotent : si un partenaire existe deja avec le meme nom (case-insensitive),
 * il n'est pas recree.
 */
import { PrismaClient, PartnerType } from '@prisma/client';

const FOURNISSEURS = [
  'MULTIVAC NORTH AFRICA',
  'AMCOR PLC',
  'CONSTANTIA FLEX',
  'LE SAFFRE',
  'ARCTIC',
  'LACTAVIT',
  'BIOTEC FERMENTI',
  'AROMAC',
  'KERRY',
  'SUMED',
  'NEW GREEN',
  'IPS ARIFELX',
  'GROUPO CARINSA',
  'AZELICS',
  'ARSHINE',
  'FINOVA',
  'AVEBE',
  'TIANJIN WANHUI BIOTECHNOLOGY',
  'RIO BLANCO',
  'TURCOMAC TESSA',
  'SYMETAL',
  'ECO AGRI',
  'ETI-SASU',
  'REXOR',
  'EXCELLPACK BULGARIA',
];

async function main() {
  const prisma = new PrismaClient();
  let crees = 0;
  let existants = 0;
  const log: string[] = [];

  for (const nom of FOURNISSEURS) {
    const found = await prisma.partner.findFirst({
      where: { name: { equals: nom, mode: 'insensitive' } },
    });
    if (found) {
      existants++;
      log.push(`EXISTE  #${found.id}  ${nom}`);
      continue;
    }
    const created = await prisma.partner.create({
      data: {
        name: nom,
        type: 'FOURNISSEUR' as PartnerType,
        isActive: true,
        plafondExempt: false,
      },
    });
    crees++;
    log.push(`CREE    #${created.id}  ${nom}`);
  }

  const total = await prisma.partner.count();
  console.log('=== IMPORT FOURNISSEURS ===');
  log.forEach((l) => console.log(l));
  console.log('---------------------------');
  console.log(`Crees      : ${crees}`);
  console.log(`Existant(s): ${existants}`);
  console.log(`Total      : ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERREUR:', e);
  process.exit(1);
});