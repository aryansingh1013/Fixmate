import { Router } from 'express';
import {
    getProviders,
    getProviderById,
    updateProviderStatus,
    getProviderMe,
    getProviderStats,
    getProviderEarningsGraph,
    getProviderReviews,
    updateProviderProfile,
    addCertification,
    getPublicProviderProfile,
} from '../controllers/providerController';
import { asyncHandler } from '../utils/asyncHandler';
import { verifyToken, requireProvider } from '../middleware/auth';

const router = Router();

// ─── Public routes ──────────────────────────────────────────────────────────
router.get('/', asyncHandler(getProviders));

// IMPORTANT: specific named routes must come before /:id
// ─── Authenticated provider-only routes ─────────────────────────────────────
router.use('/me', verifyToken, requireProvider);
router.get('/me', asyncHandler(getProviderMe));
router.patch('/me', asyncHandler(updateProviderProfile));
router.post('/me/certifications', asyncHandler(addCertification));

router.get('/stats', verifyToken, requireProvider, asyncHandler(getProviderStats));
router.get('/earnings-graph', verifyToken, requireProvider, asyncHandler(getProviderEarningsGraph));
router.get('/reviews', verifyToken, requireProvider, asyncHandler(getProviderReviews));
router.patch('/status', verifyToken, requireProvider, asyncHandler(updateProviderStatus));

// ─── Parameterised routes last ───────────────────────────────────────────────
router.get('/:id/public', asyncHandler(getPublicProviderProfile));
router.get('/:id', asyncHandler(getProviderById));

export default router;
