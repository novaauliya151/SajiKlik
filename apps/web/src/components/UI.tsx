import { useEffect, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, ChefHat, LoaderCircle, Plus, Minus } from 'lucide-react';
import { api, errorText } from '../lib';
export function useLoad<T>(url: string, interval = 0) {
  const [data, setData] = useState<T | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(true),
    [version, setVersion] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    setData(null);
    const load = () =>
      api
        .get<T>(url)
        .then((r) => {
          if (active) {
            setData(r.data);
            setError('');
          }
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    void load();
    const timer = interval ? setInterval(load, interval) : undefined;
    return () => {
      active = false;
      if (timer) clearInterval(timer);
    };
  }, [url, interval, version]);
  return { data, error, loading, reload: () => setVersion((v) => v + 1) };
}
export function Brand({ name = 'SajiKlik', logo }: { name?: string; logo?: string | null }) {
  return (
    <Link className="brand" to="/">
      {logo ? (
        <img src={logo} alt="" />
      ) : (
        <span className="brand-icon">
          <ChefHat size={24} />
        </span>
      )}
      <span>
        {name}
        <i>.</i>
      </span>
    </Link>
  );
}
export function Notice({ children, good = false }: { children: ReactNode; good?: boolean }) {
  return children ? (
    <div role="status" className={`notice ${good ? 'good' : ''}`}>
      {children}
    </div>
  ) : null;
}
export function Loading() {
  return (
    <div className="empty">
      <LoaderCircle className="spin" /> Memuat data…
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Qty({ qty, onChange }: { qty: number; onChange: (n: number) => void }) {
  return (
    <div className="qty">
      <button type="button" aria-label="Kurangi jumlah" onClick={() => onChange(qty - 1)}>
        <Minus size={15} />
      </button>
      <span>{qty}</span>
      <button
        type="button"
        aria-label="Tambah jumlah"
        disabled={qty >= 99}
        onClick={() => onChange(qty + 1)}
      >
        <Plus size={15} />
      </button>
    </div>
  );
}
export function Pager({
  page,
  total,
  limit = 20,
  onChange,
}: {
  page: number;
  total: number;
  limit?: number;
  onChange: (p: number) => void;
}) {
  return total > limit ? (
    <div className="pager">
      <button className="btn secondary" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        Sebelumnya
      </button>
      <span>
        {page} / {Math.ceil(total / limit)}
      </span>
      <button
        className="btn secondary"
        disabled={page * limit >= total}
        onClick={() => onChange(page + 1)}
      >
        Berikutnya
      </button>
    </div>
  ) : null;
}
export function PageTitle({
  eyebrow,
  title,
  children,
}: {
  eyebrow?: string;
  title: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-title">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>{title}</h1>
      </div>
      {children}
    </div>
  );
}
export function Back() {
  return (
    <Link className="back" to="/menu">
      <ArrowLeft size={16} /> Kembali ke menu
    </Link>
  );
}
