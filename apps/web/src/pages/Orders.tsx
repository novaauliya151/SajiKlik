import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import { ChefHat, Clock3, Plus, RefreshCw } from 'lucide-react';
import { api, dateTime, errorText, rupiah, statusLabel, useAuth } from '../lib';
import { Empty, Loading, Notice, PageTitle, Pager, useLoad } from '../components/UI';
import type { Page, Order } from '../types';
function Overview() {
  const { data } = useLoad<{
    orders: number;
    income: number;
    activeOrders: number;
    lowStock: number;
    staff: {
      id: string;
      name: string;
      role: string;
      statusUpdates: number;
      manualOrders: number;
    }[];
  }>('/overview', 10000);
  return data ? (
    <>
      <div className="stats-grid overview-stats">
        {[
          { label: 'Pesanan hari ini', value: data.orders },
          { label: 'Pemasukan hari ini', value: rupiah(data.income) },
          { label: 'Pesanan aktif', value: data.activeOrders },
          { label: 'Menu stok ≤ 5', value: data.lowStock },
        ].map((s) => (
          <div className="panel stat" key={s.label}>
            <span className="muted">{s.label}</span>
            <strong>{s.value}</strong>
          </div>
        ))}
      </div>
      {data.staff.length > 0 && (
        <details className="panel staff-performance">
          <summary>Aktivitas tim hari ini</summary>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Nama</th>
                  <th>Role</th>
                  <th>Update status / pembayaran</th>
                  <th>Pesanan manual</th>
                </tr>
              </thead>
              <tbody>
                {data.staff.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td>{u.role}</td>
                    <td>{u.statusUpdates}</td>
                    <td>{u.manualOrders}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </>
  ) : null;
}
export default function Orders() {
  const { user, token } = useAuth();
  const chef = user?.role === 'CHEF',
    admin = ['ADMIN', 'SUPERADMIN'].includes(user!.role);
  const [page, setPage] = useState(1),
    [status, setStatus] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState('');
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useLoad<Page<Order>>(`/orders?page=${page}${status ? `&status=${status}` : ''}`, 10000);
  useEffect(() => {
    const socket = io({ auth: { token } });
    socket.on('orders:changed', reload);
    return () => {
      socket.disconnect();
    };
  }, [token]);
  async function update(id: string, action: string, value?: string) {
    if (value === 'CANCELLED' && !confirm('Batalkan pesanan dan kembalikan stok?')) return;
    setBusy(id);
    setError('');
    try {
      await api.patch(`/orders/${id}/${action}`, value ? { status: value } : {});
      reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy('');
    }
  }
  return (
    <>
      <PageTitle
        eyebrow={chef ? 'DAPUR · SAJIKLIK' : 'SELAMAT BEKERJA'}
        title={chef ? 'Antrian dapur' : 'Pesanan restoran'}
      >
        <div className="row-actions">
          <button className="btn secondary" onClick={reload}>
            <RefreshCw size={16} /> Muat ulang
          </button>
          {user?.role === 'KASIR' && (
            <Link className="btn" to="/kasir/transaksi">
              <Plus size={17} /> Transaksi baru
            </Link>
          )}
        </div>
      </PageTitle>
      <p className="muted">
        {chef
          ? 'Pesanan paling lama ditampilkan terlebih dahulu. Fokus memasak, kami bantu mengatur antreannya.'
          : 'Pantau pesanan masuk, verifikasi pembayaran, dan serahkan pesanan yang siap.'}
      </p>
      {admin && <Overview />}
      {!chef && (
        <div className="categories">
          <button
            className={!status ? 'active' : ''}
            onClick={() => {
              setStatus('');
              setPage(1);
            }}
          >
            Semua
          </button>
          {['RECEIVED', 'PROCESSING', 'READY', 'COMPLETED', 'CANCELLED'].map((s) => (
            <button
              className={status === s ? 'active' : ''}
              key={s}
              onClick={() => {
                setStatus(s);
                setPage(1);
              }}
            >
              {statusLabel[s]}
            </button>
          ))}
        </div>
      )}
      <Notice>{error || loadError}</Notice>
      {loading ? (
        <Loading />
      ) : !data?.rows.length ? (
        <Empty>
          <ChefHat size={42} />
          <h2>{chef ? 'Dapur sedang lengang' : 'Belum ada pesanan'}</h2>
          <p>Pesanan baru akan muncul otomatis di sini.</p>
        </Empty>
      ) : (
        <>
          <div className="order-grid">
            {data.rows.map((o) => (
              <article className="panel order-card" key={o.id}>
                <div className="row-between">
                  <h2>#{String(o.number).padStart(4, '0')}</h2>
                  <span className={`badge ${o.status}`}>{statusLabel[o.status]}</span>
                </div>
                <p className="muted">
                  {o.tableNumber ? `Meja ${o.tableNumber}` : 'Bawa pulang'}
                  {!chef && ` · ${o.customerName}`}
                </p>
                <small className="order-time">
                  <Clock3 size={14} /> {dateTime(o.createdAt)}
                </small>
                <div className="order-items">
                  {o.items.map((i, n) => (
                    <div key={i.id ?? n}>
                      <strong>
                        <span className="quantity-label">{i.qty}×</span> {i.name}
                      </strong>
                      {i.note && <p className="item-note">Catatan: {i.note}</p>}
                    </div>
                  ))}
                </div>
                {!chef && (
                  <div className="row-between">
                    <strong>{rupiah(o.totalPrice)}</strong>
                    <span className={`badge ${o.payment?.status}`}>
                      {statusLabel[o.payment?.status ?? '']}
                    </span>
                  </div>
                )}
                <div className="order-actions">
                  {(chef || admin) && o.status === 'RECEIVED' && (
                    <button
                      className="btn full"
                      disabled={busy === o.id}
                      onClick={() => update(o.id, 'status', 'PROCESSING')}
                    >
                      Mulai masak
                    </button>
                  )}
                  {(chef || admin) && o.status === 'PROCESSING' && (
                    <button
                      className="btn full"
                      disabled={busy === o.id}
                      onClick={() => update(o.id, 'status', 'READY')}
                    >
                      Selesai memasak
                    </button>
                  )}
                  {!chef && o.payment?.status === 'PENDING' && o.status !== 'CANCELLED' && (
                    <button
                      className="btn full secondary"
                      disabled={busy === o.id}
                      onClick={() => {
                        if (confirm('Pastikan pembayaran sudah diterima. Tandai lunas?'))
                          void update(o.id, 'payment');
                      }}
                    >
                      Konfirmasi pembayaran
                    </button>
                  )}
                  {!chef && o.status === 'READY' && o.payment?.status === 'PAID' && (
                    <button
                      className="btn full"
                      disabled={busy === o.id}
                      onClick={() => update(o.id, 'status', 'COMPLETED')}
                    >
                      Pesanan diserahkan
                    </button>
                  )}
                  {!chef && (
                    <Link className="text-link" to={`/order/${o.id}`}>
                      Detail & struk →
                    </Link>
                  )}
                  {admin &&
                    !['COMPLETED', 'CANCELLED'].includes(o.status) &&
                    o.payment?.status !== 'PAID' && (
                      <button
                        className="text-danger"
                        disabled={busy === o.id}
                        onClick={() => update(o.id, 'status', 'CANCELLED')}
                      >
                        Batalkan pesanan
                      </button>
                    )}
                </div>
              </article>
            ))}
          </div>
          <Pager page={page} total={data.total} onChange={setPage} />
        </>
      )}
    </>
  );
}
