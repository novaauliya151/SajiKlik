import { Router } from 'express';
import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { db } from '../db.js';
import { hash, roles } from '../auth.js';
import { AppError, assertTransition, orderSchema, totalItems } from '../domain.js';
export const ordersRouter = Router();
const include = { items: true, payment: true };
export const pagination = (query: Record<string, unknown>) => ({
  page: z.coerce.number().int().min(1).max(100000).default(1).parse(query.page),
  limit: z.coerce.number().int().min(1).max(100).default(20).parse(query.limit),
});
const safeOrder = <T extends { trackingHash: string }>(o: T) => {
  const { trackingHash, ...safe } = o;
  return safe;
};
ordersRouter.post('/', async (req, res) => {
  if (
    req.user &&
    (req.user.mustChangePassword ||
      !['PEMBELI', 'KASIR', 'ADMIN', 'SUPERADMIN'].includes(req.user.role))
  )
    throw new AppError(403, 'Tidak memiliki akses membuat pesanan.');
  const data = orderSchema.parse(req.body);
  if (data.orderType === 'DINE_IN' && !data.tableNumber)
    throw new AppError(400, 'Nomor meja wajib untuk makan di tempat.');
  const trackingToken = randomBytes(32).toString('hex');
  const order = await db.$transaction(async (tx) => {
    const ids = [...new Set(data.items.map((i) => i.menuId))];
    const menus = await tx.menu.findMany({
      where: { id: { in: ids }, isAvailable: true, isArchived: false },
    });
    const items = data.items.map((i) => {
      const m = menus.find((m) => m.id === i.menuId);
      if (!m) throw new AppError(409, 'Ada menu yang tidak tersedia.');
      return { ...i, name: m.name, price: m.price, subtotal: m.price * i.qty };
    });
    for (const id of ids.sort()) {
      const qty = items.filter((i) => i.menuId === id).reduce((n, i) => n + i.qty, 0);
      const changed = await tx.menu.updateMany({
        where: { id, stock: { gte: qty }, isAvailable: true, isArchived: false },
        data: { stock: { decrement: qty } },
      });
      if (!changed.count)
        throw new AppError(409, `Stok ${menus.find((m) => m.id === id)?.name} tidak mencukupi.`);
    }
    const customer =
      req.user?.role === 'PEMBELI'
        ? await tx.customer.findUnique({ where: { userId: req.user.id } })
        : null;
    const totalPrice = totalItems(items);
    if (totalPrice > 1000000000)
      throw new AppError(400, 'Total pesanan melebihi batas Rp1.000.000.000.');
    return tx.order.create({
      data: {
        customerName: data.customerName,
        tableNumber: data.tableNumber,
        orderType: data.orderType,
        totalPrice,
        trackingHash: hash(trackingToken),
        customerId: customer?.id,
        cashierId:
          req.user && ['KASIR', 'ADMIN', 'SUPERADMIN'].includes(req.user.role) ? req.user.id : null,
        items: { create: items },
        payment: { create: { method: data.method, amount: totalPrice } },
      },
      include,
    });
  });
  req.app.get('io')?.to('staff').emit('orders:changed');
  res.status(201).json({ ...safeOrder(order), trackingToken });
});
ordersRouter.get('/mine', roles('PEMBELI'), async (req, res) => {
  const { page, limit } = pagination(req.query);
  const where = { customer: { userId: req.user!.id } };
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.order.count({ where }),
  ]);
  res.json({ rows: rows.map(safeOrder), total, page, limit });
});
ordersRouter.get('/', roles('KASIR', 'CHEF', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  const { page, limit } = pagination(req.query);
  const status = z
    .enum(['RECEIVED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'])
    .optional()
    .parse(req.query.status);
  const where: Prisma.OrderWhereInput =
    req.user!.role === 'CHEF'
      ? { status: { in: ['RECEIVED', 'PROCESSING'] } }
      : status
        ? { status }
        : {};
  const [rows, total] = await Promise.all([
    db.order.findMany({
      where,
      include,
      orderBy: { createdAt: req.user!.role === 'CHEF' ? 'asc' : 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.order.count({ where }),
  ]);
  res.json({
    rows: rows.map((o) =>
      req.user!.role === 'CHEF'
        ? {
            id: o.id,
            number: o.number,
            tableNumber: o.tableNumber,
            status: o.status,
            createdAt: o.createdAt,
            items: o.items.map(({ name, qty, note }) => ({ name, qty, note })),
          }
        : safeOrder(o),
    ),
    total,
    page,
    limit,
  });
});
ordersRouter.get('/:id', async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  const order = await db.order.findUnique({
    where: { id },
    include: { ...include, customer: true },
  });
  const token = req.headers['x-order-token'];
  if (
    !order ||
    (!(typeof token === 'string' && hash(token) === order.trackingHash) &&
      !(
        req.user &&
        !req.user.mustChangePassword &&
        (['KASIR', 'ADMIN', 'SUPERADMIN'].includes(req.user.role) ||
          order.customer?.userId === req.user.id)
      ))
  )
    throw new AppError(404, 'Pesanan tidak ditemukan atau tautan akses tidak valid.');
  const { customer, ...data } = order;
  res.json(safeOrder(data));
});
ordersRouter.patch(
  '/:id/status',
  roles('CHEF', 'KASIR', 'ADMIN', 'SUPERADMIN'),
  async (req, res) => {
    const id = z.uuid().parse(req.params.id);
    const { status } = z
      .object({ status: z.enum(['PROCESSING', 'READY', 'COMPLETED', 'CANCELLED']) })
      .parse(req.body);
    await db.$transaction(async (tx) => {
      const o = await tx.order.findUnique({ where: { id }, include });
      if (!o) throw new AppError(404, 'Pesanan tidak ditemukan.');
      assertTransition(req.user!.role, o.status, status, o.payment?.status === 'PAID');
      const updated = await tx.order.updateMany({
        where: { id, status: o.status },
        data: { status },
      });
      if (!updated.count) throw new AppError(409, 'Pesanan sudah berubah. Muat ulang.');
      if (status === 'CANCELLED') {
        for (const i of [...o.items].sort((a, b) => a.menuId.localeCompare(b.menuId)))
          await tx.menu.update({ where: { id: i.menuId }, data: { stock: { increment: i.qty } } });
        // Paid orders cannot be cancelled until a real refund is handled outside the system.
        const payment = await tx.payment.findUnique({ where: { orderId: id } });
        if (payment?.status === 'PAID')
          throw new AppError(
            409,
            'Pesanan sudah dibayar. Pembatalan dengan pengembalian dana belum didukung.',
          );
      }
      if (status === 'COMPLETED' && o.customerId)
        await tx.customer.update({
          where: { id: o.customerId },
          data: { loyaltyPoints: { increment: Math.floor(o.totalPrice / 10000) } },
        });
      await tx.activityLog.create({
        data: {
          userId: req.user!.id,
          action: 'ORDER_STATUS',
          description: `Pesanan #${o.number}: ${o.status} → ${status}`,
        },
      });
    });
    req.app.get('io')?.to('staff').emit('orders:changed');
    res.json({ message: 'Status diperbarui.' });
  },
);
ordersRouter.patch('/:id/payment', roles('KASIR', 'ADMIN', 'SUPERADMIN'), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await db.$transaction(async (tx) => {
    // A conditional order update locks the row, serializing payment with cancellation.
    const locked = await tx.order.updateMany({
      where: { id, status: { not: 'CANCELLED' } },
      data: { updatedAt: new Date() },
    });
    if (!locked.count) throw new AppError(409, 'Pesanan tidak ditemukan atau dibatalkan.');
    const changed = await tx.payment.updateMany({
      where: { orderId: id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (!changed.count) throw new AppError(409, 'Pembayaran sudah dikonfirmasi.');
    await tx.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'PAYMENT_PAID',
        description: `Konfirmasi pembayaran pesanan ${id}`,
      },
    });
  });
  req.app.get('io')?.to('staff').emit('orders:changed');
  res.json({ message: 'Pembayaran dikonfirmasi.' });
});
