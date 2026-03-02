import { Request, Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';
import { ServiceType } from '@prisma/client';

// ─── Haversine distance (km) ──────────────────────────────────────────────────
function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
        Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── GET /providers?service=PLUMBER&lat=28.6&lng=77.2&radius=20 ──────────────
export const getProviders = async (req: Request, res: Response) => {
    const { service, lat, lng, radius } = req.query;
    const userLat = lat ? parseFloat(lat as string) : null;
    const userLng = lng ? parseFloat(lng as string) : null;
    const radiusKm = radius ? parseFloat(radius as string) : 20;

    const whereClause: any = { isOnline: true };
    if (typeof service === 'string') {
        const enumService = service.toUpperCase().replace(/ /g, '_');
        if (Object.values(ServiceType).includes(enumService as ServiceType)) {
            whereClause.serviceType = enumService as ServiceType;
        }
    }

    const providers = await prisma.providerProfile.findMany({
        where: whereClause,
        include: {
            user: { select: { name: true, email: true } },
            bookings: {
                where: { status: 'COMPLETED' },
                include: { reviews: { select: { rating: true } } }
            }
        }
    });

    // Filter by distance + compute live stats
    const mapped = providers
        .map(p => {
            let distanceKm: number | null = null;
            if (userLat !== null && userLng !== null && p.latitude != null && p.longitude != null) {
                distanceKm = haversineKm(userLat, userLng, p.latitude, p.longitude);
            }

            // Compute real avgRating from reviews
            const allReviews = p.bookings.flatMap(b => b.reviews);
            const avgRating = allReviews.length > 0
                ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length
                : 0;

            return {
                id: p.id,
                userId: p.userId,
                name: p.user.name,
                serviceType: p.serviceType,
                customServiceType: p.customServiceType ?? null,
                experienceYears: p.experienceYears,
                bio: p.bio ?? null,
                hourlyRate: p.hourlyRate ?? null,
                city: p.city ?? null,
                isOnline: p.isOnline,
                avgRating: Math.round(avgRating * 10) / 10,
                reviewCount: allReviews.length,
                completedJobs: p.bookings.length,
                distanceKm,
                distanceLabel: distanceKm !== null ? `${distanceKm.toFixed(1)} km away` : 'Nearby',
            };
        })
        .filter(p => {
            // If user supplied coords, filter by radius
            if (userLat !== null && userLng !== null && p.distanceKm !== null) {
                return p.distanceKm <= radiusKm;
            }
            return true; // No coords → show all online
        })
        .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999));

    return sendSuccess(res, 'Fetched providers', mapped);
};

// ─── GET /providers/:id/public ────────────────────────────────────────────────
export const getPublicProviderProfile = async (req: Request, res: Response) => {
    const { id } = req.params;

    const provider = await prisma.providerProfile.findUnique({
        where: { id },
        include: {
            user: { select: { name: true } },
            certifications: true,
            bookings: {
                where: { status: 'COMPLETED' },
                include: {
                    reviews: {
                        include: { booking: { include: { user: { select: { name: true } } } } }
                    }
                }
            }
        }
    });

    if (!provider) return sendError(res, 'Provider not found', 404);

    const allReviews = provider.bookings.flatMap(b =>
        b.reviews.map(r => ({
            id: r.id,
            reviewerName: (r.booking as any).user?.name ?? 'Anonymous',
            rating: r.rating,
            comment: r.comment,
            date: r.createdAt
        }))
    );
    const avgRating = allReviews.length > 0
        ? allReviews.reduce((s, r) => s + r.rating, 0) / allReviews.length
        : 0;

    return sendSuccess(res, 'Public provider profile', {
        id: provider.id,
        name: provider.user.name,
        bio: provider.bio ?? null,
        serviceType: provider.serviceType,
        customServiceType: provider.customServiceType ?? null,
        experienceYears: provider.experienceYears,
        hourlyRate: provider.hourlyRate ?? null,
        city: provider.city ?? null,
        isOnline: provider.isOnline,
        avgRating: Math.round(avgRating * 10) / 10,
        reviewCount: allReviews.length,
        completedJobs: provider.bookings.length,
        certifications: provider.certifications,
        recentReviews: allReviews.slice(0, 10),
    });
};

