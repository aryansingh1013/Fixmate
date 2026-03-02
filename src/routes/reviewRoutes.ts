import { Router } from 'express';
import { submitReview, getReviewForBooking } from '../controllers/reviewController';
import { verifyToken, requireUser } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';

const router = Router();

router.post('/', verifyToken, requireUser, asyncHandler(submitReview));
router.get('/booking/:bookingId', verifyToken, asyncHandler(getReviewForBooking));

export default router;
