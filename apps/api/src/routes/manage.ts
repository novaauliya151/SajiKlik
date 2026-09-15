import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { db } from '../db.js';
import { roles, publicUser } from '../auth.js';
import { AppError, canManageRole } from '../domain.js';
import { pagination } from './orders.js';
export const manageRouter = Router();
manageRouter.get('/overview', roles('ADMIN', 'SUPERADMIN'), async (_req, res) => {
  const since = new Date();
  since.setHours(0, 0, 0, 0);
  const [orders, payments, activeOrders, lowStock, activity, cashiers] = await Promise.all([
    db.order.count({ where: { createdAt: { gte: since } } }),
    db.payment.aggregate({
      where: { status: 'PAID', paidAt: { gte: since } },
      _sum: { amount: true },
    }),
    db.order.count({ where: { status: { in: ['RECEIVED', 'PROCESSING', 'READY'] } } }),
    db.menu.count({ where: { isArchived: false, stock: { lte: 5 } } }),
    db.activityLog.groupBy({
      by: ['userId'],
      where: { createdAt: { gte: since }, action: { in: ['ORDER_STATUS', 'PAYMENT_PAID'] } },
      _count: { id: true },
    }),
    db.order.groupBy({
      by: ['cashierId'],
      where: { createdAt: { gte: since }, cashierId: { not: null } },
      _count: { id: true },
    }),
  ]);
  const users = await db.user.findMany({
    where: {
      id: {
        in: [...new Set([...activity.map((a) => a.userId), ...cashiers.map((c) => c.cashierId!)])],
      },
    },
    select: { id: true, name: true, role: true },
  });
  res.json({
    orders,
    income: payments._sum.amount ?? 0,
    activeOrders,
    lowStock,
    staff: users.map((u) => ({
      ...u,
      statusUpdates: activity.find((a) => a.userId === u.id)?._count.id ?? 0,
      manualOrders: cashiers.find((c) => c.cashierId === u.id)?._count.id ?? 0,
    })),
  });
});
const money = z.number().int().min(0).max(100000000);
const localImage = z
  .string()
  .regex(/^\/uploads\/[a-f0-9-]+\.(png|jpg|webp)$/)
  .nullable();
