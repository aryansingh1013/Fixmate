import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { BookingStatus } from '@prisma/client';

// ─── Valid status transitions ─────────────────────────────────────────────────
const ALLOWED_TRANSITIONS: Record<string, BookingStatus[]> = {
    PENDING: ['ACCEPTED', 'REJECTED'],
    ACCEPTED: ['COMPLETED', 'CANCELLED'],
    COMPLETED: [],
    CANCELLED: [],
    REJECTED: [],
};

// ─── Compute user trust score (0-5) based on booking reliability ──────────────
async function getUserTrustScore(userId: string): Promise<number> {
    const bookings = await prisma.booking.findMany({ where: { userId } });
    if (bookings.length === 0) return 5.0;
    const cancelled = bookings.filter(b => b.status === 'CANCELLED').length;
    const score = 5 - (cancelled / bookings.length) * 2;
    return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

// ─── Helper: fire notification (non-fatal) ────────────────────────────────────
async function notify(userId: string, title: string, body: string) {
    try {
        await prisma.notification.create({ data: { userId, title, body } });
    } catch { /* non-fatal */ }
}

// ─── Helper: fire socket event (non-fatal) ────────────────────────────────────
function socketEmit(room: string, event: string, payload: any) {
    try {
        const { getIO } = require('../socket');
        getIO().to(room).emit(event, payload);
    } catch { /* non-fatal */ }
}

// ─── POST /bookings ───────────────────────────────────────────────────────────
export const createBooking = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { providerId, issueDescription, address, complaintPhotoUrl, budgetAmount } = req.body;

    if (!providerId || !issueDescription) {
        return sendError(res, 'Missing providerId or issueDescription', 400);
    }

    const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } });
    if (!provider) return sendError(res, 'Provider not found', 404);

    const booking = await prisma.booking.create({
        data: {
            userId,
            providerId,
            issueDescription,
            address: address ?? null,
            complaintPhotoUrl: complaintPhotoUrl ?? null,
            budgetAmount: budgetAmount ? parseFloat(budgetAmount) : null,
            status: 'PENDING',
        }
    });

    socketEmit(providerId, 'new_booking', booking);

    await notify(
        provider.userId,
        'New Service Request',
        `You have a new booking request: ${issueDescription.substring(0, 60)}...`
    );

    return sendSuccess(res, 'Booking created', booking, 201);
};

// ─── GET /bookings/provider — Provider sees all their requests (rich) ─────────
export const getProviderBookings = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { status } = req.query;

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider profile not found', 404);

    const whereClause: any = { providerId: provider.id };
    if (typeof status === 'string') {
        const s = status.toUpperCase();
        if (Object.values(BookingStatus).includes(s as BookingStatus)) {
            whereClause.status = s as BookingStatus;
        }
    }

    const bookings = await prisma.booking.findMany({
        where: whereClause,
        orderBy: { createdAt: 'desc' },
        include: {
            user: { select: { id: true, name: true, phone: true } },
            reviews: { select: { rating: true } },
        }
    });

    const mapped = await Promise.all(bookings.map(async b => {
        const trustScore = await getUserTrustScore(b.userId);
        return {
            id: b.id,
            customerName: b.user.name,
            customerPhone: b.user.phone,
            customerId: b.user.id,
            trustScore,
            serviceName: provider.serviceType,
            issueDescription: b.issueDescription,
            address: b.address,
            complaintPhotoUrl: b.complaintPhotoUrl,
            budgetAmount: b.budgetAmount,
            finalPrice: b.finalPrice,
            status: b.status,
            createdAt: b.createdAt,
            completedAt: b.completedAt,
            cancellationReason: b.cancellationReason,
            cancelledBy: b.cancelledBy,
            hasReview: b.reviews.length > 0,
        };
    }));

    return sendSuccess(res, 'Fetched bookings', mapped);
};

// ─── GET /bookings/user — User sees their booking history ────────────────────
export const getUserBookings = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    const bookings = await prisma.booking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: {
            provider: { include: { user: { select: { name: true } } } },
            reviews: { select: { rating: true, comment: true } }
        }
    });

    const mapped = bookings.map(b => ({
        id: b.id,
        providerId: b.providerId,
        providerName: b.provider.user.name,
        serviceName: b.provider.serviceType,
        issueDescription: b.issueDescription,
        address: b.address,
        complaintPhotoUrl: b.complaintPhotoUrl,
        budgetAmount: b.budgetAmount,
        finalPrice: b.finalPrice,
        status: b.status,
        createdAt: b.createdAt,
        completedAt: b.completedAt,
        cancellationReason: b.cancellationReason,
        cancelledBy: b.cancelledBy,
        hasReview: b.reviews.length > 0,
        review: b.reviews[0] ?? null,
    }));

    return sendSuccess(res, 'User bookings', mapped);
};

