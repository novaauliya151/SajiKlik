import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const db = new PrismaClient();
async function main() {
  const email = process.env.SEED_ADMIN_EMAIL?.trim().toLowerCase(),
    password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password || password.length < 10)
    throw new Error('Isi SEED_ADMIN_EMAIL dan SEED_ADMIN_PASSWORD (minimal 10 karakter).');
  await db.user.upsert({
    where: { email },
    update: {},
    create: {
      name: 'Superadmin',
      email,
      passwordHash: await bcrypt.hash(password, 12),
      role: 'SUPERADMIN',
      mustChangePassword: true,
    },
  });
  await db.siteSetting.upsert({ where: { id: 'main' }, update: {}, create: { id: 'main' } });
  const categories = ['Makanan utama', 'Camilan', 'Minuman', 'Pencuci mulut'];
  const menus = [
    [
      'Nasi Ayam Sambal Matah',
      'Ayam panggang juicy, sambal matah segar, dan nasi hangat.',
      38000,
      0,
    ],
    ['Nasi Goreng Kampung', 'Nasi goreng berbumbu rempah dengan telur dan kerupuk.', 32000, 0],
    ['Mie Goreng Spesial', 'Mie goreng dengan ayam, sayuran segar, dan telur.', 34000, 0],
    ['Sate Ayam Madura', 'Sate ayam dengan bumbu kacang dan lontong.', 42000, 0],
    ['Kentang Goreng', 'Kentang renyah dengan taburan bumbu pilihan.', 22000, 1],
    ['Tahu Cabe Garam', 'Tahu crispy dengan bawang dan cabai segar.', 24000, 1],
    ['Es Kopi Susu Aren', 'Espresso, susu segar, dan gula aren.', 26000, 2],
    ['Es Teh Lemon', 'Teh segar dengan perasan lemon asli.', 18000, 2],
    ['Pisang Karamel', 'Pisang hangat, karamel, dan es krim vanila.', 28000, 3],
  ] as const;
  for (const [index, name] of categories.entries()) {
    const c = await db.category.upsert({ where: { name }, update: {}, create: { name } });
    for (const [name, description, price, category] of menus.filter((m) => m[3] === index)) {
      if (!(await db.menu.findFirst({ where: { name } })))
        await db.menu.create({
          data: { name, description, price, categoryId: c.id, stock: 50, imageUrl: null },
        });
    }
  }
  console.log(`Seed selesai. Login: ${email}. Password wajib diganti saat login pertama.`);
}
main().finally(() => db.$disconnect());
