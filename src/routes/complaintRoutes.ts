import { Router } from 'express';
import {
    createComplaint,
    getProviderComplaints,
    resolveComplaint,
} from '../controllers/complaintController';
import { verifyToken, requireUser, requireProvider } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// User files a complaint (must be on a COMPLETED booking)
router.post('/', verifyToken, requireUser, asyncHandler(createComplaint));

// Provider views complaints for their bookings
router.get('/provider', verifyToken, requireProvider, asyncHandler(getProviderComplaints));

// Provider resolves a complaint
router.patch('/:id/resolve', verifyToken, requireProvider, asyncHandler(resolveComplaint));

export default router;
