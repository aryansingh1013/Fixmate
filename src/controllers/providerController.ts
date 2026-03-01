import { Request, Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { ServiceType, BookingStatus } from '@prisma/client';

export const getProviders = async (req: Request, res: Response) => {
    const { service } = req.query;

    const whereClause: any = { isAvailable: true };
    if (typeof service === 'string') {
        // Map normal string to Enum safely
        const enumService = service.toUpperCase().replace(' ', '_');
        if (Object.values(ServiceType).includes(enumService as ServiceType)) {
            whereClause.serviceType = enumService as ServiceType;
        }
    }

    const providers = await prisma.providerProfile.findMany({
        where: whereClause,
        include: {
            user: {
                select: { name: true, email: true }
            }
        }
    });

    // Map to frontend expected format
    const mapped = providers.map(p => ({
        id: p.id,
        userId: p.userId,
        name: p.user.name,
        experience: `${p.experienceYears} Years Experience`,
        trustScore: 0.95, // Hardcoded for now until Phase 2 aggregate reviews
        avatarUrl: `https://ui-avatars.com/api/?name=${p.user.name.replace(' ', '+')}`,
        serviceCategory: p.serviceType,
        distance: '1.2 km away', // Map requires Phase 3
        revenue: 0, // No longer stored! Aggregated in Phase 2
        isOnline: p.isAvailable
    }));

    return sendSuccess(res, 'Fetched providers', mapped);
};

export const getProviderById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const provider = await prisma.providerProfile.findUnique({
        where: { id: id as string },
        include: { user: { select: { name: true } } }
    });

    if (!provider) return sendError(res, 'Provider not found', 404);

    return sendSuccess(res, 'Provider found', provider);
};

export const updateProviderStatus = async (req: AuthRequest, res: Response) => {
    const { isOnline } = req.body;
    const userId = req.user!.userId;

    // We find their provider profile by their UserID (auth token)
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) {
        return sendError(res, 'Provider profile not found for this user', 404);
    }

    const updated = await prisma.providerProfile.update({
        where: { id: provider.id },
        data: { isAvailable: isOnline }
    });

    return sendSuccess(res, 'Status updated successfully', { isOnline: updated.isAvailable });
};

// ==========================================
// PHASE 2: PROVIDER PROFILE & STATS APIs
// ==========================================

export const getProviderMe = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        include: { user: { select: { name: true, email: true, phone: true, createdAt: true } } }
    });

    if (!provider) return sendError(res, 'Provider not found', 404);
    return sendSuccess(res, 'Provider profile fetched', provider);
};

export const getProviderStats = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });

    if (!provider) return sendError(res, 'Provider profile missing', 404);

    const bookings = await prisma.booking.findMany({ where: { providerId: provider.id } });

    const totalJobs = bookings.length;
    const activeJobs = bookings.filter(b => b.status === 'PENDING' || b.status === 'ACCEPTED').length;
    const completedJobs = bookings.filter(b => b.status === 'COMPLETED').length;
    const cancelledJobs = bookings.filter(b => b.status === 'CANCELLED').length;

    const totalEarnings = bookings
        .filter(b => b.status === 'COMPLETED' && b.finalPrice != null)
        .reduce((sum, b) => sum + b.finalPrice!, 0);

    return sendSuccess(res, 'Provider stats computed', {
        totalJobs,
        activeJobs,
        completedJobs,
        cancelledJobs,
        totalEarnings,
        trustScore: 4.8, // Replace with aggregate Review score logic Phase 2
        experienceYears: provider.experienceYears
    });
};

export const getProviderEarningsGraph = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });

    if (!provider) return sendError(res, 'Provider not found', 404);

    const data = await prisma.$queryRaw`
        SELECT 
            DATE_TRUNC('month', "createdAt") as month,
            SUM("finalPrice") as earnings
        FROM "Booking"
        WHERE "providerId" = ${provider.id} AND status = 'COMPLETED'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
    `;

    const formatted = (data as any[]).map(row => ({
        month: row.month,
        earnings: row.earnings ? parseFloat(row.earnings) : 0
    }));

    return sendSuccess(res, 'Earnings graph generated', formatted);
};

export const getProviderReviews = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });

    if (!provider) return sendError(res, 'Provider not found', 404);

    const reviews = await prisma.review.findMany({
        where: { booking: { providerId: provider.id } },
        orderBy: { createdAt: 'desc' },
        include: { booking: { include: { user: { select: { name: true } } } } }
    });

    const mapped = reviews.map(r => ({
        id: r.id,
        reviewerName: r.booking.user.name,
        rating: r.rating,
        comment: r.comment,
        date: r.createdAt
    }));

    return sendSuccess(res, 'Provider reviews fetched', mapped);
};
