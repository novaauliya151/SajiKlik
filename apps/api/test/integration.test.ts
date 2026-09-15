import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { randomUUID } from 'node:crypto';
test(
  'PostgreSQL: auth, RBAC, stock concurrency, payment, loyalty and finance',
  { skip: !process.env.TEST_DATABASE_URL },
  async (t) => {
    if (!process.env.TEST_DATABASE_URL!.includes('sajiklik_test'))
      throw new Error('Use a dedicated sajiklik_test database.');
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
    process.env.JWT_SECRET = 'integration-only-secret-0123456789abcdef';
    const { createApp } = await import('../src/app.js');
    const { db } = await import('../src/db.js');
    const app = createApp();
    const tag = randomUUID().slice(0, 8),
      password = 'Integration123!';

    await t.test('localhost and 127.0.0.1 origins are both allowed for login', async () => {
      process.env.CLIENT_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';
      const appWithAltOrigin = createApp();
      const email = `origin-${tag}@example.com`;
      const user = await db.user.create({
        data: {
          name: `Origin Tester ${tag}`,
          email,
          passwordHash: await bcrypt.hash(password, 4),
          role: 'PEMBELI',
        },
      });
      const login = await request(appWithAltOrigin)
        .post('/api/auth/login')
        .set('Origin', 'http://127.0.0.1:5173')
        .send({ identity: email, password });
      assert.equal(login.status, 200);
      assert.equal(login.body.user.id, user.id);
    });
    const people: Record<string, { id: string; token: string }> = {};
    const trackedOrders: string[] = [];
    const category = await db.category.create({ data: { name: `Test ${tag}` } });
    const menu = await db.menu.create({
      data: {
        name: `Meal ${tag}`,
        description: 'Test meal',
        price: 38000,
        stock: 10,
        categoryId: category.id,
      },
    });
    try {
      for (const role of ['KASIR', 'CHEF', 'FINANCE', 'ADMIN', 'SUPERADMIN'] as const) {
        const u = await db.user.create({
          data: {
            name: `Test ${role}`,
            email: `${role.toLowerCase()}-${tag}@example.com`,
            role,
            passwordHash: await bcrypt.hash(password, 4),
          },
        });
        const r = await request(app).post('/api/auth/login').send({ identity: u.email, password });
        assert.equal(r.status, 200);
        people[role] = { id: u.id, token: r.body.accessToken };
      }
      let buyerToken = '',
        buyerId = '',
        tracking = '',
        orderId = '';
      await t.test('register cannot escalate role; invalid login fails', async () => {
        const r = await request(app)
          .post('/api/auth/register')
          .send({
            name: 'Test Buyer',
            email: `buyer-${tag}@example.com`,
            password,
            role: 'SUPERADMIN',
          });
        assert.equal(r.status, 201);
        assert.equal(r.body.user.role, 'PEMBELI');
        buyerToken = r.body.accessToken;
        buyerId = r.body.user.id;
        people.PEMBELI = { id: buyerId, token: buyerToken };
        assert.equal(
          (
            await request(app)
              .post('/api/auth/login')
              .send({ identity: `buyer-${tag}@example.com`, password: 'wrong' })
          ).status,
          401,
        );
      });
      await t.test('refresh token is rotated and cannot be replayed', async () => {
        const login = await request(app)
          .post('/api/auth/login')
          .send({ identity: `buyer-${tag}@example.com`, password });
        const cookie = login.headers['set-cookie'];
        const refreshed = await request(app).post('/api/auth/refresh').set('Cookie', cookie);
        assert.equal(refreshed.status, 200);
        assert.equal(
          (await request(app).post('/api/auth/refresh').set('Cookie', cookie)).status,
          401,
        );
      });
      await t.test('internal routes deny other roles and chef cannot view finance', async () => {
        assert.equal((await request(app).get('/api/users')).status, 401);
        assert.equal(
          (await request(app).get('/api/users').auth(buyerToken, { type: 'bearer' })).status,
          403,
        );
        assert.equal(
          (
            await request(app)
              .get('/api/finance/summary')
              .auth(people.CHEF.token, { type: 'bearer' })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(app)
              .post('/api/users')
              .auth(people.ADMIN.token, { type: 'bearer' })
              .send({ name: 'Illegal Admin', email: `bad-${tag}@example.com`, role: 'ADMIN' })
          ).status,
          403,
        );
      });
      const payload = {
        customerName: 'Test guest',
        orderType: 'TAKEAWAY',
        method: 'CASH',
        totalPrice: 1,
        items: [{ menuId: menu.id, qty: 2, price: 1 }],
      };
      await t.test('guest order uses server price and private tracking token', async () => {
        const r = await request(app).post('/api/orders').send(payload);
        assert.equal(r.status, 201);
        orderId = r.body.id;
        trackedOrders.push(orderId);
        tracking = r.body.trackingToken;
        assert.equal(r.body.totalPrice, 76000);
        assert.equal('trackingHash' in r.body, false);
        assert.equal((await request(app).get(`/api/orders/${orderId}`)).status, 404);
        assert.equal(
          (await request(app).get(`/api/orders/${orderId}`).set('x-order-token', tracking)).status,
          200,
        );
        assert.equal((await db.menu.findUniqueOrThrow({ where: { id: menu.id } })).stock, 8);
      });
      await t.test('out-of-stock order rolls back all stock changes', async () => {
        const r = await request(app)
          .post('/api/orders')
          .send({
            ...payload,
            items: [
              { menuId: menu.id, qty: 2 },
              { menuId: menu.id, qty: 9 },
            ],
          });
        assert.equal(r.status, 409);
        assert.equal((await db.menu.findUniqueOrThrow({ where: { id: menu.id } })).stock, 8);
      });
      await t.test('chef sees no prices and can advance only the kitchen steps', async () => {
        const list = await request(app)
          .get('/api/orders')
          .auth(people.CHEF.token, { type: 'bearer' });
        assert.equal(list.status, 200);
        const o = list.body.rows.find((o: any) => o.id === orderId);
        assert.ok(o);
        assert.equal('totalPrice' in o, false);
        assert.equal('subtotal' in o.items[0], false);
        assert.equal(
          (
            await request(app)
              .patch(`/api/orders/${orderId}/status`)
              .auth(people.CHEF.token, { type: 'bearer' })
              .send({ status: 'PROCESSING' })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(app)
              .patch(`/api/orders/${orderId}/status`)
              .auth(people.CHEF.token, { type: 'bearer' })
              .send({ status: 'READY' })
          ).status,
          200,
        );
        assert.equal(
          (
            await request(app)
              .patch(`/api/orders/${orderId}/status`)
              .auth(people.CHEF.token, { type: 'bearer' })
              .send({ status: 'COMPLETED' })
          ).status,
          403,
        );
        assert.equal(
          (
            await request(app)
              .patch(`/api/orders/${orderId}/status`)
              .auth(people.KASIR.token, { type: 'bearer' })
              .send({ status: 'COMPLETED' })
          ).status,
          409,
        );
      });
      await t.test(
        'payment confirmation is one-time and cancelled paid orders are rejected',
        async () => {
          const pay = () =>
            request(app)
              .patch(`/api/orders/${orderId}/payment`)
              .auth(people.KASIR.token, { type: 'bearer' });
          assert.equal((await pay()).status, 200);
          assert.equal((await pay()).status, 409);
          assert.equal(
            (
              await request(app)
                .patch(`/api/orders/${orderId}/status`)
                .auth(people.ADMIN.token, { type: 'bearer' })
                .send({ status: 'CANCELLED' })
            ).status,
            409,
          );
          assert.equal(
            (await db.order.findUniqueOrThrow({ where: { id: orderId } })).status,
            'READY',
          );
          assert.equal((await db.menu.findUniqueOrThrow({ where: { id: menu.id } })).stock, 8);
          assert.equal(
            (
              await request(app)
                .patch(`/api/orders/${orderId}/status`)
                .auth(people.KASIR.token, { type: 'bearer' })
                .send({ status: 'COMPLETED' })
            ).status,
            200,
          );
        },
      );
      await t.test(
        'concurrent orders cannot oversell; cancellation restores inventory once',
        async () => {
          await db.menu.update({ where: { id: menu.id }, data: { stock: 1 } });
          const responses = await Promise.all(
            [1, 2].map(() =>
              request(app)
                .post('/api/orders')
                .send({ ...payload, items: [{ menuId: menu.id, qty: 1 }] }),
            ),
          );
          assert.deepEqual(responses.map((r) => r.status).sort(), [201, 409]);
          const created = responses.find((r) => r.status === 201)!;
          trackedOrders.push(created.body.id);
          const cancel = () =>
            request(app)
              .patch(`/api/orders/${created.body.id}/status`)
              .auth(people.ADMIN.token, { type: 'bearer' })
              .send({ status: 'CANCELLED' });
          assert.equal((await cancel()).status, 200);
          assert.equal((await cancel()).status, 409);
          assert.equal((await db.menu.findUniqueOrThrow({ where: { id: menu.id } })).stock, 1);
        },
      );
      await t.test('member receives loyalty once after paid completion', async () => {
        const r = await request(app)
          .post('/api/orders')
          .auth(buyerToken, { type: 'bearer' })
          .send({ ...payload, items: [{ menuId: menu.id, qty: 1 }] });
        assert.equal(r.status, 201);
        const id = r.body.id;
        trackedOrders.push(id);
        for (const status of ['PROCESSING', 'READY'])
          assert.equal(
            (
              await request(app)
                .patch(`/api/orders/${id}/status`)
                .auth(people.CHEF.token, { type: 'bearer' })
                .send({ status })
            ).status,
            200,
          );
        await request(app)
          .patch(`/api/orders/${id}/payment`)
          .auth(people.KASIR.token, { type: 'bearer' });
        const finish = () =>
          request(app)
            .patch(`/api/orders/${id}/status`)
            .auth(people.KASIR.token, { type: 'bearer' })
            .send({ status: 'COMPLETED' });
        assert.equal((await finish()).status, 200);
        assert.equal((await finish()).status, 409);
        assert.equal(
          (await db.customer.findUniqueOrThrow({ where: { userId: buyerId } })).loyaltyPoints,
          3,
        );
        const history = await request(app)
          .get('/api/orders/mine')
          .auth(buyerToken, { type: 'bearer' });
        assert.equal(history.body.rows.length, 1);
      });
      await t.test(
        'finance summary and PDF/Excel exports work with patched dependencies',
        async () => {
          const summary = await request(app)
            .get('/api/finance/summary')
            .auth(people.FINANCE.token, { type: 'bearer' });
          assert.equal(summary.status, 200);
          assert.ok(summary.body.income >= 114000);
          for (const format of ['pdf', 'xlsx']) {
            const r = await request(app)
              .get(`/api/finance/export?format=${format}`)
              .auth(people.FINANCE.token, { type: 'bearer' });
            assert.equal(r.status, 200);
            assert.match(r.headers['content-disposition'], new RegExp(format));
          }
          assert.equal(
            (
              await request(app)
                .post('/api/finance/entries')
                .auth(people.ADMIN.token, { type: 'bearer' })
                .send({})
            ).status,
            403,
          );
        },
      );
      await t.test('salary payment appears exactly once in expenses', async () => {
        const r = await request(app)
          .post('/api/finance/salaries')
          .auth(people.FINANCE.token, { type: 'bearer' })
          .send({ userId: people.CHEF.id, amount: 3000000, period: '2026-09' });
        assert.equal(r.status, 201);
        const pay = () =>
          request(app)
            .patch(`/api/finance/salaries/${r.body.id}/pay`)
            .auth(people.FINANCE.token, { type: 'bearer' });
        assert.equal((await pay()).status, 200);
        assert.equal((await pay()).status, 409);
        await db.salary.delete({ where: { id: r.body.id } });
      });
      await t.test(
        'reset invalidates old JWT and requires first-login password change',
        async () => {
          const reset = await request(app)
            .patch(`/api/users/${people.KASIR.id}`)
            .auth(people.ADMIN.token, { type: 'bearer' })
            .send({ resetPassword: true });
          assert.equal(reset.status, 200);
          assert.equal(
            (await request(app).get('/api/orders').auth(people.KASIR.token, { type: 'bearer' }))
              .status,
            401,
          );
          const login = await request(app)
            .post('/api/auth/login')
            .send({ identity: `KASIR-${tag}@example.com`, password: reset.body.temporaryPassword });
          assert.equal(login.status, 200);
          assert.equal(login.body.user.mustChangePassword, true);
          assert.equal(
            (await request(app).get('/api/orders').auth(login.body.accessToken, { type: 'bearer' }))
              .status,
            403,
          );
          const changed = await request(app)
            .post('/api/auth/password')
            .auth(login.body.accessToken, { type: 'bearer' })
            .send({ currentPassword: reset.body.temporaryPassword, password: 'MyNewPassword123!' });
          assert.equal(changed.status, 200);
          assert.equal(changed.body.user.mustChangePassword, false);
        },
      );
    } finally {
      await db.payment.deleteMany({ where: { orderId: { in: trackedOrders } } });
      await db.orderItem.deleteMany({ where: { orderId: { in: trackedOrders } } });
      await db.order.deleteMany({ where: { id: { in: trackedOrders } } });
      const ids = Object.values(people).map((p) => p.id);
      await db.activityLog.deleteMany({ where: { userId: { in: ids } } });
      await db.salary.deleteMany({ where: { userId: { in: ids } } });
      await db.customer.deleteMany({ where: { userId: { in: ids } } });
      await db.user.deleteMany({ where: { id: { in: ids } } });
      await db.menu.delete({ where: { id: menu.id } });
      await db.category.delete({ where: { id: category.id } });
      await db.$disconnect();
    }
  },
);
