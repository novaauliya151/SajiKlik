import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowUpRight,
  ArrowRight,
  Search,
  Plus,
  Clock3,
  Leaf,
  ShoppingBag,
  Check,
} from 'lucide-react';
import { useLoad, Notice, Loading, Empty, Pager } from '../components/UI';
import { rupiah, useCart } from '../lib';
import type { Menu, Category, Page } from '../types';
export function FoodArt({ kind = 0 }: { kind?: number }) {
  return (
    <div aria-hidden="true" className={`food-art food-${kind % 4}`}>
      <div className="plate">
        <div className="rice" />
        <div className="protein" />
        <div className="greens" />
        <div className="chili" />
        <div className="cucumber" />
      </div>
    </div>
  );
}
export default function Store() {
  const landing = useLocation().pathname === '/';
  const [query, setQuery] = useState(''),
    [category, setCategory] = useState(''),
    [page, setPage] = useState(1),
    [added, setAdded] = useState('');
  const { data: categories } = useLoad<Category[]>('/categories');
  const { data, error, loading } = useLoad<Page<Menu>>(
    `/menus?limit=12&page=${page}&q=${encodeURIComponent(query)}${category ? `&categoryId=${category}` : ''}`,
  );
  const add = useCart((s) => s.add);
  return (
    <main className="store-main">
      {landing && (
        <>
          <section className="hero">
            <div className="hero-copy">
              <span className="pill">
                <span /> DARI DAPUR KAMI, UNTUK KAMU
              </span>
              <h1>
                Rasa yang bikin
                <br />
                ingin <em>kembali.</em>
              </h1>
              <p>
                Makanan favorit, bahan pilihan, dan rasa yang selalu dirindukan. Pesan sekarang,
                kami siapkan sepenuh hati.
              </p>
              <a className="btn hero-button" href="#menu">
                Jelajahi menu <ArrowUpRight size={20} />
              </a>
              <div className="hero-perks">
                <span>
                  <Leaf size={17} /> Bahan segar
                </span>
                <span>
                  <Clock3 size={17} /> Dibuat saat dipesan
                </span>
              </div>
            </div>
            <div className="hero-visual">
              <div className="orbit" />
              <span className="visual-tag">
                FRESHLY MADE
                <br />
                <b>with love.</b>
              </span>
              <FoodArt />
              <div className="food-caption">
                <span className="tiny-label">KENALAN DENGAN FAVORITMU</span>
                <strong>Nasi Ayam Sambal Matah</strong>
                <span>
                  Pedas segar, pas di hati. <ArrowUpRight size={18} />
                </span>
              </div>
              <span className="round-label">
                100%<small>SEPENUH HATI</small>
              </span>
            </div>
          </section>
          <section className="value-strip">
            <span>
              <Leaf size={19} /> Segar setiap hari
            </span>
            <i />
            <span>
              <ShoppingBag size={19} /> Pesan tanpa antre
            </span>
            <i />
            <span>
              <Clock3 size={19} /> Lacak dari dapur ke meja
            </span>
          </section>
        </>
      )}
      <section id="menu" className="menu-section">
        <div className="menu-heading">
          <div>
            <p className="eyebrow">PILIH YANG KAMU SUKA</p>
            <h2>{landing ? 'Ada rasa untuk setiap selera.' : 'Menu kami.'}</h2>
            <p>Masakan hangat, minuman segar, dan teman ngobrol yang pas.</p>
          </div>
          <label className="search">
            <Search size={19} />
            <input
              aria-label="Cari menu"
              placeholder="Lagi ingin makan apa?"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="categories">
          <button
            className={!category ? 'active' : ''}
            onClick={() => {
              setCategory('');
              setPage(1);
            }}
          >
            Semua menu
          </button>
          {categories?.map((c) => (
            <button
              key={c.id}
              className={category === c.id ? 'active' : ''}
              onClick={() => {
                setCategory(c.id);
                setPage(1);
              }}
            >
              {c.name}
            </button>
          ))}
        </div>
        <Notice>{error}</Notice>
        {loading ? (
          <Loading />
        ) : !data?.rows.length ? (
          <Empty>Belum ada menu yang cocok. Coba kata kunci lainnya.</Empty>
        ) : (
          <div className="menu-grid">
            {data.rows.map((m, i) => (
              <article key={m.id} className="menu-card">
                <div className="menu-image">
                  {m.imageUrl ? (
                    <img src={m.imageUrl} alt={m.name} loading="lazy" />
                  ) : (
                    <FoodArt kind={i} />
                  )}
                  <span className="menu-category">{m.category.name}</span>
                  {m.stock === 0 && <span className="sold-out">Habis hari ini</span>}
                </div>
                <div className="menu-card-body">
                  <h3>{m.name}</h3>
                  <p>{m.description}</p>
                  <div className="menu-card-bottom">
                    <strong>{rupiah(m.price)}</strong>
                    <button
                      disabled={m.stock === 0}
                      aria-label={`Tambah ${m.name} ke keranjang`}
                      onClick={() => {
                        add(m);
                        setAdded(m.id);
                        setTimeout(() => setAdded(''), 1400);
                      }}
                    >
                      {added === m.id ? <Check size={20} /> : <Plus size={20} />}
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
        {data && <Pager page={page} total={data.total} limit={12} onChange={setPage} />}
      </section>
      <section className="member-banner">
        <div>
          <p className="eyebrow">MAKAN ENAK, MAKIN UNTUNG</p>
          <h2>Jadi langganan, dapat kelebihan.</h2>
          <p>Kumpulkan 1 poin setiap Rp10.000 pada pesanan yang selesai.</p>
        </div>
        <Link className="btn" to="/register">
          Daftar member <ArrowRight size={18} />
        </Link>
      </section>
    </main>
  );
}
