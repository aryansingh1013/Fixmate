import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

export const getMe = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, name: true, email: true, phone: true, role: true, createdAt: true }
    });

    if (!user) return sendError(res, 'User not found', 404);
    return sendSuccess(res, 'User profile fetched', user);
};

export const getUserBookings = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const bookings = await prisma.booking.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        include: { provider: { include: { user: true } } }
    });

    const mapped = bookings.map(b => ({
        id: b.id,
        providerName: b.provider.user.name,
        service: b.provider.serviceType,
        status: b.status,
        finalPrice: b.finalPrice,
        createdAt: b.createdAt
    }));

    return sendSuccess(res, 'User bookings fetched', mapped);
};

export const getUserStats = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    const bookings = await prisma.booking.findMany({ where: { userId } });

    const totalBookings = bookings.length;
    const activeBookings = bookings.filter(b => b.status === 'PENDING' || b.status === 'ACCEPTED').length;
    const completedBookings = bookings.filter(b => b.status === 'COMPLETED').length;
    const cancelledBookings = bookings.filter(b => b.status === 'CANCELLED').length;

    const totalMoneySpent = bookings
        .filter(b => b.status === 'COMPLETED' && b.finalPrice != null)
        .reduce((sum, b) => sum + b.finalPrice!, 0);

    // Group by service type manually since it's on the provider
    const serviceBreakdown: Record<string, number> = {};
    const populatedBookings = await prisma.booking.findMany({
        where: { userId, status: 'COMPLETED' },
        include: { provider: true }
    });

    for (const b of populatedBookings) {
        serviceBreakdown[b.provider.serviceType] = (serviceBreakdown[b.provider.serviceType] || 0) + 1;
    }

    return sendSuccess(res, 'User stats computed', {
        totalBookings,
        activeBookings,
        completedBookings,
        cancelledBookings,
        totalMoneySpent,
        serviceCategoryBreakdown: serviceBreakdown
    });
};

export const getUserSpendingGraph = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;

    // Utilize raw SQL for DATE_TRUNC grouping to extract monthly spending trends
    const data = await prisma.$queryRaw`
    SELECT 
      DATE_TRUNC('month', "createdAt") as month,
      SUM("finalPrice") as total_spent
    FROM "Booking"
    WHERE "userId" = ${userId} AND status = 'COMPLETED'
    GROUP BY DATE_TRUNC('month', "createdAt")
    ORDER BY month ASC
  `;

    // Prisma raw queries return BigInt for COUNT/SUM sometimes, map to string/float
    const formatted = (data as any[]).map(row => ({
        month: row.month,
        total_spent: row.total_spent ? parseFloat(row.total_spent) : 0
    }));

    return sendSuccess(res, 'Spending graph data generated', formatted);
};
