import {PrismaClient} from '@prisma/client';
import * as fs from 'fs';
import * as path from 'path';
const prisma = new PrismaClient();
async function main() {
  const csvPath = process.env.CLIENTS_CSV_PATH || path.join(process.env.TEMP || process.env.TMP || 'C:/Users/Y.DROUICHE/AppData/Local/Temp', 'opencode', 'clients_full.csv');
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split(/\r?\n/).filter(l=>l.trim());
  let created = 0;
  let skipped = 0;
  for (let i=1; i<lines.length; i++) {
    const line = lines[i];
    const semi = line.indexOf(';');
    if (semi < 0) continue;
    const code = line.slice(0, semi).trim();
    const name = line.slice(semi+1).trim();
    if (!name) continue;
    const existF = await prisma.partner.findFirst({where:{name:{equals:name, mode:'insensitive'}, type:'FOURNISSEUR'}});
    if (existF) { skipped++; continue; }
    const existC = await prisma.partner.findFirst({where:{name:{equals:name, mode:'insensitive'}, type:'CLIENT'}});
    if (existC) { skipped++; continue; }
    await prisma.partner.create({data:{name, type:'CLIENT', isActive:true, plafondExempt:false}});
    created++;
    if (created % 50 === 0) console.log('created', created);
  }
  console.log('DONE', created, skipped);
  await prisma.$disconnect();
}
main().catch(e=>{console.error(e);process.exit(1);});
