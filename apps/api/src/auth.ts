import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { createHash, randomBytes } from 'node:crypto';
import { db } from './db.js';
import { AppError } from './domain.js';
import type { User } from '@prisma/client';
declare global {
  namespace Express {
    interface Request {
      user?: User;
    }
  }
}
export const hash = (value: string) => createHash('sha256').update(value).digest('hex');
export function secret() {
  const s = process.env.JWT_SECRET;
  if (!s || s.length < 32 || s.startsWith('replace-'))
    throw new Error('JWT_SECRET harus diisi dengan nilai acak minimal 32 karakter.');
  return s;
}
export const publicUser = (u: User) => ({
  id: u.id,
  name: u.name,
  email: u.email,
  phone: u.phone,
  role: u.role,
  mustChangePassword: u.mustChangePassword,
  isActive: u.isActive,
});
export const cookieOptions = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  path: '/api/auth',
};
export async function issueSession(user: User, res: Response) {
  const token = randomBytes(48).toString('hex');
  await db.refreshSession.create({
    data: {
      userId: user.id,
      tokenHash: hash(token),
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  res.cookie('refresh', token, { ...cookieOptions, maxAge: 7 * 86400000 });
  const accessToken = jwt.sign({ sub: user.id, version: user.tokenVersion }, secret(), {
    expiresIn: '15m',
    issuer: 'sajiklik',
    audience: 'sajiklik-web',
  });
  return { accessToken, user: publicUser(user) };
}
export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (header) {
      if (!header.startsWith('Bearer ')) throw new AppError(401, 'Sesi tidak valid.');
      let payload: jwt.JwtPayload;
      try {
        payload = jwt.verify(header.slice(7), secret(), {
          issuer: 'sajiklik',
          audience: 'sajiklik-web',
        }) as jwt.JwtPayload;
      } catch {
        throw new AppError(401, 'Sesi berakhir. Silakan masuk kembali.');
      }
      const user = await db.user.findUnique({ where: { id: payload.sub } });
      if (!user?.isActive || payload.version !== user.tokenVersion)
        throw new AppError(401, 'Sesi tidak berlaku.');
      req.user = user;
    }
    next();
  } catch (e) {
    next(e);
  }
}
export function requireAuth(req: Request, _res: Response, next: NextFunction) {
  if (!req.user) return next(new AppError(401, 'Silakan masuk terlebih dahulu.'));
  next();
}
export function roles(...allowed: string[]) {
  return (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(new AppError(401, 'Silakan masuk terlebih dahulu.'));
    if (req.user.mustChangePassword)
      return next(new AppError(403, 'Ganti password sementara terlebih dahulu.'));
    if (!allowed.includes(req.user.role))
      return next(new AppError(403, 'Anda tidak memiliki akses ke fitur ini.'));
    next();
  };
}
