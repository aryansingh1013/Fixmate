import { Request, Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import prisma from '../prisma';
import { sendSuccess, sendError } from '../utils/response';

const JWT_SECRET = process.env.JWT_SECRET || 'fallback_secret_for_dev_only';

export const register = async (req: Request, res: Response) => {
    const { email, password, name, role } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
        return sendError(res, 'Email already in use', 400);
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    // If role isn't provided or is invalid, default to USER
    const userRole = role === 'PROVIDER' ? 'PROVIDER' : 'USER';

    const user = await prisma.user.create({
        data: {
            email,
            name,
            password: hashedPassword,
            role: userRole,
        }
    });

    // If registering as a provider, create their empty profile
    if (userRole === 'PROVIDER') {
        // We default to PLUMBER and 1 exp just to fill constraints, can be updated later
        await prisma.providerProfile.create({
            data: {
                userId: user.id,
                serviceType: 'PLUMBER',
                experienceYears: 1,
            }
        });
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return sendSuccess(res, 'Registration successful', {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
    }, 201);
};

export const login = async (req: Request, res: Response) => {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
        return sendError(res, 'Invalid credentials', 401);
    }

    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
        return sendError(res, 'Invalid credentials', 401);
    }

    const token = jwt.sign({ userId: user.id, email: user.email, role: user.role }, JWT_SECRET, { expiresIn: '7d' });

    return sendSuccess(res, 'Login successful', {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role }
    });
};
