import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export const analyzeImage = async (req: Request, res: Response) => {
    // Simulate 2s processing delay for camera UI
    await new Promise((resolve) => setTimeout(resolve, 2000));

    const mockResult = {
        issue: "Leaking pipe under sink",
        confidence: 0.92,
        recommendedService: "Plumber",
        urgency: "High"
    };

    return sendSuccess(res, 'Analysis complete', mockResult);
};
