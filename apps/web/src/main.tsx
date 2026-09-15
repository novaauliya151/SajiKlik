import { StrictMode, useEffect, lazy, Suspense, useState } from 'react';
import { createRoot } from 'react-dom/client';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  Outlet,
  NavLink,
  Link,
  useLocation,
} from 'react-router-dom';
import {
  ShoppingBag,
  Menu as MenuIcon,
  X,
  LogOut,
  LayoutDashboard,
  Utensils,
  Users,
  Settings as SettingsIcon,
  Wallet,
  ReceiptText,
  ClipboardList,
  UserRound,
} from 'lucide-react';
import { api, useAuth, useCart, refresh, homeFor } from './lib';
import { Brand, Loading, useLoad } from './components/UI';
import type { Settings, Role } from './types';
import './styles.css';
const Store = lazy(() => import('./pages/Store'));
const Checkout = lazy(() => import('./pages/Checkout'));
const Auth = lazy(() => import('./pages/Auth'));
const Tracking = lazy(() => import('./pages/Tracking'));
const Member = lazy(() => import('./pages/Member'));
const Orders = lazy(() => import('./pages/Orders'));
const Management = lazy(() => import('./pages/Management'));
const Finance = lazy(() => import('./pages/Finance'));
const SiteSettings = lazy(() => import('./pages/SiteSettings'));
function PublicLayout() {
  const { user } = useAuth(),
    items = useCart((s) => s.items),
    { data: s } = useLoad<Settings>('/settings');
  return (
    <>
      <header className="store-header">
        <Brand name={s?.storeName} logo={s?.logoUrl} />
        <nav>
          <NavLink to="/" end>
            Beranda
          </NavLink>
          <NavLink to="/menu">Menu kami</NavLink>
          {user?.role === 'PEMBELI' && <NavLink to="/member/history">Pesanan</NavLink>}
        </nav>
        <div className="header-actions">
          <Link
            className="account-link"
            to={
              user ? (user.role === 'PEMBELI' ? '/member/profile' : homeFor(user.role)) : '/login'
            }
          >
            <UserRound size={18} />
            <span>{user ? user.name.split(' ')[0] : 'Masuk'}</span>
          </Link>
          <Link className="cart-link" to="/cart" aria-label="Keranjang">
            <ShoppingBag size={19} />
            <span>{items.reduce((n, i) => n + i.qty, 0)}</span>
          </Link>
        </div>
      </header>
      <Outlet />
      <footer className="store-footer">
        <Brand name={s?.storeName} />
        <p>
          {s?.address}
          <br />
          {s?.openingHours}
        </p>
        <p>
          {s?.contact}
          <br />
          Dibuat dengan rasa, disajikan sepenuh hati.
        </p>
      </footer>
    </>
  );
}
function Guard({ roles }: { roles: Role[] }) {
  const { user, ready } = useAuth();
  const location = useLocation();
  if (!ready) return <Loading />;
  if (!user) return <Navigate to="/login" state={{ from: location.pathname }} replace />;
  if (user.mustChangePassword) return <Navigate to="/change-password" replace />;
  if (!roles.includes(user.role)) return <Navigate to={homeFor(user.role)} replace />;
  return <Outlet />;
}
function InternalLayout() {
  const user = useAuth((s) => s.user)!;
  const [open, setOpen] = useState(false);
  const base = `/${user.role.toLowerCase()}`;
  const admin = ['ADMIN', 'SUPERADMIN'].includes(user.role),
    finance = ['FINANCE', 'SUPERADMIN'].includes(user.role);
  const links = [
    {
      path: '/dashboard',
      title: user.role === 'CHEF' ? 'Antrian dapur' : 'Dashboard',
      icon: LayoutDashboard,
    },
    ...(user.role === 'KASIR'
      ? [{ path: '/transaksi', title: 'Transaksi baru', icon: ReceiptText }]
      : []),
    ...(admin
      ? [
          { path: '/menu', title: 'Kelola menu', icon: Utensils },
          { path: '/pesanan', title: 'Pesanan', icon: ClipboardList },
          { path: '/user', title: 'Kelola pengguna', icon: Users },
          { path: '/laporan', title: 'Laporan keuangan', icon: Wallet },
        ]
      : []),
    ...(finance ? [{ path: '/gaji', title: 'Gaji karyawan', icon: Wallet }] : []),
    ...(user.role === 'SUPERADMIN'
      ? [
          { path: '/settings', title: 'Pengaturan toko', icon: SettingsIcon },
          { path: '/logs', title: 'Log aktivitas', icon: ClipboardList },
        ]
      : []),
  ];
  return (
    <div className="internal">
      <button className="mobile-toggle" aria-label="Buka navigasi" onClick={() => setOpen(!open)}>
        {open ? <X /> : <MenuIcon />}
      </button>
      {open && <div className="scrim" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <Brand />
        <div className="workspace-label">RUANG KERJA · {user.role}</div>
        <nav>
          {links.map((l) => (
            <NavLink key={l.path} to={base + l.path} onClick={() => setOpen(false)}>
              <l.icon size={19} />
              {l.title}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="avatar">{user.name[0]}</div>
          <div>
            <strong>{user.name}</strong>
            <small>{user.role.toLowerCase()}</small>
          </div>
          <button
            title="Keluar"
            onClick={async () => {
              await api.post('/auth/logout');
              useAuth.getState().clear();
            }}
          >
            <LogOut size={19} />
          </button>
        </div>
      </aside>
      <div className="internal-main">
        <header className="internal-top">
          <span>Operasional restoran</span>
          <span className="date">
            {new Date().toLocaleDateString('id-ID', {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })}
          </span>
        </header>
        <main className="workspace">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function App() {
  const { data: s } = useLoad<Settings>('/settings');
  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => {
    if (!s) return;
    document.documentElement.style.setProperty('--primary', s.primaryColor);
    document.documentElement.style.setProperty('--accent', s.secondaryColor);
    document.title = `${s.storeName} — Cita rasa, tinggal klik.`;
    if (s.faviconUrl) {
      let link = document.querySelector<HTMLLinkElement>('link[rel="icon"]');
      if (!link) {
        link = document.createElement('link');
        link.rel = 'icon';
        document.head.append(link);
      }
      link.href = s.faviconUrl;
    }
    if (s.iconUrl) {
      let icon = document.querySelector<HTMLLinkElement>('link[rel="apple-touch-icon"]');
      if (!icon) {
        icon = document.createElement('link');
        icon.rel = 'apple-touch-icon';
        document.head.append(icon);
      }
      icon.href = s.iconUrl;
    }
  }, [s]);
  return (
    <Suspense fallback={<Loading />}>
      <Routes>
        <Route element={<PublicLayout />}>
          <Route index element={<Store />} />
          <Route path="menu" element={<Store />} />
          <Route path="cart" element={<Checkout />} />
          <Route path="order/:id" element={<Tracking />} />
          <Route element={<Guard roles={['PEMBELI']} />}>
            <Route path="member/profile" element={<Member />} />
            <Route path="member/history" element={<Member />} />
          </Route>
        </Route>
        <Route path="login" element={<Auth />} />
        <Route path="register" element={<Auth />} />
        <Route path="change-password" element={<Auth />} />
        {(['KASIR', 'CHEF', 'FINANCE', 'ADMIN', 'SUPERADMIN'] as Role[]).map((role) => (
          <Route key={role} element={<Guard roles={[role]} />}>
            <Route path={role.toLowerCase()} element={<InternalLayout />}>
              <Route path="dashboard" element={role === 'FINANCE' ? <Finance /> : <Orders />} />
              {role === 'KASIR' && <Route path="transaksi" element={<Checkout manual />} />}{' '}
              {['ADMIN', 'SUPERADMIN'].includes(role) && (
                <>
                  <Route path="menu" element={<Management kind="menus" />} />
                  <Route path="pesanan" element={<Orders />} />
                  <Route path="user" element={<Management kind="users" />} />
                  <Route path="laporan" element={<Finance />} />
                </>
              )}
              {['FINANCE', 'SUPERADMIN'].includes(role) && (
                <Route path="gaji" element={<Finance salaries />} />
              )}{' '}
              {role === 'SUPERADMIN' && (
                <>
                  <Route path="settings" element={<SiteSettings />} />
                  <Route path="logs" element={<Management kind="logs" />} />
                </>
              )}
            </Route>
          </Route>
        ))}
        <Route
          path="*"
          element={
            <div className="empty">
              <h1>Halaman tidak ditemukan</h1>
              <Link to="/">Kembali ke beranda</Link>
            </div>
          }
        />
      </Routes>
    </Suspense>
  );
}
createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
);
