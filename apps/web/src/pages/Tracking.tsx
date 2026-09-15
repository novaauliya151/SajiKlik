import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { Check, Clock3, Printer, Copy } from 'lucide-react';
import { api, dateTime, errorText, rupiah, statusLabel, useAuth } from '../lib';
import { Loading, Notice, useLoad } from '../components/UI';
import type { Order, Settings } from '../types';
export default function Tracking() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const [order, setOrder] = useState<Order | null>(null),
    [error, setError] = useState(''),
    [copied, setCopied] = useState(false);
  const user = useAuth((s) => s.user);
  const { data: s } = useLoad<Settings>('/settings');
  const token = params.get('token') ?? sessionStorage.getItem(`order:${id}`);
  useEffect(() => {
    let active = true;
    const load = () =>
      api
        .get<Order>(`/orders/${id}`, { headers: token ? { 'x-order-token': token } : {} })
        .then((r) => {
          if (active) {
            setOrder(r.data);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    void load();
    const t = setInterval(load, 5000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [id, token]);
  if (!order)
    return (
      <div className="content-wrap">
        <Notice>{error}</Notice>
        {!error && <Loading />}
      </div>
    );
  const stages = ['RECEIVED', 'PROCESSING', 'READY', 'COMPLETED'];
  return (
    <main className="content-wrap tracking">
      <div className="print-brand">{s?.storeName ?? 'SajiKlik'}</div>
      <div className="tracking-title">
        <span className="success-circle">
          <Check size={30} />
        </span>
        <p className="eyebrow">TERIMA KASIH SUDAH MEMESAN</p>
        <h1>Pesanan #{String(order.number).padStart(4, '0')}</h1>
        <p>
          {dateTime(order.createdAt)} · {order.customerName}
          {order.tableNumber && ` · Meja ${order.tableNumber}`}
        </p>
      </div>
      <Notice>{error}</Notice>
      <section className="panel">
        {order.status === 'CANCELLED' ? (
          <Notice>Pesanan ini telah dibatalkan.</Notice>
        ) : (
          <div className="timeline">
            {stages.map((s, i) => (
              <div key={s} className={i <= stages.indexOf(order.status) ? 'done' : ''}>
                <span>{i < stages.indexOf(order.status) ? <Check size={18} /> : i + 1}</span>
                <strong>{statusLabel[s]}</strong>
              </div>
            ))}
          </div>
        )}
        <p className="tracking-help">
          <Clock3 size={16} /> Status diperbarui otomatis setiap 5 detik.
        </p>
      </section>
      <section className="panel receipt">
        <h2>Ringkasan pesanan</h2>
        {order.items.map((i) => (
          <div key={i.id} className="receipt-item">
            <div>
              <strong>
                {i.qty} × {i.name}
              </strong>
              {i.note && <small>{i.note}</small>}
            </div>
            <span>{rupiah(i.subtotal)}</span>
          </div>
        ))}
        <div className="total-line">
          <strong>Total</strong>
          <strong>{rupiah(order.totalPrice)}</strong>
        </div>
        <p>
          {statusLabel[order.payment?.method ?? '']} ·{' '}
          <b>{statusLabel[order.payment?.status ?? '']}</b>
        </p>
        {order.payment?.status === 'PENDING' && (
          <div className="payment-info">
            {order.payment.method === 'CASH' ? (
              'Silakan lakukan pembayaran di kasir.'
            ) : order.payment.method === 'TRANSFER' ? (
              s?.bankInfo || 'Hubungi kasir untuk informasi rekening toko.'
            ) : s?.qrisUrl ? (
              <img className="qris" src={s.qrisUrl} alt="QRIS toko" />
            ) : (
              'Silakan scan QRIS yang tersedia di kasir.'
            )}
            <p>Simpan bukti pembayaran untuk diverifikasi kasir.</p>
          </div>
        )}
      </section>
      <div className="row-actions no-print">
        <button className="btn secondary" onClick={() => window.print()}>
          <Printer size={17} />{' '}
          {user && ['KASIR', 'ADMIN', 'SUPERADMIN'].includes(user.role)
            ? 'Cetak struk'
            : 'Cetak ringkasan'}
        </button>
        {token && (
          <button
            className="btn secondary"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(
                  `${location.origin}/order/${id}?token=${token}`,
                );
                setCopied(true);
              } catch {
                setError(
                  'Tidak dapat menyalin otomatis. Simpan alamat halaman dengan token akses Anda.',
                );
              }
            }}
          >
            <Copy size={17} />
            {copied ? 'Tautan tersalin' : 'Salin tautan tracking'}
          </button>
        )}
        <Link className="btn" to="/menu">
          Pesan lagi
        </Link>
      </div>
      {token && (
        <p className="muted no-print">
          Simpan tautan tracking untuk membuka pesanan kembali. Tautan ini memberikan akses ke
          detail pesanan.
        </p>
      )}
    </main>
  );
}
