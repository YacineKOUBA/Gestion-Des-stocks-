import { Router } from 'express';
import usersRouter from './users';
import articlesRouter from './articles';
import movementsRouter from './movements';
import stockRouter from './stock';
import lotsRouter from './lots';
import inventoriesRouter from './inventories';
import loansRouter from './loans';
import reservationsRouter from './reservations';
import valuationRouter from './valuation';
import bonsRouter from './bons';
import dashboardRouter from './dashboard';
import settingsRouter from './settings';
import auditRouter from './audit';
import referentialRouter from './referential';

const router = Router();

router.use('/users', usersRouter);
router.use('/articles', articlesRouter);
router.use('/movements', movementsRouter);
router.use('/stock', stockRouter);
router.use('/lots', lotsRouter);
router.use('/inventories', inventoriesRouter);
router.use('/loans', loansRouter);
router.use('/reservations', reservationsRouter);
router.use('/valuation', valuationRouter);
router.use('/bons', bonsRouter);
router.use('/dashboard', dashboardRouter);
router.use('/settings', settingsRouter);
router.use('/audit', auditRouter);
router.use('/referential', referentialRouter);

export default router;