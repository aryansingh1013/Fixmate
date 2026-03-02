import { Response } from 'express';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';
import { AuthRequest } from '../middleware/auth';

export const getNotifications = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const notifs = await prisma.notification.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
        take: 50,
    });
    return sendSuccess(res, 'Notifications fetched', notifs);
};

export const markNotificationRead = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    const { id } = req.params;
    const notif = await prisma.notification.findUnique({ where: { id } });
    if (!notif || notif.userId !== userId) return sendError(res, 'Not found', 404);
    await prisma.notification.update({ where: { id }, data: { isRead: true } });
    return sendSuccess(res, 'Marked as read');
};

export const markAllRead = async (req: AuthRequest, res: Response) => {
    const userId = req.user!.userId;
    await prisma.notification.updateMany({
        where: { userId, isRead: false },
        data: { isRead: true },
    });
    return sendSuccess(res, 'All marked as read');
};

// Helper: create a notification for a user
export const createNotification = async (
    userId: string,
    title: string,
    body: string,
) => {
    try {
        await prisma.notification.create({ data: { userId, title, body } });
    } catch {
        // non-fatal
    }
};
