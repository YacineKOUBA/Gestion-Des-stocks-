import { Router } from 'express';
import * as loanService from '../services/loanService';
import { availableStock } from '../services/movementService';
import { prisma } from '../prisma';
import { badRequest } from '../utils/apiError';
import { parse } from '../utils/parse';
import { loanSchema, restitutionSchema } from '../validators';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

// Prets / emprunts : module ouvert a tout profil autorise, la saisie exige loan:write.
router.use(requirePermission('loan:read'));

router.get('/', async (_req, res) => {
  res.json(await loanService.listLoans());
});

// Depot le moins rempli + quantite par depot : suggestion d'accueil pour un EMPRUNT.
router.get('/depot-suggestion', async (_req, res) => {
  res.json(await loanService.leastFilledDepot());
});

// Stock reellement disponible pour un couple article/lot/depot/emplacement : permet a l'UI
// d'afficher la meme valeur que celle controlee a l'enregistrement du pret.
// Sans depot choisi, on renvoie le stock tous depots confondus (et le depot conseille).
router.get('/disponibilite', async (req, res) => {
  const q = req.query;
  const articleId = Number(q.articleId);
  if (!articleId) throw badRequest('articleId requis');
  const lotId = q.lotId ? Number(q.lotId) : null;
  const depotId = q.depotId ? Number(q.depotId) : undefined;
  const locationId = q.locationId ? Number(q.locationId) : null;
  const tousDepots = depotId === undefined && locationId === null;

  const [disponible, cible] = await Promise.all([
    tousDepots
      ? loanService.stockAllDepots(articleId, lotId)
      : availableStock({ articleId, lotId, depotId, locationId }),
    loanService.resolveStockTarget(articleId, lotId, {}, prisma),
  ]);
  res.json({ disponible, tousDepots, depotConseille: cible.depotId, emplacementConseille: cible.locationId });
});

router.get('/synthesis', async (_req, res) => {
  res.json(await loanService.synthesis());
});

router.post('/', requirePermission('loan:write'), async (req, res) => {
  const data = parse(loanSchema, req.body);
  res.status(201).json(await loanService.createLoan(data, req.user!.id));
});

router.post('/restitution', requirePermission('loan:write'), async (req, res) => {
  const data = parse(restitutionSchema, req.body);
  res.status(201).json(await loanService.createRestitution(data, req.user!.id));
});

export default router;