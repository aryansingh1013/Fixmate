import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

export const submitReview = async (req: AuthRequest, res: Response) => {
    const { bookingId, rating, comment } = req.body;
    const userId = req.user!.userId;

    if (!bookingId || !rating) return sendError(res, 'bookingId and rating are required', 400);
    if (rating < 1 || rating > 5) return sendError(res, 'Rating must be 1–5', 400);

    // Verify the booking belongs to this user and is COMPLETED
    const booking = await prisma.booking.findUnique({
        where: { id: bookingId },
        include: { provider: true }
    });

    if (!booking) return sendError(res, 'Booking not found', 404);
    if (booking.userId !== userId) return sendError(res, 'Unauthorized', 403);
    if (booking.status !== 'COMPLETED') return sendError(res, 'Can only review completed jobs', 400);

    // Check for duplicate (Review.bookingId is @unique)
    const existing = await prisma.review.findUnique({ where: { bookingId } });
    if (existing) return sendError(res, 'You already reviewed this booking', 409);

    const review = await prisma.review.create({
        data: {
            bookingId,
            rating: Number(rating),
            comment: comment ?? null,
        }
    });

    // Update provider's avgRating
    const providerReviews = await prisma.review.findMany({
        where: { booking: { providerId: booking.providerId } },
        select: { rating: true }
    });
    const avg = providerReviews.reduce((s, r) => s + r.rating, 0) / providerReviews.length;
    await prisma.providerProfile.update({
        where: { id: booking.providerId },
        data: { avgRating: Math.round(avg * 10) / 10 }
    });

    return sendSuccess(res, 'Review submitted', review, 201);
};

export const getReviewForBooking = async (req: AuthRequest, res: Response) => {
    const { bookingId } = req.params;
    const review = await prisma.review.findUnique({ where: { bookingId } });
    return sendSuccess(res, review ? 'Review found' : 'No review', review);
};
