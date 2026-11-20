/**
 * Admin-Pflege für den Admin-View (nur für Admins):
 *   GET    /api/dashboard/admins          → (AdminEntry & {isSelf})[] (fixe + gepflegte)
 *   POST   /api/dashboard/admins {email}  → 201 angelegt | 200 existiert bereits
 *   DELETE /api/dashboard/admins/:email   → 204 | 404 | 400 (fix / man selbst)
 */
import { Router, type Request, type Response } from 'express';
import type { RequestHandler } from 'express';
import { z } from 'zod';
import { getPool } from '../db/index.js';
import { addAdmin, isFixedAdmin, listAdmins, normalizeEmail, removeAdmin } from '../services/admins.js';
import { asyncHandler, BadRequestError, DbUnavailableError, NotFoundError, parseBody } from '../utils/http.js';
import { requireDashboardAuth } from './dashboard.js';

export const adminBodySchema = z.object({
  email: z.string().trim().toLowerCase().max(320).email(),
});

function db() {
  const pool = getPool();
  if (!pool) throw new DbUnavailableError();
  return pool;
}

export function createAdminRoutes(opts: { limiter?: RequestHandler } = {}): Router {
  const router = Router();
  const limit: RequestHandler[] = opts.limiter ? [opts.limiter] : [];

  router.get(
    '/api/dashboard/admins',
    ...limit,
    requireDashboardAuth,
    asyncHandler(async (_req: Request, res: Response) => {
      const self = res.locals.adminEmail;
      res.json((await listAdmins(db())).map((a) => ({ ...a, isSelf: a.email === self })));
    }),
  );

  router.post(
    '/api/dashboard/admins',
    ...limit,
    requireDashboardAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const { email } = parseBody(adminBodySchema, req.body);
      const result = await addAdmin(db(), email, String(res.locals.adminEmail ?? ''));
      console.log(`Admin ${result === 'added' ? 'hinzugefügt' : 'existiert bereits'}: ${email} (durch ${res.locals.adminEmail})`);
      res.status(result === 'added' ? 201 : 200).json({ email, status: result });
    }),
  );

  router.delete(
    '/api/dashboard/admins/:email',
    ...limit,
    requireDashboardAuth,
    asyncHandler(async (req: Request, res: Response) => {
      const email = normalizeEmail(String(req.params.email ?? ''));
      if (isFixedAdmin(email)) {
        throw new BadRequestError('Fixed admins (owner / ADMIN_EMAILS) cannot be removed.');
      }
      if (email === res.locals.adminEmail) {
        throw new BadRequestError('You cannot remove yourself.');
      }
      if (!(await removeAdmin(db(), email))) {
        throw new NotFoundError('Admin not found');
      }
      console.log(`Admin entfernt: ${email} (durch ${res.locals.adminEmail})`);
      res.status(204).end();
    }),
  );

  return router;
}
