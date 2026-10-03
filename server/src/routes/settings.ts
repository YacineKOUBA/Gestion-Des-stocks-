import { Router } from 'express';
import { prisma } from '../prisma';
import { parse } from '../utils/parse';
import { settingsSchema } from '../validators';
import { audit } from '../utils/audit';
import { requirePermission } from '../middlewares/permissions';
import { invalidatePlafondCache, PLAFOND_CODE } from '../services/reservationStock';

const router = Router();

router.get('/', requirePermission('settings:read'), async (_req, res) => {
  res.json(await prisma.setting.findMany({ orderBy: { code: 'asc' } }));
});

router.put('/', requirePermission('settings:write'), async (req, res) => {
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