import { Router } from 'express';
import { getProviders, getProviderById, updateProviderStatus } from '../controllers/providerController';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyToken, requireProvider } from '../middleware/auth';

const router = Router();

router.get('/', asyncHandler(getProviders));
router.get('/:id', asyncHandler(getProviderById));

// Only providers can update their own status
router.patch('/status', verifyToken, requireProvider, asyncHandler(updateProviderStatus));

export default router;
