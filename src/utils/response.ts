import { Response } from 'express';

export const sendSuccess = (
    res: Response,
    message: string,
    data: any = null,
    statusCode: number = 200
) => {
    return res.status(statusCode).json({
        success: true,
        message,
        data,
    });
};

export const sendError = (
    res: Response,
    message: string,
    statusCode: number = 500,
    errorDetails: any = null
) => {
    return res.status(statusCode).json({
        success: false,
        message,
        error: errorDetails,
    });
};
