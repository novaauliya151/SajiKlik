import { Router } from 'express';
import { z } from 'zod';
import ExcelJS from 'exceljs';
import PDFDocument from 'pdfkit';
import { db } from '../db.js';
import { roles } from '../auth.js';
import { AppError } from '../domain.js';
import { pagination } from './orders.js';
export const financeRouter = Router();
financeRouter.use(roles('FINANCE', 'ADMIN', 'SUPERADMIN'));
function range(query: Record<string, unknown>) {
  const month = z
    .string()
    .regex(/^\d{4}-(0[1-9]|1[0-2])$/)
    .default(new Date().toISOString().slice(0, 7))
    .parse(query.month);
  const from = new Date(`${month}-01T00:00:00.000Z`),
    to = new Date(from);
  to.setUTCMonth(to.getUTCMonth() + 1);
  return { gte: from, lt: to };
}
async function report(query: Record<string, unknown>) {
  const dates = range(query);
  const [payments, entries, salaries] = await Promise.all([
    db.payment.findMany({
      where: { status: 'PAID', paidAt: dates },
      include: { order: { select: { number: true } } },
      orderBy: { paidAt: 'asc' },
    }),
    db.financeEntry.findMany({ where: { date: dates }, orderBy: { date: 'asc' } }),
    db.salary.findMany({
      where: { status: 'PAID', paidAt: dates },
      include: { user: { select: { name: true } } },
    }),
  ]);
  const rows = [
    ...payments.map((p) => ({
      id: p.id,
      date: p.paidAt!,
      type: 'INCOME',
      description: `Pesanan #${p.order.number}`,
      amount: p.amount,
    })),
    ...entries.map((e) => ({
      id: e.id,
      date: e.date,
      type: e.type,
      description: e.description,
      amount: e.amount,
    })),
    ...salaries.map((s) => ({
      id: s.id,
      date: s.paidAt!,
      type: 'EXPENSE',
      description: `Gaji ${s.user.name} — ${s.period}`,
      amount: s.amount,
    })),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  const income = rows.filter((r) => r.type === 'INCOME').reduce((n, r) => n + r.amount, 0),
    expense = rows.filter((r) => r.type === 'EXPENSE').reduce((n, r) => n + r.amount, 0);
  return { income, expense, net: income - expense, transactions: payments.length, rows };
}
financeRouter.get('/summary', async (req, res) => {
  const data = await report(req.query);
  const { page, limit } = pagination(req.query);
  const daily = Array.from({ length: 31 }, (_, i) => ({ day: i + 1, income: 0, expense: 0 }));
  for (const r of data.rows)
    daily[r.date.getUTCDate() - 1][r.type === 'INCOME' ? 'income' : 'expense'] += r.amount;
  res.json({
    ...data,
    rows: data.rows.slice((page - 1) * limit, page * limit),
    total: data.rows.length,
    page,
    limit,
    daily,
  });
});
financeRouter.post('/entries', roles('FINANCE', 'SUPERADMIN'), async (req, res) => {
  const data = z
    .object({
      type: z.enum(['INCOME', 'EXPENSE']),
      amount: z.number().int().positive().max(100000000),
      description: z.string().trim().min(3).max(300),
      date: z.iso.datetime(),
    })
    .parse(req.body);
  const entry = await db.$transaction(async (tx) => {
    const entry = await tx.financeEntry.create({ data: { ...data, createdBy: req.user!.id } });
    await tx.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'FINANCE_ENTRY',
        description: `${data.type}: ${data.description} (${data.amount})`,
      },
    });
    return entry;
  });
  res.status(201).json(entry);
});
financeRouter.get('/employees', roles('FINANCE', 'SUPERADMIN'), async (_req, res) =>
  res.json(
    await db.user.findMany({
      where: { role: { not: 'PEMBELI' }, isActive: true },
      select: { id: true, name: true, role: true },
      orderBy: { name: 'asc' },
    }),
  ),
);
financeRouter.get('/salaries', roles('FINANCE', 'SUPERADMIN'), async (req, res) => {
  const { page, limit } = pagination(req.query);
  const [rows, total] = await Promise.all([
    db.salary.findMany({
      include: { user: { select: { name: true, role: true } } },
      orderBy: { period: 'desc' },
      skip: (page - 1) * limit,
      take: limit,
    }),
    db.salary.count(),
  ]);
  res.json({ rows, total, page, limit });
});
financeRouter.post('/salaries', roles('FINANCE', 'SUPERADMIN'), async (req, res) => {
  const data = z
    .object({
      userId: z.uuid(),
      amount: z.number().int().positive().max(100000000),
      period: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    })
    .parse(req.body);
  const user = await db.user.findUnique({ where: { id: data.userId } });
  if (!user?.isActive || user.role === 'PEMBELI') throw new AppError(400, 'Pilih karyawan aktif.');
  const salary = await db.$transaction(async (tx) => {
    const salary = await tx.salary.create({ data });
    await tx.activityLog.create({
      data: {
        userId: req.user!.id,
        action: 'SALARY_CREATE',
        description: `${user.name}: ${data.period}`,
      },
    });
    return salary;
  });
  res.status(201).json(salary);
});
financeRouter.patch('/salaries/:id/pay', roles('FINANCE', 'SUPERADMIN'), async (req, res) => {
  const id = z.uuid().parse(req.params.id);
  await db.$transaction(async (tx) => {
    const changed = await tx.salary.updateMany({
      where: { id, status: 'PENDING' },
      data: { status: 'PAID', paidAt: new Date() },
    });
    if (!changed.count) throw new AppError(409, 'Gaji sudah dibayar atau tidak ditemukan.');
    await tx.activityLog.create({
      data: { userId: req.user!.id, action: 'SALARY_PAID', description: id },
    });
  });
  res.json({ message: 'Gaji ditandai dibayar.' });
});
financeRouter.get('/export', async (req, res) => {
  const format = z.enum(['xlsx', 'pdf']).parse(req.query.format);
  const data = await report(req.query);
  if (format === 'xlsx') {
    const book = new ExcelJS.Workbook(),
      sheet = book.addWorksheet('Laporan');
    sheet.columns = [
      { header: 'Tanggal', key: 'date', width: 22 },
      { header: 'Jenis', key: 'type', width: 16 },
      { header: 'Keterangan', key: 'description', width: 48 },
      { header: 'Nominal (Rp)', key: 'amount', width: 22 },
    ];
    data.rows.forEach((r) => sheet.addRow({ ...r, date: r.date.toISOString().slice(0, 10) }));
    sheet.getRow(1).font = { bold: true };
    sheet.getColumn('amount').numFmt = '#,##0';
    sheet.addRow({ description: 'Pemasukan', amount: data.income });
    sheet.addRow({ description: 'Pengeluaran', amount: data.expense });
    sheet.addRow({ description: 'Selisih', amount: data.net });
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    );
    res.attachment('laporan-sajiklik.xlsx');
    await book.xlsx.write(res);
    res.end();
  } else {
    res.setHeader('Content-Type', 'application/pdf');
    res.attachment('laporan-sajiklik.pdf');
    const doc = new PDFDocument({ margin: 40 });
    doc.pipe(res);
    doc.fontSize(20).text('SajiKlik | Laporan Keuangan');
    doc
      .fontSize(11)
      .text(`Periode: ${range(req.query).gte.toISOString().slice(0, 7)}`)
      .moveDown();
    doc.text(`Pemasukan: Rp ${data.income.toLocaleString('id-ID')}`);
    doc.text(`Pengeluaran: Rp ${data.expense.toLocaleString('id-ID')}`);
    doc.text(`Selisih: Rp ${data.net.toLocaleString('id-ID')}`).moveDown();
    for (const r of data.rows)
      doc
        .fontSize(10)
        .text(
          `${r.date.toISOString().slice(0, 10)} | ${r.type} | ${r.description} | Rp ${r.amount.toLocaleString('id-ID')}`,
        )
        .moveDown(0.4);
    doc.end();
  }
});
