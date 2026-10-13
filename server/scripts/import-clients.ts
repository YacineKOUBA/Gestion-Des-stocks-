import { PrismaClient, PartnerType } from '@prisma/client';

const CLIENTS = [
  'SARL AMANI LAIT',
  'GIPLAIT MANSOURAH',
  'LAITERIE TLEMCEN',
  'JEEL BAZ',
  'BOUZAR ANIMAL NUTRITION PRODUCT',
  'SARL COPHYD',
  'NADIR',
];

async function main() {
  const prisma = new PrismaClient();
  let crees = 0;
  let existants = 0;
  const log: string[] = [];

  for (const nom of CLIENTS) {
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
        type: 'CLIENT' as PartnerType,
        isActive: true,
        plafondExempt: false,
      },
    });
    crees++;
    log.push(`CREE    #${created.id}  ${nom}`);
  }

  const total = await prisma.partner.count();
  console.log('=== IMPORT CLIENTS ===');
  log.forEach((l) => console.log(l));
  console.log('-----------------------');
  console.log(`Crees      : ${crees}`);
  console.log(`Existant(s): ${existants}`);
  console.log(`Total      : ${total}`);
  await prisma.$disconnect();
}

main().catch((e) => {
  console.error('ERREUR:', e);
  process.exit(1);
});
