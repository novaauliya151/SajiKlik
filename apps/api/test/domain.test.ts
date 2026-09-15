import { test } from 'node:test';
import assert from 'node:assert/strict';
import request from 'supertest';
import { createApp } from '../src/app.js';
import {
  assertTransition,
  canManageRole,
  orderSchema,
  totalItems,
  passwordSchema,
} from '../src/domain.js';
test('local browser origins are accepted and foreign origins are blocked', async () => {
  const previous = process.env.CLIENT_ORIGIN;
  process.env.CLIENT_ORIGIN = 'http://localhost:5173,http://127.0.0.1:5173';
  try {
    const app = createApp();
    const blocked = await request(app).post('/api/auth/login').set('Origin', 'http://evil.test').send({
      identity: 'user@example.com',
      password: 'wrongpass',
    });
    const allowed = await request(app).post('/api/auth/login').set('Origin', 'http://127.0.0.1:5173').send({
      identity: 'user@example.com',
      password: 'wrongpass',
    });
    assert.equal(blocked.status, 403);
    assert.notEqual(allowed.status, 403);
  } finally {
    if (previous === undefined) delete process.env.CLIENT_ORIGIN;
    else process.env.CLIENT_ORIGIN = previous;
  }
});

test('admin cannot create or manage admins and buyers', () => {
  assert.equal(canManageRole('ADMIN', 'SUPERADMIN'), false);
  assert.equal(canManageRole('ADMIN', 'ADMIN'), false);
  assert.equal(canManageRole('ADMIN', 'PEMBELI'), false);
  assert.equal(canManageRole('ADMIN', 'CHEF'), true);
  assert.equal(canManageRole('SUPERADMIN', 'ADMIN'), true);
});
test('kitchen only advances received → processing → ready', () => {
  assert.doesNotThrow(() => assertTransition('CHEF', 'RECEIVED', 'PROCESSING', false));
  assert.doesNotThrow(() => assertTransition('CHEF', 'PROCESSING', 'READY', false));
  assert.throws(() => assertTransition('CHEF', 'READY', 'COMPLETED', true));
  assert.throws(() => assertTransition('CHEF', 'RECEIVED', 'CANCELLED', false));
});
test('cashier cannot skip cooking or complete an unpaid order', () => {
  assert.throws(() => assertTransition('KASIR', 'RECEIVED', 'PROCESSING', false));
  assert.throws(() => assertTransition('KASIR', 'READY', 'COMPLETED', false));
  assert.doesNotThrow(() => assertTransition('KASIR', 'READY', 'COMPLETED', true));
});
test('terminal states cannot award loyalty twice or restore stock twice', () => {
  for (const status of ['COMPLETED', 'CANCELLED']) {
    assert.throws(() => assertTransition('ADMIN', status, 'CANCELLED', true));
    assert.throws(() => assertTransition('ADMIN', status, 'COMPLETED', true));
  }
});
test('order schema strips client prices, rejects empty and negative quantities', () => {
  const data = {
    customerName: 'Guest',
    orderType: 'TAKEAWAY',
    method: 'CASH',
    items: [{ menuId: '4a9f0f68-8a2c-477e-b098-887f5e800aaa', qty: 2, price: 1 }],
    totalPrice: 1,
  };
  const parsed = orderSchema.parse(data);
  assert.equal('totalPrice' in parsed, false);
  assert.equal('price' in parsed.items[0], false);
  assert.throws(() => orderSchema.parse({ ...data, items: [] }));
  assert.throws(() => orderSchema.parse({ ...data, items: [{ ...data.items[0], qty: -1 }] }));
  assert.equal(
    totalItems([
      { price: 38000, qty: 2 },
      { price: 18000, qty: 1 },
    ]),
    94000,
  );
});
test('temporary password replacement requires a strong enough password', () => {
  assert.throws(() => passwordSchema.parse('1234567890'));
  assert.throws(() => passwordSchema.parse('abcdefghijk'));
  assert.doesNotThrow(() => passwordSchema.parse('SajiKlik2026!'));
});
