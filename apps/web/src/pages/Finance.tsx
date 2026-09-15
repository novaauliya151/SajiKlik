import { useState, type FormEvent } from 'react';
import { Download, Plus, Printer, TrendingUp, TrendingDown, Wallet, X } from 'lucide-react';
import { api, dateTime, errorText, rupiah, useAuth } from '../lib';
import { Empty, Loading, Notice, PageTitle, Pager, useLoad } from '../components/UI';
import type { Page } from '../types';
type Entry = { id: string; date: string; type: string; description: string; amount: number };
type Report = Page<Entry> & {
  income: number;
  expense: number;
  net: number;
  transactions: number;
  daily: { day: number; income: number; expense: number }[];
};
type Salary = {
  id: string;
  user: { name: string; role: string };
  amount: number;
  period: string;
  status: string;
  paidAt: string | null;
};
export default function Finance({ salaries = false }: { salaries?: boolean }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0, 7)),
    [page, setPage] = useState(1),
    [error, setError] = useState(''),
    [modal, setModal] = useState(false),
    [busy, setBusy] = useState(false),
    [slip, setSlip] = useState<Salary | null>(null);
  const user = useAuth((s) => s.user)!;
  const writable = ['FINANCE', 'SUPERADMIN'].includes(user.role);
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useLoad<Report | Page<Salary>>(
    salaries ? `/finance/salaries?page=${page}` : `/finance/summary?month=${month}&page=${page}`,
  );
  const { data: employees } = useLoad<{ id: string; name: string }[]>(
    writable ? '/finance/employees' : '/categories',
  );
  const report = data as Report | null;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const f = Object.fromEntries(new FormData(e.currentTarget));
    try {
      await api.post(`/finance/${salaries ? 'salaries' : 'entries'}`, {
        ...f,
        amount: Number(f.amount),
        ...(!salaries ? { date: new Date(`${f.date}T12:00:00Z`).toISOString() } : {}),
      });
      setModal(false);
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function download(format: string) {
    setBusy(true);
    setError('');
    try {
      const r = await api.get(`/finance/export?month=${month}&format=${format}`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(r.data),
        a = document.createElement('a');
      a.href = url;
      a.download = `sajiklik-${month}.${format}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <div className={slip ? 'no-print' : ''}>
        <PageTitle eyebrow="KEUANGAN" title={salaries ? 'Gaji karyawan' : 'Laporan keuangan'}>
          <div className="row-actions">
            {!salaries && (
              <>
                <input
                  aria-label="Periode laporan"
                  type="month"
                  value={month}
                  onChange={(e) => {
                    if (e.target.value) {
                      setMonth(e.target.value);
                      setPage(1);
                    }
                  }}
                />
                <button className="btn secondary" disabled={busy} onClick={() => download('xlsx')}>
                  <Download size={16} /> Excel
                </button>
                <button className="btn secondary" disabled={busy} onClick={() => download('pdf')}>
                  PDF
                </button>
              </>
            )}
            {writable && (
              <button className="btn" onClick={() => setModal(true)}>
                <Plus size={17} />
                {salaries ? 'Input gaji' : 'Catat transaksi'}
              </button>
            )}
          </div>
        </PageTitle>
        <Notice>{error || loadError}</Notice>
        {loading ? (
          <Loading />
        ) : (
          data && (
            <>
              {!salaries && (
                <>
                  <div className="stats-grid">
                    {[
                      { label: 'Pemasukan', value: report!.income, icon: TrendingUp },
                      { label: 'Pengeluaran', value: report!.expense, icon: TrendingDown },
                      { label: 'Selisih kas', value: report!.net, icon: Wallet },
                    ].map((s) => (
                      <article className="panel stat" key={s.label}>
                        <div className="row-between">
                          <span>{s.label}</span>
                          <s.icon size={20} />
                        </div>
                        <strong>{rupiah(s.value)}</strong>
                        <small>Periode {month}</small>
                      </article>
                    ))}
                  </div>
                  <section className="panel chart-panel">
                    <div className="row-between">
                      <h3>Arus kas harian</h3>
                      <span className="muted">Hijau: masuk · Emas: keluar</span>
                    </div>
                    <div
                      className="bar-chart"
                      role="img"
                      aria-label={`Grafik arus kas bulan ${month}`}
                    >
                      {report!.daily
                        .slice(
                          0,
                          new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate(),
                        )
                        .map((d) => (
                          <div
                            className="bar-day"
                            key={d.day}
                            title={`${d.day}: masuk ${rupiah(d.income)}, keluar ${rupiah(d.expense)}`}
                          >
                            <div>
                              <i
                                style={{
                                  height: `${Math.max(1, (d.income / Math.max(1, ...report!.daily.map((v) => Math.max(v.income, v.expense)))) * 100)}%`,
                                }}
                              />
                              <b
                                style={{
                                  height: `${Math.max(1, (d.expense / Math.max(1, ...report!.daily.map((v) => Math.max(v.income, v.expense)))) * 100)}%`,
                                }}
                              />
                            </div>
                            <small>{d.day}</small>
                          </div>
                        ))}
                    </div>
                  </section>
                </>
              )}
              {!data.rows.length ? (
                <Empty>Belum ada {salaries ? 'data gaji' : 'transaksi pada periode ini'}.</Empty>
              ) : (
                <div className="panel table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {(salaries
                          ? ['Karyawan', 'Periode', 'Nominal', 'Status', 'Aksi']
                          : ['Tanggal', 'Keterangan', 'Jenis', 'Nominal']
                        ).map((h) => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.map((row) =>
                        salaries ? (
                          <tr key={row.id}>
                            <td>
                              <strong>{(row as Salary).user.name}</strong>
                              <small>{(row as Salary).user.role}</small>
                            </td>
                            <td>{(row as Salary).period}</td>
                            <td>{rupiah(row.amount)}</td>
                            <td>
                              <span className={`badge ${(row as Salary).status}`}>
                                {(row as Salary).status === 'PAID' ? 'Dibayar' : 'Menunggu'}
                              </span>
                            </td>
                            <td>
                              <div className="row-actions">
                                {(row as Salary).status === 'PENDING' && (
                                  <button
                                    className="text-link"
                                    disabled={busy}
                                    onClick={async () => {
                                      if (!confirm('Konfirmasi gaji sudah dibayarkan?')) return;
                                      setBusy(true);
                                      try {
                                        await api.patch(`/finance/salaries/${row.id}/pay`);
                                        reload();
                                      } catch (e) {
                                        setError(errorText(e));
                                      } finally {
                                        setBusy(false);
                                      }
                                    }}
                                  >
                                    Tandai dibayar
                                  </button>
                                )}
                                <button
                                  title="Lihat slip gaji"
                                  onClick={() => setSlip(row as Salary)}
                                >
                                  <Printer size={18} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ) : (
                          <tr key={row.id}>
                            <td>{dateTime((row as Entry).date)}</td>
                            <td>{(row as Entry).description}</td>
                            <td>
                              <span
                                className={`badge ${(row as Entry).type === 'INCOME' ? 'PAID' : 'PENDING'}`}
                              >
                                {(row as Entry).type === 'INCOME' ? 'Pemasukan' : 'Pengeluaran'}
                              </span>
                            </td>
                            <td>{rupiah(row.amount)}</td>
                          </tr>
                        ),
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              <Pager page={page} total={data.total} onChange={setPage} />
              <p className="muted">
                {salaries
                  ? 'Satu catatan gaji per karyawan per bulan.'
                  : 'Laporan kas berdasarkan pembayaran yang telah dikonfirmasi, transaksi manual, dan gaji yang telah dibayar. Batas periode menggunakan UTC.'}
              </p>
            </>
          )
        )}
      </div>
      {modal && (
        <div className="modal-backdrop">
          <section className="modal" role="dialog" aria-modal="true" aria-label="Input keuangan">
            <div className="row-between">
              <h2>{salaries ? 'Input gaji' : 'Catat transaksi'}</h2>
              <button aria-label="Tutup" onClick={() => setModal(false)}>
                <X />
              </button>
            </div>
            <Notice>{error}</Notice>
            <form onSubmit={save}>
              {salaries ? (
                <>
                  <label>
                    Karyawan
                    <select name="userId" required>
                      {employees?.map((u) => (
                        <option value={u.id} key={u.id}>
                          {u.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Periode
                    <input name="period" type="month" required defaultValue={month} />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Jenis
                    <select name="type">
                      <option value="EXPENSE">Pengeluaran</option>
                      <option value="INCOME">Pemasukan lain</option>
                    </select>
                  </label>
                  <label>
                    Keterangan
                    <input name="description" required minLength={3} maxLength={300} />
                  </label>
                  <label>
                    Tanggal
                    <input
                      name="date"
                      type="date"
                      required
                      defaultValue={new Date().toISOString().slice(0, 10)}
                    />
                  </label>
                </>
              )}
              <label>
                Nominal (Rp)
                <input name="amount" type="number" required min={1} max={100000000} />
              </label>
              <button className="btn full" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </form>
          </section>
        </div>
      )}
      {slip && (
        <div className="modal-backdrop slip-backdrop">
          <section className="modal salary-slip">
            <h2>SajiKlik · Slip Gaji</h2>
            <hr />
            <p>
              Nama: <strong>{slip.user.name}</strong>
            </p>
            <p>Jabatan: {slip.user.role}</p>
            <p>Periode: {slip.period}</p>
            <p>Status: {slip.status === 'PAID' ? 'Dibayar' : 'Belum dibayar'}</p>
            {slip.paidAt && <p>Tanggal bayar: {dateTime(slip.paidAt)}</p>}
            <div className="total-line">
              <span>Total gaji</span>
              <strong>{rupiah(slip.amount)}</strong>
            </div>
            <div className="row-actions no-print">
              <button className="btn" onClick={() => window.print()}>
                Cetak slip
              </button>
              <button className="btn secondary" onClick={() => setSlip(null)}>
                Tutup
              </button>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
