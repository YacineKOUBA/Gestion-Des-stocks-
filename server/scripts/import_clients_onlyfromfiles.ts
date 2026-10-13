import {PrismaClient} from '@prisma/client';
import * as fs from 'fs';
const prisma = new PrismaClient();
async function main() {
  const csvPath = 'C:/Users/Y.DROUICHE/AppData/Local/Temp/opencode/clients_full.csv';
  const csv = fs.readFileSync(csvPath, 'utf8');
  const lines = csv.split(/\r?\n/).filter(l=>l.trim());
  let created = 0;
  let skipped = 0;
  for (let i=1; i<lines.length; i++) {
    const line = lines[i];
    const semi = line.indexOf(';');
    if (semi < 0) continue;
    const name = line.slice(semi+1).trim();
    if (!name) continue;
    // UNIQUEMENT verifier doublon DANS fichiers clients fusionnés? non.
    // Ne pas empêcher si existe chez fournisseurs - créer quand même? 
    // mais séparation physique visible => on crée TOUTES les lignes des fichiers clients en tant que CLIENTS
    const existC = await prisma.partner.findFirst({where:{name:{equals:name, mode:'insensitive'}, type:'CLIENT'}});
    if (existC) { skipped++; continue; }
    await prisma.partner.create({data:{name, type:'CLIENT', isActive:true, plafondExempt:false}});
    created++;
  }
  console.log('DONE', created, skipped);
  await prisma.();
}
main().catch(e=>{console.error(e);process.exit(1);});
