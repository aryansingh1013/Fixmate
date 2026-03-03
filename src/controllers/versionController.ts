import { Request, Response } from 'express';
import { sendSuccess } from '../utils/response';

// ─── App Version Config ───────────────────────────────────────────────────────
// Update these two values every time you cut a new release:
//   1. Bump APP_VERSION (matches pubspec.yaml version: X.Y.Z)
//   2. Update APK_URL to point to the new GitHub Release asset
const APP_VERSION = '1.0.1';
const APK_URL =
    'https://github.com/aryansingh1013/Fixmate/releases/download/v1.0.1/fixmate.apk';

// ─── GET /api/version ─────────────────────────────────────────────────────────
export const getVersion = (_req: Request, res: Response) => {
    return sendSuccess(res, 'Version info', {
        latestVersion: APP_VERSION,
        apkUrl: APK_URL,
        forceUpdate: false,   // set true to block old versions from using the app
        releaseNotes: 'Bug fixes and booking system improvements.',
    });
};
