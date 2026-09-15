import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ShoppingBag, Plus, Trash2 } from 'lucide-react';
import { api, errorText, rupiah, useAuth, useCart } from '../lib';
import { Back, Empty, Notice, PageTitle, Qty, useLoad } from '../components/UI';
import type { Menu, Page, Order } from '../types';
export default function Checkout({ manual = false }: { manual?: boolean }) {
  const { items, update, clear, add } = useCart();
  const user = useAuth((s) => s.user);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [query, setQuery] = useState('');
  const navigate = useNavigate();
  const { data: menus } = useLoad<Page<Menu>>(`/menus?limit=100&q=${encodeURIComponent(query)}`);
  const total = items.reduce((n, i) => n + i.menu.price * i.qty, 0);
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      const { data } = await api.post<Order>('/orders', {
        ...f,
        items: items.map((i) => ({ menuId: i.menu.id, qty: i.qty, note: i.note })),
      });
      if (data.trackingToken) sessionStorage.setItem(`order:${data.id}`, data.trackingToken);
      clear();
      navigate(`/order/${data.id}`);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className={manual ? '' : 'content-wrap'}>
      {!manual && <Back />}
      <PageTitle
        eyebrow={manual ? 'KASIR' : 'TINGGAL SELANGKAH LAGI'}
        title={manual ? 'Transaksi baru' : 'Keranjang kamu.'}
      />
      {manual && (
        <section className="panel manual-menu">
          <input
            placeholder="Cari menu untuk ditambahkan…"
            aria-label="Cari menu"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div>
            {menus?.rows.map((m) => (
              <button
                className="btn secondary"
                key={m.id}
                disabled={!m.stock}
                onClick={() => add(m)}
              >
                {m.name} · {rupiah(m.price)} <Plus size={16} />
              </button>
            ))}
          </div>
        </section>
      )}
      <Notice>{error}</Notice>
      {!items.length ? (
        <Empty>
          <ShoppingBag size={40} />
          <h2>Keranjang masih kosong</h2>
          <p>Pilih hidangan favoritmu untuk memulai.</p>
          <Link className="btn" to="/menu">
            Lihat menu
          </Link>
        </Empty>
      ) : (
        <div className="checkout-layout">
          <div className="cart-items">
            {items.map((i) => (
              <article className="panel cart-item" key={i.menu.id}>
                <div className="cart-item-heading">
                  <div>
                    <h3>{i.menu.name}</h3>
                    <p>{rupiah(i.menu.price)}</p>
                  </div>
                  <button aria-label={`Hapus ${i.menu.name}`} onClick={() => update(i.menu.id, 0)}>
                    <Trash2 size={18} />
                  </button>
                </div>
                <label>
                  Catatan khusus
                  <input
                    maxLength={300}
                    placeholder="Contoh: tidak pedas, tanpa bawang"
                    value={i.note}
                    onChange={(e) => update(i.menu.id, i.qty, e.target.value)}
                  />
                </label>
                <div className="row-between">
                  <Qty qty={i.qty} onChange={(n) => update(i.menu.id, n)} />
                  <strong>{rupiah(i.menu.price * i.qty)}</strong>
                </div>
              </article>
            ))}
          </div>
          <form className="panel checkout-summary" onSubmit={submit}>
            <h2>Detail pesanan</h2>
            <label>
              Nama pemesan
              <input
                name="customerName"
                required
                minLength={2}
                maxLength={100}
                defaultValue={user?.role === 'PEMBELI' ? user.name : ''}
              />
            </label>
            <label>
              Jenis pesanan
              <select name="orderType" required>
                <option value="TAKEAWAY">Bawa pulang</option>
                <option value="DINE_IN">Makan di tempat</option>
              </select>
            </label>
            <label>
              Nomor meja <small>(wajib untuk makan di tempat)</small>
              <input name="tableNumber" maxLength={20} placeholder="Contoh: A-04" />
            </label>
            <label>
              Pembayaran
              <select name="method">
                <option value="CASH">Tunai di kasir</option>
                <option value="QRIS">QRIS — dikonfirmasi kasir</option>
                <option value="TRANSFER">Transfer — dikonfirmasi kasir</option>
              </select>
            </label>
            <div className="total-line">
              <span>Total</span>
              <strong>{rupiah(total)}</strong>
            </div>
            <small>
              Harga akhir dan ketersediaan diperiksa saat pesanan dikirim. Pembayaran QRIS/transfer
              diverifikasi oleh kasir.
            </small>
            <button className="btn full" disabled={busy}>
              {busy ? 'Mengirim pesanan…' : 'Buat pesanan'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
