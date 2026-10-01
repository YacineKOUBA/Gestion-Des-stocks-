import { Router } from 'express';
import { valuation } from '../services/valuationService';
import { requireRole } from '../middlewares/rbac';
import { RoleCode } from '@prisma/client';

const router = Router();
router.use(requireRole(RoleCode.ADMIN));

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