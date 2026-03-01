import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { BookingStatus } from '@prisma/client';

export const createBooking = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { providerId, issueDescription, address } = req.body;

    if (!providerId || !issueDescription) {
        return sendError(res, 'Missing providerId or issueDescription', 400);
    }

    const booking = await prisma.booking.create({
        data: {
            userId,
            providerId,
            issueDescription,
            address,
            status: 'PENDING',
        }
    });

    try {
        const { getIO } = require('../socket');
        const io = getIO();
        // Emit to the specific Provider's room
        io.to(providerId).emit('new_booking', booking);
    } catch (e) {
        console.error('[Socket] Failed to fire new_booking event', e);
    }

    return sendSuccess(res, 'Booking created successfully', booking, 201);
};

export const getProviderBookings = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { status } = req.query;

    // Find the provider profile for the authenticated user
    const provider = await prisma.providerProfile.findUnique({
        where: { userId }
    });

    if (!provider) {
        return sendError(res, 'Provider profile not found', 404);
    }

    const whereClause: any = { providerId: provider.id };
    if (typeof status === 'string' && Object.values(BookingStatus).includes(status.toUpperCase() as BookingStatus)) {
        whereClause.status = status.toUpperCase() as BookingStatus;
    }

    const bookings = await prisma.booking.findMany({
        where: whereClause,
        include: {
            user: {
                select: { name: true }
            }
        }
    });

    // Map to frontend expectation
    const mapped = bookings.map(b => ({
        id: b.id,
        customerName: b.user.name,
        serviceName: provider.serviceType,
        distance: "2.5 km away",
        urgency: "High", // default mapped UI variable
        status: b.status,
        issueDescription: b.issueDescription
    }));

    return sendSuccess(res, 'Fetched bookings', mapped);
};

export const updateBookingStatus = async (req: AuthRequest, res: Response) => {
    const { id } = req.params;
    const { status } = req.body;

    let newStatus: BookingStatus | undefined;

    if (typeof status === 'string') {
        if (status.toLowerCase() === 'accepted') newStatus = 'ACCEPTED';
        if (status.toLowerCase() === 'rejected') newStatus = 'CANCELLED';
        if (status.toLowerCase() === 'completed') newStatus = 'COMPLETED';
    }

    if (!newStatus) return sendError(res, 'Invalid status update', 400);

    const booking = await prisma.booking.update({
        where: { id: id as string },
        data: {
            status: newStatus,
            completedAt: newStatus === 'COMPLETED' ? new Date() : null
        }
    });

    try {
        const { getIO } = require('../socket');
        const io = getIO();
        // Emit back to the User's room
        io.to(booking.userId).emit('booking_updated', booking);
    } catch (e) {
        console.error('[Socket] Failed to fire booking_updated event', e);
    }

    return sendSuccess(res, 'Booking updated', booking);
};