const menuSchema = z.object({
  name: z.string().trim().min(2).max(100),
  description: z.string().max(1000),
  price: money,
  categoryId: z.uuid(),
  imageUrl: localImage.optional(),
  stock: z.number().int().min(0).max(100000),
  isAvailable: z.boolean().default(true),
});
manageRouter.get('/categories', async (_req, res) =>
  res.json(await db.category.findMany({ orderBy: { name: 'asc' } })),
);
manageRouter.post('/categories', roles('ADMIN', 'SUPERADMIN'), async (req, res) =>
  res
    .status(201)
    .json(
      await db.category.create({
        data: z.object({ name: z.string().trim().min(2).max(60) }).parse(req.body),
      }),
    ),
);
manageRouter.get('/menus', async (req, res) => {
  const { page, limit } = pagination(req.query);
  const q = z.string().max(100).optional().parse(req.query.q);
  const categoryId = z.uuid().optional().parse(req.query.categoryId);
  const where = {
    isArchived: false,
    ...(req.query.manage === 'true' &&
    req.user &&
    !req.user.mustChangePassword &&
    ['ADMIN', 'SUPERADMIN'].includes(req.user.role)
      ? {}
      : { isAvailable: true }),
    ...(q ? { name: { contains: q, mode: 'insensitive' as const } } : {}),
    ...(categoryId ? { categoryId } : {}),
  };
  const [rows, total] = await Promise.all([
    db.menu.findMany({
      where,
      include: { category: true },
      orderBy: { createdAt: 'asc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.menu.count({ where }),
  ]);
  res.json({ rows, total, page, limit });
});
manageRouter.post('/menus', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const data = menuSchema.parse(req.body);
  const item = await db.$transaction(async (tx) => {
    const item = await tx.menu.create({ data });
    await tx.activityLog.create({
      data: { userId: req.user!.id, action: 'MENU_CREATE', description: data.name },
    });
    return item;
  });
  res.status(201).json(item);
});
manageRouter.patch('/menus/:id', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const data = menuSchema.partial().parse(req.body),
    id = z.uuid().parse(req.params.id);
  const item = await db.$transaction(async (tx) => {
    const item = await tx.menu.update({ where: { id }, data });
    await tx.activityLog.create({
      data: { userId: req.user!.id, action: 'MENU_UPDATE', description: item.name },
    });
    return item;
  });
  res.json(item);
});
manageRouter.delete('/menus/:id', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await db.$transaction(async (tx) => {
    const item = await tx.menu.update({
      where: { id },
      data: { isArchived: true, isAvailable: false },
    });
    await tx.activityLog.create({
      data: { userId: req.user!.id, action: 'MENU_ARCHIVE', description: item.name },
    });
  });
  res.json({ message: 'Menu diarsipkan.' });
});
manageRouter.get('/users', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { page, limit } = pagination(req.query);
  const where =
    req.user!.role === 'ADMIN'
      ? { role: { in: ['KASIR', 'CHEF', 'FINANCE'] as ('KASIR' | 'CHEF' | 'FINANCE')[] } }
      : {};
  const [rows, total] = await Promise.all([
    db.user.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.user.count({ where }),
  ]);
  res.json({ rows: rows.map(publicUser), total, page, limit });
});
const userSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.email().toLowerCase(),
  phone: z
    .string()
    .regex(/^\+?[0-9]{8,15}$/)
    .nullable()
    .optional(),
  role: z.enum(['PEMBELI', 'KASIR', 'CHEF', 'FINANCE', 'ADMIN', 'SUPERADMIN']),
});
manageRouter.post('/users', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const data = userSchema.parse(req.body);
  if (!canManageRole(req.user!.role, data.role))
    throw new AppError(403, 'Tidak dapat membuat role ini.');
  const temporaryPassword = `Saji${randomBytes(9).toString('base64url')}9!`;
  const user = await db.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        ...data,
        passwordHash: await bcrypt.hash(temporaryPassword, 12),
        mustChangePassword: true,
        ...(data.role === 'PEMBELI' ? { customer: { create: {} } } : {}),
      },
    });
    await tx.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'USER_CREATE',
        description: `${user.email} (${user.role})`,
      },
    });
    return user;
  });
  res.status(201).json({ user: publicUser(user), temporaryPassword });
});
manageRouter.patch('/users/:id', roles('ADMIN', 'SUPERADMIN'), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const data = userSchema
    .partial()
    .extend({ isActive: z.boolean().optional(), resetPassword: z.boolean().optional() })
    .parse(req.body);
  const target = await db.user.findUnique({ where: { id } });
  if (!target) throw new AppError(404, 'User tidak ditemukan.');
  if (id === req.user!.id)
    throw new AppError(400, 'Gunakan halaman profil untuk mengubah akun sendiri.');
  if (
    !canManageRole(req.user!.role, target.role) ||
    (data.role && !canManageRole(req.user!.role, data.role))
  )
    throw new AppError(403, 'Tidak dapat mengelola role ini.');
  // Keep superadmin accounts immutable from user management, avoiding removal of the final administrator.
  if (
    target.role === 'SUPERADMIN' &&
    (data.isActive === false || (data.role && data.role !== 'SUPERADMIN'))
  )
    throw new AppError(400, 'Superadmin tidak dapat dinonaktifkan atau diturunkan melalui panel.');
  const { resetPassword, ...profile } = data;
  const temporaryPassword = resetPassword
    ? `Saji${randomBytes(9).toString('base64url')}9!`
    : undefined;
  const user = await db.$transaction(async (tx) => {
    const user = await tx.user.update({
      where: { id },
      data: {
        ...profile,
        tokenVersion: { increment: 1 },
        ...(temporaryPassword
          ? { passwordHash: await bcrypt.hash(temporaryPassword, 12), mustChangePassword: true }
          : {}),
      },
    });
    if (data.role === 'PEMBELI')
      await tx.customer.upsert({ where: { userId: id }, create: { userId: id }, update: {} });
    await tx.refreshSession.deleteMany({ where: { userId: id } });
    await tx.activityLog.create({
      data: { userId: req.user!.id, action: 'USER_UPDATE', description: target.email },
    });
    return user;
  });
  res.json({ user: publicUser(user), temporaryPassword });
});
manageRouter.get('/settings', async (_req, res) =>
  res.json(await db.siteSetting.findUnique({ where: { id: 'main' } })),
);
manageRouter.patch('/settings', roles('SUPERADMIN'), async (req, res) => {
  const data = z
    .object({
      primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      secondaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/),
      storeName: z.string().trim().min(2).max(80),
      address: z.string().max(300),
      contact: z.string().max(100),
      openingHours: z.string().max(200),
      bankInfo: z.string().max(300),
      logoUrl: localImage.optional(),
      faviconUrl: localImage.optional(),
      iconUrl: localImage.optional(),
      qrisUrl: localImage.optional(),
    })
    .parse(req.body);
  const result = await db.$transaction(async (tx) => {
    const result = await tx.siteSetting.upsert({
      where: { id: 'main' },
      create: { id: 'main', ...data },
      update: data,
    });
    await tx.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'SETTINGS_UPDATE',
        description: 'Pengaturan toko diperbarui',
      },
    });
    return result;
  });
  res.json(result);
});
manageRouter.get('/logs', roles('SUPERADMIN'), async (req, res) => {
  const { page, limit } = pagination(req.query);
  const [rows, total] = await Promise.all([
    db.activityLog.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.activityLog.count(),
  ]);
  res.json({ rows, total, page, limit });
});
