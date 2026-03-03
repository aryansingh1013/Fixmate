import { Router } from 'express';
import { getVersion } from '../controllers/versionController';

const router = Router();

// Public — no auth needed
router.get('/', getVersion);

export default router;
