import { Router } from 'express';
import { valuation } from '../services/valuationService';
import { requirePermission } from '../middlewares/permissions';

const router = Router();

// D16 : la Valorisation etait reservee a l'administrateur. Elle s'ouvre a tout profil
// disposant de valuation:read, ce qui inclut la direction generale.
router.use(requirePermission('valuation:read'));

router.get('/', async (req, res) => {
  const q = req.query;
  res.json(
    await valuation({
      categoryId: q.categoryId ? Number(q.categoryId) : undefined,
      familyId: q.familyId ? Number(q.familyId) : undefined,
      depotId: q.depotId ? Number(q.depotId) : undefined,
    }),
  );
});

export default router;