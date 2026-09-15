import { z } from 'zod';
export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}
export const staff = ['KASIR', 'CHEF', 'FINANCE', 'ADMIN', 'SUPERADMIN'];
export function canManageRole(actor: string, target: string) {
  return (
    actor === 'SUPERADMIN' || (actor === 'ADMIN' && ['KASIR', 'CHEF', 'FINANCE'].includes(target))
  );
}
export function assertTransition(role: string, from: string, to: string, paid: boolean) {
  const normal: Record<string, string[]> = {
    RECEIVED: ['PROCESSING'],
    PROCESSING: ['READY'],
    READY: ['COMPLETED'],
    COMPLETED: [],
    CANCELLED: [],
  };
  if (
    to === 'CANCELLED' &&
    ['ADMIN', 'SUPERADMIN'].includes(role) &&
    !['COMPLETED', 'CANCELLED'].includes(from)
  )
    return;
  if (!normal[from]?.includes(to))
    throw new AppError(409, 'Perubahan status tidak valid. Muat ulang pesanan.');
  if (role === 'CHEF' && !['PROCESSING', 'READY'].includes(to))
    throw new AppError(403, 'Akses dapur hanya untuk proses memasak.');
  if (role === 'KASIR' && to !== 'COMPLETED')
    throw new AppError(403, 'Status memasak dikelola oleh dapur.');
  if (!['CHEF', 'KASIR', 'ADMIN', 'SUPERADMIN'].includes(role))
    throw new AppError(403, 'Tidak memiliki akses.');
  if (to === 'COMPLETED' && !paid)
    throw new AppError(409, 'Pembayaran harus dikonfirmasi terlebih dahulu.');
}
export const orderSchema = z.object({
  customerName: z.string().trim().min(2).max(100),
  tableNumber: z.string().trim().max(20).optional(),
  orderType: z.enum(['DINE_IN', 'TAKEAWAY']),
  method: z.enum(['CASH', 'QRIS', 'TRANSFER']),
  items: z
    .array(
      z.object({
        menuId: z.string().uuid(),
        qty: z.number().int().min(1).max(99),
        note: z.string().max(300).optional(),
      }),
    )
    .min(1)
    .max(50),
});
export function totalItems(items: { price: number; qty: number }[]) {
  return items.reduce((n, i) => n + i.price * i.qty, 0);
}
export const passwordSchema = z
  .string()
  .min(10)
  .max(100)
  .regex(/[a-zA-Z]/, 'Password harus memuat huruf.')
  .regex(/[0-9]/, 'Password harus memuat angka.');
