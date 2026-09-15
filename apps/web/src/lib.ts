import axios from 'axios';
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Menu, User } from './types';
export const api = axios.create({ baseURL: '/api', withCredentials: true });
type Auth = {
  user: User | null;
  token: string | null;
  ready: boolean;
  setSession: (data: { user: User; accessToken: string }) => void;
  clear: () => void;
};
export const useAuth = create<Auth>((set) => ({
  user: null,
  token: null,
  ready: false,
  setSession: (d) => set({ user: d.user, token: d.accessToken, ready: true }),
  clear: () => set({ user: null, token: null, ready: true }),
}));
api.interceptors.request.use((config) => {
  const token = useAuth.getState().token;
  if (token && !['/auth/login', '/auth/register', '/auth/logout'].includes(config.url ?? ''))
    config.headers.Authorization = `Bearer ${token}`;
  return config;
});
let refreshing: Promise<void> | null = null;
export async function refresh() {
  if (!refreshing)
    refreshing = axios
      .post('/api/auth/refresh', {}, { withCredentials: true })
      .then((r) => {
        useAuth.getState().setSession(r.data);
      })
      .catch(() => {
        useAuth.getState().clear();
      })
      .finally(() => {
        refreshing = null;
      });
  return refreshing;
}
api.interceptors.response.use(
  (r) => r,
  async (err) => {
    const config = err.config;
    if (
      err.response?.status === 401 &&
      config &&
      !config._retried &&
      !['/auth/login', '/auth/register', '/auth/refresh', '/auth/logout'].includes(config.url)
    ) {
      config._retried = true;
      await refresh();
      if (useAuth.getState().token) return api(config);
    }
    throw err;
  },
);
export const errorText = (e: unknown) =>
  axios.isAxiosError(e)
    ? (e.response?.data?.message ??
      'Server tidak dapat dihubungi. Pastikan API dan database berjalan.')
    : 'Terjadi kesalahan.';
type CartItem = { menu: Menu; qty: number; note: string };
export const useCart = create(
  persist<{
    items: CartItem[];
    add: (menu: Menu) => void;
    update: (id: string, qty: number, note?: string) => void;
    clear: () => void;
  }>(
    (set) => ({
      items: [],
      add: (menu) =>
        set((s) => {
          const existing = s.items.find((i) => i.menu.id === menu.id);
          return {
            items: existing
              ? s.items.map((i) =>
                  i.menu.id === menu.id ? { ...i, qty: Math.min(i.qty + 1, menu.stock, 99) } : i,
                )
              : [...s.items, { menu, qty: 1, note: '' }],
          };
        }),
      update: (id, qty, note) =>
        set((s) => ({
          items: s.items
            .map((i) =>
              i.menu.id === id ? { ...i, qty: Math.min(qty, 99), note: note ?? i.note } : i,
            )
            .filter((i) => i.qty > 0),
        })),
      clear: () => set({ items: [] }),
    }),
    { name: 'sajiklik-cart-v1' },
  ),
);
export const rupiah = (value: number) =>
  new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
  }).format(value);
export const dateTime = (value: string) =>
  new Date(value).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' });
export const statusLabel: Record<string, string> = {
  RECEIVED: 'Diterima',
  PROCESSING: 'Diproses',
  READY: 'Siap diambil',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  PENDING: 'Belum dibayar',
  PAID: 'Lunas',
  CASH: 'Tunai di kasir',
  QRIS: 'QRIS',
  TRANSFER: 'Transfer bank',
};
export const homeFor = (role: string) =>
  role === 'PEMBELI' ? '/' : `/${role.toLowerCase()}/dashboard`;
