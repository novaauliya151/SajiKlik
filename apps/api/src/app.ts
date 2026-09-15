import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { rateLimit } from 'express-rate-limit';
import multer from 'multer';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { optionalAuth, roles } from './auth.js';
import { AppError } from './domain.js';
import { db } from './db.js';
import { authRouter } from './routes/auth.js';
import { ordersRouter } from './routes/orders.js';
import { manageRouter } from './routes/manage.js';
import { financeRouter } from './routes/finance.js';
export function createApp() {
  const app = express();
  const allowedOrigins = (process.env.CLIENT_ORIGIN ?? 'http://localhost:5173,http://127.0.0.1:5173')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  const isAllowedOrigin = (origin: string | undefined) => {
    if (!origin) return true;
    return allowedOrigins.some((allowed) => {
      try {
        const a = new URL(allowed);
        const current = new URL(origin);
        return (
          a.protocol === current.protocol &&
          a.hostname === current.hostname &&
          a.port === current.port
        );
      } catch {
        return allowed === origin;
      }
    });
  };

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'same-site' } }));
  app.use(
    cors({
      origin: (origin, callback) => {
        if (!origin || isAllowedOrigin(origin)) return callback(null, true);
        callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '256kb' }), cookieParser());
  app.use(
    '/api',
    rateLimit({
      windowMs: 60000,
      limit: 240,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      message: { message: 'Terlalu banyak permintaan. Coba sebentar lagi.' },
    }),
  );
  app.use('/api', (req, _res, next) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      req.headers.origin &&
      !isAllowedOrigin(req.headers.origin)
    )
      return next(new AppError(403, 'Origin tidak diizinkan.'));
    next();
  });
  app.get('/api/health', async (_req, res) => {
    await db.$queryRaw`SELECT 1`;
    res.json({ status: 'ok' });
  });
  app.use('/api', optionalAuth);
  app.use('/api/auth', authRouter);
  app.use('/api/orders', ordersRouter);
  app.use('/api', manageRouter);
  app.use('/api/finance', financeRouter);
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 3 * 1024 * 1024, files: 1 },
  });
  app.post(
    '/api/uploads',
    roles('ADMIN', 'SUPERADMIN'),
    upload.single('file'),
    async (req, res) => {
      const f = req.file;
      if (!f) throw new AppError(400, 'Pilih gambar PNG, JPEG, atau WebP.');
      const b = f.buffer;
      const ext = b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        ? 'png'
        : b[0] === 255 && b[1] === 216 && b[2] === 255
          ? 'jpg'
          : b.toString('ascii', 0, 4) === 'RIFF' && b.toString('ascii', 8, 12) === 'WEBP'
            ? 'webp'
            : null;
      if (!ext)
        throw new AppError(400, 'Format gambar tidak didukung. Gunakan PNG, JPEG, atau WebP.');
      const filename = `${randomUUID()}.${ext}`;
      await mkdir('uploads', { recursive: true });
      await writeFile(path.join('uploads', filename), b);
      res.status(201).json({ url: `/uploads/${filename}` });
    },
  );
  app.use('/uploads', express.static(path.resolve('uploads'), { dotfiles: 'deny', maxAge: '7d' }));
  app.use('/api', (_req, _res, next) => next(new AppError(404, 'Endpoint tidak ditemukan.')));
  if (process.env.NODE_ENV === 'production') {
    const web = path.resolve('../web/dist');
    app.use(express.static(web));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(web, 'index.html')));
  }
  app.use(
    (err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      if (err instanceof ZodError)
        return res
          .status(400)
          .json({ message: err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') });
      if (err instanceof AppError) return res.status(err.status).json({ message: err.message });
      if (err instanceof multer.MulterError)
        return res.status(400).json({ message: 'Upload gagal. Batas gambar 3 MB.' });
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        if (err.code === 'P2002')
          return res
            .status(409)
            .json({
              message: 'Data sudah terdaftar (email, nomor HP, kategori, atau periode gaji).',
            });
        if (err.code === 'P2025') return res.status(404).json({ message: 'Data tidak ditemukan.' });
        if (['P2003', 'P2034'].includes(err.code))
          return res
            .status(409)
            .json({ message: 'Data terkait berubah atau tidak valid. Muat ulang dan coba lagi.' });
      }
      if (err instanceof SyntaxError)
        return res.status(400).json({ message: 'Format JSON tidak valid.' });
      console.error(err);
      res.status(500).json({ message: 'Terjadi kesalahan server. Silakan coba lagi.' });
    },
  );
  return app;
}