// ─── PATCH /bookings/:id/status — Provider updates booking status ──────────────
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status, finalPrice } = req.body;
    const userId = req.user!.userId;

    const statusMap: Record<string, BookingStatus> = {
        accepted: 'ACCEPTED',
        rejected: 'REJECTED',
        completed: 'COMPLETED',
    };

    const newStatus = statusMap[status?.toLowerCase()];
    if (!newStatus) return sendError(res, `Invalid status. Allowed: ${Object.keys(statusMap).join(', ')}`, 400);

    // Load current booking
    const booking = await prisma.booking.findUnique({
        where: { id },
        include: { provider: true }
    });
    if (!booking) return sendError(res, 'Booking not found', 404);

    // Ensure provider owns this booking
    if (booking.provider.userId !== userId) {
        return sendError(res, 'Unauthorized: not your booking', 403);
    }

    // Validate transition
    const allowed = ALLOWED_TRANSITIONS[booking.status] || [];
    if (!allowed.includes(newStatus)) {
        return sendError(
            res,
            `Cannot transition from ${booking.status} to ${newStatus}. Booking is currently ${booking.status}.`,
            400
        );
    }

    const updated = await prisma.booking.update({
        where: { id },
        data: {
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date() : undefined,
            ...(finalPrice != null && { finalPrice: parseFloat(finalPrice) }),
        }
    });

    socketEmit(booking.userId, 'booking_updated', updated);

    const statusMsg: Record<string, string> = {
        ACCEPTED: 'Your booking has been accepted! The provider is on the way.',
        REJECTED: 'Your booking was declined by the provider.',
        COMPLETED: `Job completed! Final price: ₹${finalPrice ?? updated.finalPrice ?? 'TBD'}`,
    };
    if (statusMsg[newStatus]) {
        await notify(booking.userId, `Booking ${newStatus}`, statusMsg[newStatus]);
    }

    return sendSuccess(res, `Booking ${newStatus.toLowerCase()}`, updated);
};

// ─── PATCH /bookings/:id/cancel — Role-aware cancellation with reason ──────────
export const cancelBooking = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { reason } = req.body;
    const userId = req.user!.userId;
    const role = req.user!.role; // 'USER' | 'PROVIDER'

    const booking = await prisma.booking.findUnique({
        where: { id },
        include: { provider: true }
    });
    if (!booking) return sendError(res, 'Booking not found', 404);

    // Verify ownership based on role
    if (role === 'USER' && booking.userId !== userId) {
        return sendError(res, 'Unauthorized: not your booking', 403);
    }
    if (role === 'PROVIDER' && booking.provider.userId !== userId) {
        return sendError(res, 'Unauthorized: not your booking', 403);
    }

    // Validate cancellation window per role
    if (role === 'USER') {
        if (!['PENDING', 'ACCEPTED'].includes(booking.status)) {
            return sendError(res, `Cannot cancel a booking that is ${booking.status}. You can only cancel PENDING or ACCEPTED bookings.`, 400);
        }
    } else {
        // PROVIDER
        if (booking.status !== 'ACCEPTED') {
            return sendError(res, `Providers can only cancel ACCEPTED bookings. Current status: ${booking.status}.`, 400);
        }
    }

    const updated = await prisma.booking.update({
        where: { id },
        data: {
            status: 'CANCELLED',
            cancellationReason: reason ?? null,
            cancelledBy: role,
        }
    });

    // Notify the other party
    if (role === 'USER') {
        await notify(
            booking.provider.userId,
            'Booking Cancelled by User',
            reason ? `Reason: ${reason}` : 'The user has cancelled the booking.'
        );
        socketEmit(booking.providerId, 'booking_cancelled', updated);
    } else {
        await notify(
            booking.userId,
            'Booking Cancelled by Provider',
            reason ? `Reason: ${reason}` : 'The provider has cancelled your booking.'
        );
        socketEmit(booking.userId, 'booking_cancelled', updated);
    }

    return sendSuccess(res, 'Booking cancelled', updated);
};