// ─── GET /providers/:id ───────────────────────────────────────────────────────
export const getProviderById = async (req: Request, res: Response) => {
    const { id } = req.params;
    const provider = await prisma.providerProfile.findUnique({
        where: { id },
        include: { user: { select: { name: true } } }
    });
    if (!provider) return sendError(res, 'Provider not found', 404);
    return sendSuccess(res, 'Provider found', provider);
};

// ─── PATCH /providers/status ─────────────────────────────────────────────────
export const updateProviderStatus = async (req: AuthRequest, res: Response) => {
    const { isOnline, latitude, longitude } = req.body;
    const userId = req.user!.userId;

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider profile not found', 404);

    const data: any = { isOnline: !!isOnline };
    if (isOnline && latitude != null && longitude != null) {
        data.latitude = parseFloat(latitude);
        data.longitude = parseFloat(longitude);
    }

    const updated = await prisma.providerProfile.update({
        where: { id: provider.id },
        data
    });

    return sendSuccess(res, 'Status updated', { isOnline: updated.isOnline });
};

// ─── GET /providers/me ────────────────────────────────────────────────────────
export const getProviderMe = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({
        where: { userId },
        include: { user: { select: { name: true, email: true, phone: true, createdAt: true } } }
    });
    if (!provider) return sendError(res, 'Provider not found', 404);
    return sendSuccess(res, 'Provider profile fetched', provider);
};

// ─── GET /providers/stats ─────────────────────────────────────────────────────
export const getProviderStats = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider profile missing', 404);

    const bookings = await prisma.booking.findMany({ where: { providerId: provider.id } });
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED');
    const totalEarnings = completedBookings.reduce((s, b) => s + (b.finalPrice ?? 0), 0);

    const reviews = await prisma.review.findMany({
        where: { booking: { providerId: provider.id } }
    });
    const avgRating = reviews.length > 0
        ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
        : 0;

    return sendSuccess(res, 'Provider stats', {
        totalJobs: bookings.length,
        activeJobs: bookings.filter(b => b.status === 'PENDING' || b.status === 'ACCEPTED').length,
        completedJobs: completedBookings.length,
        cancelledJobs: bookings.filter(b => b.status === 'CANCELLED').length,
        totalEarnings,
        trustScore: Math.round(avgRating * 10) / 10,
        experienceYears: provider.experienceYears,
        hourlyRate: provider.hourlyRate,
        isOnline: provider.isOnline,
    });
};

// ─── GET /providers/earnings-graph ───────────────────────────────────────────
export const getProviderEarningsGraph = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider not found', 404);

    const data = await prisma.$queryRaw`
        SELECT DATE_TRUNC('month', "createdAt") as month, SUM("finalPrice") as earnings
        FROM "Booking"
        WHERE "providerId" = ${provider.id} AND status = 'COMPLETED'
        GROUP BY DATE_TRUNC('month', "createdAt")
        ORDER BY month ASC
    `;
    const formatted = (data as any[]).map(row => ({
        month: row.month,
        earnings: row.earnings ? parseFloat(row.earnings) : 0
    }));
    return sendSuccess(res, 'Earnings graph', formatted);
};

// ─── GET /providers/reviews ───────────────────────────────────────────────────
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
    return sendSuccess(res, 'Provider reviews', mapped);
};

// ─── PATCH /providers/me ─────────────────────────────────────────────────────
export const updateProviderProfile = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { bio, experienceYears, hourlyRate, city } = req.body;

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider not found', 404);

    const updated = await prisma.providerProfile.update({
        where: { id: provider.id },
        data: {
            ...(bio !== undefined && { bio }),
            ...(experienceYears !== undefined && { experienceYears: Number(experienceYears) }),
            ...(hourlyRate !== undefined && { hourlyRate: Number(hourlyRate) }),
            ...(city !== undefined && { city }),
        }
    });
    return sendSuccess(res, 'Profile updated', updated);
};

// ─── POST /providers/me/certifications ───────────────────────────────────────
export const addCertification = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { name, issuingBody, yearObtained } = req.body;
    if (!name) return sendError(res, 'Certification name is required', 400);

    const provider = await prisma.providerProfile.findUnique({ where: { userId } });
    if (!provider) return sendError(res, 'Provider not found', 404);

    const cert = await (prisma as any).certification.create({
        data: {
            name,
            issuingBody: issuingBody || null,
            yearObtained: yearObtained ? Number(yearObtained) : null,
            providerId: provider.id,
        }
    });
    return sendSuccess(res, 'Certification added', cert);
};
