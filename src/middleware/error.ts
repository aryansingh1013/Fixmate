import { Request, Response, NextFunction } from 'express';
import { sendError } from '../utils/response';

export const globalErrorHandler = (
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.error('[Error]', err);

    const statusCode = err.statusCode || 500;
    const message = err.message || 'Internal Server Error';

    return sendError(res, message, statusCode, process.env.NODE_ENV === 'development' ? err : null);
};
