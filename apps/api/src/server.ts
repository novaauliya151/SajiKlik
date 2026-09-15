import 'dotenv/config';
import { createServer } from 'node:http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import { createApp } from './app.js';
import { db } from './db.js';
import { secret } from './auth.js';
secret();
const app = createApp(),
  server = createServer(app);
const io = new Server(server, {
  cors: { origin: process.env.CLIENT_ORIGIN ?? 'http://localhost:5173', credentials: true },
});
io.use(async (socket, next) => {
  try {
    const p = jwt.verify(socket.handshake.auth.token, secret(), {
      issuer: 'sajiklik',
      audience: 'sajiklik-web',
    }) as jwt.JwtPayload;
    const u = await db.user.findUnique({ where: { id: p.sub } });
    if (
      !u?.isActive ||
      u.mustChangePassword ||
      u.tokenVersion !== p.version ||
      !['CHEF', 'KASIR', 'ADMIN', 'SUPERADMIN'].includes(u.role)
    )
      throw new Error();
    socket.data.expiresAt = p.exp!;
    next();
  } catch {
    next(new Error('Unauthorized'));
  }
});
io.on('connection', (socket) => {
  socket.join('staff');
  const timer = setTimeout(
    () => socket.disconnect(true),
    Math.max(0, socket.data.expiresAt * 1000 - Date.now()),
  );
  socket.on('disconnect', () => clearTimeout(timer));
});
app.set('io', io);
server.listen(Number(process.env.PORT ?? 4000), '127.0.0.1', () =>
  console.log('SajiKlik API: http://localhost:4000'),
);
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () => {
    io.close();
    server.close(() => {
      void db.$disconnect().then(() => process.exit(0));
    });
  });
