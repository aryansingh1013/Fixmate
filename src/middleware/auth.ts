import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { sendError } from '../utils/response';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

export interface AuthRequest extends Request {
    user?: {
        userId: string;
        email: string;
        role: string;
    };
}

export const verifyToken = (req: AuthRequest, res: Response, next: NextFunction) => {
    const token = req.headers.authorization?.split(' ')[1];

    if (!token) {
        return sendError(res, 'Access Denied: No Token Provided', 401);
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as any;
        req.user = decoded;
        next();
    } catch (error) {
        return sendError(res, 'Invalid or Expired Token', 403);
    }
};

export const requireUser = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'USER') {
        return sendError(res, 'Unauthorized: Requires USER role', 403);
    }
    next();
};

export const requireProvider = (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user || req.user.role !== 'PROVIDER') {
        return sendError(res, 'Unauthorized: Requires PROVIDER role', 403);
    }
    next();
};
