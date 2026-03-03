import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

// ─── POST /complaints — User files a complaint on a completed booking ──────────
export const createComplaint = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { bookingId, description } = req.body;

    if (!bookingId || !description) {
        return sendError(res, 'bookingId and description are required', 400);
    }

    // Booking must exist and belong to this user
    const booking = await prisma.booking.findUnique({ where: { id: bookingId } });
    if (!booking) return sendError(res, 'Booking not found', 404);
    if (booking.userId !== userId) return sendError(res, 'Unauthorized', 403);

    // Can only complain about a completed job
    if (booking.status !== 'COMPLETED') {
        return sendError(res, 'Complaints can only be filed on COMPLETED bookings', 400);
    }

    // Prevent duplicate complaints per booking
    const existing = await prisma.complaint.findFirst({ where: { bookingId } });
    if (existing) return sendError(res, 'A complaint already exists for this booking', 409);

    const complaint = await prisma.complaint.create({
        data: { bookingId, userId, description, status: 'OPEN' }
    });

    // Notify provider
    try {
        const provider = await prisma.providerProfile.findUnique({
            where: { id: booking.providerId }
        });
        if (provider) {
            await prisma.notification.create({
                data: {
                    userId: provider.userId,
                    title: 'New Complaint Filed',
                    body: `A user has filed a complaint: ${description.substring(0, 80)}`,
                }
            });
        }
    } catch { /* non-fatal */ }

    return sendSuccess(res, 'Complaint filed', complaint, 201);
};

// ─── GET /complaints/provider — Provider sees complaints for their bookings ───
export const getProviderComplaints = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider profile not found', 404);

    const complaints = await prisma.complaint.findMany({
        where: { booking: { providerId: provider.id } },
        orderBy: { createdAt: 'desc' },
        include: {
            booking: {
                select: {
                    id: true,
                    issueDescription: true,
                    createdAt: true,
                    completedAt: true,
                }
            },
            user: { select: { name: true, phone: true } },
        }
    });

    const mapped = complaints.map(c => ({
        id: c.id,
        status: c.status,
        description: c.description,
        createdAt: c.createdAt,
        customerName: c.user.name,
        customerPhone: c.user.phone,
        bookingId: c.bookingId,
        bookingIssue: c.booking.issueDescription,
        bookingCompletedAt: c.booking.completedAt,
    }));

    return sendSuccess(res, 'Provider complaints', mapped);
};

// ─── PATCH /complaints/:id/resolve — Provider resolves a complaint ────────────
export const resolveComplaint = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider profile not found', 404);

    const complaint = await prisma.complaint.findUnique({
        where: { id },
        include: { booking: true }
    });
    if (!complaint) return sendError(res, 'Complaint not found', 404);

    // Ensure the complaint belongs to one of this provider's bookings
    if (complaint.booking.providerId !== provider.id) {
        return sendError(res, 'Unauthorized', 403);
    }

    if (complaint.status === 'RESOLVED') {
        return sendError(res, 'Complaint is already resolved', 400);
    }

    const updated = await prisma.complaint.update({
        where: { id },
        data: { status: 'RESOLVED' }
    });

    // Notify the user
    try {
        await prisma.notification.create({
            data: {
                userId: complaint.userId,
                title: 'Complaint Resolved',
                body: 'Your complaint has been marked as resolved by the provider.',
            }
        });
    } catch { /* non-fatal */ }

    return sendSuccess(res, 'Complaint resolved', updated);
};
