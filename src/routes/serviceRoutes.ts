import { Router } from 'express';
import { getServices } from '../controllers/serviceController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.get('/', asyncHandler(getServices));

export default router;
