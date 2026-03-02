import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

export const getServices = (req: Request, res: Response) => {
    const services = [
        { name: 'Plumber', icon: 'plumbing_rounded', color: 'primaryNeon', enumValue: 'PLUMBER' },
        { name: 'Electrician', icon: 'electrical_services_rounded', color: 'accentGlow', enumValue: 'ELECTRICIAN' },
        { name: 'Carpenter', icon: 'handyman_rounded', color: 'secondaryNeon', enumValue: 'CARPENTER' },
        { name: 'Other', icon: 'more_horiz_rounded', color: 'blueAccent', enumValue: 'AC_REPAIR' },
    ];
    return sendSuccess(res, 'Fetched services successfully', services);
};
