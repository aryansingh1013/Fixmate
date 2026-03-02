import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { BookingStatus } from '@prisma/client';

// ─── Compute user trust score (0-5) based on booking reliability ──────────────
async function getUserTrustScore(userId: string): Promise<number> {
    const bookings = await prisma.booking.findMany({ where: { userId } });
    if (bookings.length === 0) return 5.0; // New users default to 5
    const completed = bookings.filter(b => b.status === 'COMPLETED').length;
    const cancelled = bookings.filter(b => b.status === 'CANCELLED').length;
    const score = 5 - (cancelled / bookings.length) * 2;
    return Math.max(1, Math.min(5, Math.round(score * 10) / 10));
}

// ─── POST /bookings ───────────────────────────────────────────────────────────
export const createBooking = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { providerId, issueDescription, address, complaintPhotoUrl, budgetAmount } = req.body;

    if (!providerId || !issueDescription) {
        return sendError(res, 'Missing providerId or issueDescription', 400);
    }

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

    // Real-time push to provider via Socket.io
    try {
        const { getIO } = require('../socket');
        const io = getIO();
        io.to(providerId).emit('new_booking', booking);
    } catch (e) {
        console.error('[Socket] Failed to fire new_booking event', e);
    }

    // Create notification for provider
    try {
        const provider = await prisma.providerProfile.findUnique({ where: { id: providerId } });
        if (provider) {
            await prisma.notification.create({
                data: {
                    userId: provider.userId,
                    title: 'New Service Request',
                    body: `You have a new booking request: ${issueDescription.substring(0, 60)}...`,
                }
            });
        }
    } catch (e) {
        console.error('[Notification] Failed to create notification', e);
    }

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
            user: {
                select: { id: true, name: true, phone: true }
            }
        }
    });

    // Enrich with trust scores
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
        hasReview: b.reviews.length > 0,
    }));

    return sendSuccess(res, 'User bookings', mapped);
};

// ─── PATCH /bookings/:id/status ────────────────────────────────────────────────
export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status, finalPrice } = req.body;

    const statusMap: Record<string, BookingStatus> = {
        accepted: 'ACCEPTED',
        rejected: 'REJECTED',
        cancelled: 'CANCELLED',
        completed: 'COMPLETED',
    };

    const newStatus = statusMap[status?.toLowerCase()];
    if (!newStatus) return sendError(res, 'Invalid status', 400);

    const booking = await prisma.booking.update({
        where: { id },
        data: {
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date() : undefined,
            ...(finalPrice != null && { finalPrice: parseFloat(finalPrice) }),
        }
    });

    // Real-time push to user
    try {
        const { getIO } = require('../socket');
        getIO().to(booking.userId).emit('booking_updated', booking);
    } catch (e) {
        console.error('[Socket] Failed to fire booking_updated event', e);
    }

    // Create notification for user
    try {
        const statusMsg: Record<string, string> = {
            ACCEPTED: 'Your booking has been accepted! The provider is on the way.',
            REJECTED: 'Your booking was declined by the provider.',
            COMPLETED: `Job completed! Final price: ₹${finalPrice ?? 'TBD'}`,
        };
        if (statusMsg[newStatus]) {
            await prisma.notification.create({
                data: {
                    userId: booking.userId,
                    title: `Booking ${newStatus}`,
                    body: statusMsg[newStatus],
                }
            });
        }
    } catch (e) {
        console.error('[Notification] Failed to create notification', e);
    }

    return sendSuccess(res, 'Booking updated', booking);
};
