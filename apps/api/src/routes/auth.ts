import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { cookieOptions, hash, issueSession, publicUser, requireAuth } from '../auth.js';
import { AppError, passwordSchema } from '../domain.js';
export const authRouter = Router();
authRouter.use(
  rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 40,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { message: 'Terlalu banyak percobaan. Coba lagi dalam 15 menit.' },
  }),
);
authRouter.post('/register', async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      email: z.email().toLowerCase(),
      phone: z
        .string()
        .regex(/^\+?[0-9]{8,15}$/)
        .optional(),
      password: passwordSchema,
    })
    .parse(req.body);
  const { password, ...profile } = data;
  const user = await db.user.create({
    data: { ...profile, passwordHash: await bcrypt.hash(password, 12), customer: { create: {} } },
  });
  res.status(201).json(await issueSession(user, res));
});
authRouter.post('/login', async (req, res) => {
  const { identity, password } = z
    .object({ identity: z.string().trim().min(1), password: z.string().max(100) })
    .parse(req.body);
  const user = await db.user.findFirst({
    where: { OR: [{ email: identity.toLowerCase() }, { phone: identity }] },
  });
  if (!user?.isActive || !(await bcrypt.compare(password, user.passwordHash)))
    throw new AppError(401, 'Email/nomor HP atau password salah.');
  res.json(await issueSession(user, res));
});
authRouter.post('/refresh', async (req, res) => {
  const token = req.cookies.refresh;
  if (typeof token !== 'string') throw new AppError(401, 'Silakan masuk.');
  const session = await db.refreshSession.findUnique({
    where: { tokenHash: hash(token) },
    include: { user: true },
  });
  if (!session || session.expiresAt < new Date() || !session.user.isActive)
    throw new AppError(401, 'Sesi berakhir.');
  const consumed = await db.refreshSession.deleteMany({ where: { id: session.id } });
  if (!consumed.count) throw new AppError(401, 'Sesi telah digunakan.');
  res.json(await issueSession(session.user, res));
});
authRouter.post('/logout', async (req, res) => {
  if (typeof req.cookies.refresh === 'string')
    await db.refreshSession.deleteMany({ where: { tokenHash: hash(req.cookies.refresh) } });
  res.clearCookie('refresh', cookieOptions).json({ message: 'Berhasil keluar.' });
});
authRouter.get('/me', requireAuth, async (req, res) => {
  const customer = await db.customer.findUnique({ where: { userId: req.user!.id } });
  res.json({ ...publicUser(req.user!), loyaltyPoints: customer?.loyaltyPoints ?? 0 });
});
authRouter.patch('/profile', requireAuth, async (req, res) => {
  const data = z
    .object({
      name: z.string().trim().min(2).max(100),
      phone: z
        .string()
        .regex(/^\+?[0-9]{8,15}$/)
        .nullable(),
    })
    .parse(req.body);
  res.json(publicUser(await db.user.update({ where: { id: req.user!.id }, data })));
});
authRouter.post('/password', requireAuth, async (req, res) => {
  const { currentPassword, password } = z
    .object({ currentPassword: z.string(), password: passwordSchema })
    .parse(req.body);
  if (!(await bcrypt.compare(currentPassword, req.user!.passwordHash)))
    throw new AppError(400, 'Password lama tidak cocok.');
  if (currentPassword === password) throw new AppError(400, 'Gunakan password baru yang berbeda.');
  const user = await db.$transaction(async (tx) => {
    await tx.refreshSession.deleteMany({ where: { userId: req.user!.id } });
    return tx.user.update({
      where: { id: req.user!.id },
      data: {
        passwordHash: await bcrypt.hash(password, 12),
        mustChangePassword: false,
        tokenVersion: { increment: 1 },
      },
    });
  });
  res.json(await issueSession(user, res));
});
