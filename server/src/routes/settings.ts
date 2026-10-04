import { Router } from 'express';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { settingsSchema, checkPlafondPct } from '../validators';
import { audit } from '../utils/audit';
import { requirePermission } from '../middlewares/permissions';
import { invalidatePlafondCache, PLAFOND_CODE } from '../services/reservationStock';
import { badRequest } from '../utils/apiError';

const router = Router();

router.get('/', requirePermission('settings:read'), async (_req, res) => {
  res.json(await prisma.setting.findMany({ orderBy: { code: 'asc' } }));
});

router.put('/', requirePermission('settings:write'), async (req, res) => {
  // D21 : le plafond est verifie AVANT le schema, pour que le refus porte son motif.
  // Le gestionnaire d'erreurs ne renvoie a l'ecran que « Donnees invalides » pour
  // toute erreur de schema : sans cette garde, taper « 15,5 » donnait un refus
  // opaque — alors que le defaut qu'on cherche a eviter est precisement un plafond
  // enregistre et jamais applique, et que la direction doit pouvoir le voir.
  const plafondBrut = (req.body as Record<string, unknown> | undefined)?.[PLAFOND_CODE];
  const motif = checkPlafondPct(plafondBrut);
  if (motif) throw badRequest(motif);

  const data = parse(settingsSchema, req.body);
  const updated: string[] = [];
  for (const [code, value] of Object.entries(data)) {
    await prisma.setting.upsert({
      where: { code },
      update: { value },
      create: { code, value },
    });
    updated.push(code);
  }
  // D20 : le plafond de reservation est lu en memoire pendant 5 s. Il faut
  // l'oublier immediatement, sinon la nouvelle valeur ne s'appliquerait qu'apres
  // le delai, et l'utilisateur pourrait croire que l'ecran ne fonctionne pas.
  if (PLAFOND_CODE in data) invalidatePlafondCache();
  await audit(req.user!.id, 'MODIFICATION', 'settings', updated.join(','), { data });
  res.json({ updated });
});

export default router;