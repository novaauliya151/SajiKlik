import { useState, type FormEvent } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, dateTime, errorText, rupiah, statusLabel, useAuth } from '../lib';
import { PageTitle, useLoad, Notice, Loading, Empty, Pager } from '../components/UI';
import type { User, Page, Order } from '../types';
export default function Member() {
  const history = useLocation().pathname.endsWith('history');
  const [page, setPage] = useState(1),
    [message, setMessage] = useState(''),
    [error, setError] = useState('');
  const { data: user } = useLoad<User>('/auth/me');
  const {
    data: orders,
    loading,
    error: loadError,
  } = useLoad<Page<Order>>(`/orders/mine?page=${page}`);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError('');
    try {
      const f = Object.fromEntries(new FormData(e.currentTarget));
      const { data } = await api.patch('/auth/profile', { ...f, phone: f.phone || null });
      useAuth.setState({ user: data });
      setMessage('Profil berhasil disimpan.');
    } catch (err) {
      setError(errorText(err));
    }
  }
  return (
    <main className="content-wrap">
      <PageTitle eyebrow="RUANG MEMBER" title={history ? 'Riwayat pesanan.' : 'Profil kamu.'}>
        <Link className="btn secondary" to={history ? '/member/profile' : '/member/history'}>
          {history ? 'Lihat profil' : 'Riwayat pesanan'}
        </Link>
      </PageTitle>
      <Notice>{error || loadError}</Notice>
      <Notice good>{message}</Notice>
      {history ? (
        loading ? (
          <Loading />
        ) : orders?.rows.length ? (
          <>
            <div className="order-grid">
              {orders.rows.map((o) => (
                <Link className="panel history-card" key={o.id} to={`/order/${o.id}`}>
                  <span className={`badge ${o.status}`}>{statusLabel[o.status]}</span>
                  <h3>Pesanan #{o.number}</h3>
                  <p>{dateTime(o.createdAt)}</p>
                  <strong>{rupiah(o.totalPrice)}</strong>
                  <p>{o.items.map((i) => `${i.qty} ${i.name}`).join(', ')}</p>
                </Link>
              ))}
            </div>
            <Pager page={page} total={orders.total} onChange={setPage} />
          </>
        ) : (
          <Empty>Belum ada pesanan. Yuk, temukan menu favoritmu.</Empty>
        )
      ) : (
        user && (
          <div className="profile-layout">
            <form className="panel" onSubmit={save}>
              <h2>Data diri</h2>
              <label>
                Nama
                <input name="name" defaultValue={user.name} required minLength={2} />
              </label>
              <label>
                Email
                <input value={user.email} disabled />
              </label>
              <label>
                Nomor HP
                <input name="phone" defaultValue={user.phone ?? ''} pattern="\+?[0-9]{8,15}" />
              </label>
              <button className="btn">Simpan perubahan</button>
              <Link className="back" to="/change-password">
                Ganti password
              </Link>
              <button
                className="btn secondary"
                type="button"
                onClick={async () => {
                  await api.post('/auth/logout');
                  useAuth.getState().clear();
                }}
              >
                Keluar
              </button>
            </form>
            <div className="loyalty-card">
              <p>POIN LOYALTY KAMU</p>
              <strong>{user.loyaltyPoints ?? 0}</strong>
              <h3>Setiap rasa punya cerita.</h3>
              <p>
                Dapatkan 1 poin setiap Rp10.000 dari pesanan yang selesai. Penukaran poin belum
                tersedia.
              </p>
            </div>
          </div>
        )
      )}
    </main>
  );
}
