import { Router } from 'express';
import { createBooking, getProviderBookings, updateBookingStatus } from '../controllers/bookingController';
import { verifyToken, requireUser, requireProvider } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

// Only normal users can create bookings
router.post('/', verifyToken, requireUser, asyncHandler(createBooking));

// Only providers can view and update their bookings
router.get('/', verifyToken, requireProvider, asyncHandler(getProviderBookings));
router.patch('/:id', verifyToken, requireProvider, asyncHandler(updateBookingStatus));

export default router;
