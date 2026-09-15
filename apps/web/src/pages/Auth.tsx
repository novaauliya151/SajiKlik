import { useState, type FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { ArrowRight, ShieldCheck } from 'lucide-react';
import { api, errorText, homeFor, useAuth } from '../lib';
import { Brand, Notice, Loading } from '../components/UI';
export default function Auth() {
  const path = useLocation().pathname,
    register = path === '/register',
    change = path === '/change-password';
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  if (!ready) return <Loading />;
  if (change && !user) return <Navigate to="/login" replace />;
  if (user && !change)
    return (
      <Navigate to={user.mustChangePassword ? '/change-password' : homeFor(user.role)} replace />
    );
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { data } = await api.post(
        `/auth/${change ? 'password' : register ? 'register' : 'login'}`,
        f,
      );
      useAuth.getState().setSession(data);
      navigate(data.user.mustChangePassword ? '/change-password' : homeFor(data.user.role), {
        replace: true,
      });
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <section className="auth-story">
        <Brand />
        <div>
          <p className="eyebrow">SELAMAT DATANG DI MEJA KAMI</p>
          <h1>
            Rasa yang dekat.
            <br />
            Momen yang
            <br />
            <em>melekat.</em>
          </h1>
          <p>Satu tempat untuk makanan favorit dan pengalaman bersantap yang lebih mudah.</p>
        </div>
        <span>Segar disiapkan. Hangat disajikan.</span>
      </section>
      <section className="auth-form">
        <Link className="back" to="/">
          ← Kembali ke beranda
        </Link>
        <div className="auth-box">
          <ShieldCheck className="auth-icon" size={32} />
          <h2>
            {change
              ? 'Buat password baru'
              : register
                ? 'Senang berkenalan!'
                : 'Selamat datang kembali.'}
          </h2>
          <p>
            {change
              ? 'Ganti password sementara untuk melanjutkan.'
              : register
                ? 'Daftar sebagai member dan mulai kumpulkan poin.'
                : 'Masuk untuk melanjutkan ke akun SajiKlik Anda.'}
          </p>
          <Notice>{error}</Notice>
          <form onSubmit={submit}>
            {register && (
              <>
                <label>
                  Nama lengkap
                  <input name="name" required minLength={2} maxLength={100} autoComplete="name" />
                </label>
                <label>
                  Email
                  <input name="email" type="email" required autoComplete="email" />
                </label>
              </>
            )}
            {!register && !change && (
              <label>
                Email atau nomor HP
                <input name="identity" required autoComplete="username" />
              </label>
            )}
            {change && (
              <label>
                Password saat ini
                <input
                  name="currentPassword"
                  type="password"
                  required
                  autoComplete="current-password"
                />
              </label>
            )}
            <label>
              {change ? 'Password baru' : 'Password'}
              <input
                name="password"
                type="password"
                required
                minLength={register || change ? 10 : 1}
                maxLength={100}
                autoComplete={register || change ? 'new-password' : 'current-password'}
              />
            </label>
            {(register || change) && (
              <small>Minimal 10 karakter, mengandung huruf dan angka.</small>
            )}
            <button className="btn full" disabled={busy}>
              {busy ? 'Memproses…' : change ? 'Simpan password' : register ? 'Buat akun' : 'Masuk'}
              <ArrowRight size={18} />
            </button>
          </form>
          {!change && (
            <p className="auth-switch">
              {register ? 'Sudah punya akun?' : 'Belum jadi member?'}{' '}
              <Link to={register ? '/login' : '/register'}>
                {register ? 'Masuk' : 'Daftar sekarang'}
              </Link>
            </p>
          )}
        </div>
      </section>
    </main>
  );
}
