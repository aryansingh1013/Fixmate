import { Router } from 'express';
import {
    createBooking,
    getProviderBookings,
    getUserBookings,
    updateBookingStatus,
    cancelBooking,
} from '../controllers/bookingController';
import { verifyToken, requireUser, requireProvider } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// User creates a booking
router.post('/', verifyToken, requireUser, asyncHandler(createBooking));

// User views own booking history
router.get('/user', verifyToken, requireUser, asyncHandler(getUserBookings));

// Provider views incoming requests
router.get('/provider', verifyToken, requireProvider, asyncHandler(getProviderBookings));

// Provider updates booking status (accept/reject/complete) — NO cancel here (role-aware cancel below)
router.patch('/:id/status', verifyToken, requireProvider, asyncHandler(updateBookingStatus));

// Role-aware cancellation — both USER and PROVIDER can hit this
router.patch('/:id/cancel', verifyToken, asyncHandler(cancelBooking));

export default router;
