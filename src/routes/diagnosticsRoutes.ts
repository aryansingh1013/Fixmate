import { Router } from 'express';
import { analyzeImage } from '../controllers/diagnosticsController';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/analyze', asyncHandler(analyzeImage));

export default router;
