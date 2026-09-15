import { useState, type FormEvent } from 'react';
import { Plus, X, Pencil, Trash2 } from 'lucide-react';
import { api, dateTime, errorText, rupiah, useAuth } from '../lib';
import { Empty, Loading, Notice, PageTitle, Pager, useLoad } from '../components/UI';
import type { Category, Menu, Page, User } from '../types';
type Log = {
  id: string;
  user: { name: string };
  action: string;
  description: string;
  createdAt: string;
};
export default function Management({ kind }: { kind: 'menus' | 'users' | 'logs' }) {
  const [page, setPage] = useState(1),
    [edit, setEdit] = useState<Menu | User | false | null>(null),
    [error, setError] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false);
  const {
    data,
    loading,
    error: loadError,
    reload,
  } = useLoad<Page<Menu | User | Log>>(`/${kind}?page=${page}&manage=true`);
  const { data: categories, reload: reloadCategories } = useLoad<Category[]>('/categories');
  const user = useAuth((s) => s.user)!;
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const form = new FormData(e.currentTarget);
    const f = Object.fromEntries(form);
    try {
      let payload: Record<string, unknown>;
      if (kind === 'menus') {
        let imageUrl = (edit as Menu)?.imageUrl ?? null;
        const file = form.get('image') as File;
        if (file?.size) {
          const upload = new FormData();
          upload.append('file', file);
          imageUrl = (await api.post('/uploads', upload)).data.url;
        }
        payload = {
          name: f.name,
          description: f.description,
          price: Number(f.price),
          stock: Number(f.stock),
          categoryId: f.categoryId,
          isAvailable: f.isAvailable === 'on',
          imageUrl,
        };
      } else
        payload = {
          name: f.name,
          email: f.email,
          phone: f.phone || null,
          role: f.role,
          ...(edit ? { isActive: f.isActive === 'on' } : {}),
        };
      const r = edit
        ? await api.patch(`/${kind}/${edit.id}`, payload)
        : await api.post(`/${kind}`, payload);
      setMessage(
        r.data.temporaryPassword
          ? `Password sementara (salin sekarang): ${r.data.temporaryPassword}`
          : 'Data berhasil disimpan.',
      );
      setEdit(null);
      reload();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  async function action(id: string, remove = false) {
    if (
      !confirm(
        remove
          ? 'Arsipkan menu ini? Riwayat pesanan tetap tersimpan.'
          : 'Reset password pengguna ini dan akhiri semua sesinya?',
      )
    )
      return;
    try {
      if (remove) await api.delete(`/menus/${id}`);
      else {
        const r = await api.patch(`/users/${id}`, { resetPassword: true });
        setMessage(`Password sementara (salin sekarang): ${r.data.temporaryPassword}`);
      }
      reload();
    } catch (e) {
      setError(errorText(e));
    }
  }
  return (
    <>
      <PageTitle
        eyebrow="MANAJEMEN"
        title={
          kind === 'menus' ? 'Kelola menu' : kind === 'users' ? 'Kelola pengguna' : 'Log aktivitas'
        }
      >
        {kind !== 'logs' && (
          <div className="row-actions">
            {kind === 'menus' && (
              <button
                className="btn secondary"
                onClick={async () => {
                  const name = prompt('Nama kategori baru:');
                  if (name)
                    try {
                      await api.post('/categories', { name });
                      reloadCategories();
                    } catch (e) {
                      setError(errorText(e));
                    }
                }}
              >
                Tambah kategori
              </button>
            )}
            <button
              className="btn"
              onClick={() => {
                setEdit(false);
                setError('');
              }}
            >
              <Plus size={17} /> Tambah {kind === 'menus' ? 'menu' : 'pengguna'}
            </button>
          </div>
        )}
      </PageTitle>
      <Notice>{error || loadError}</Notice>
      <Notice good>{message}</Notice>
      {loading ? (
        <Loading />
      ) : !data?.rows.length ? (
        <Empty>Belum ada data.</Empty>
      ) : (
        <div className="panel table-wrap">
          <table>
            <thead>
              <tr>
                {(kind === 'menus'
                  ? ['Menu', 'Kategori', 'Harga', 'Stok', 'Status', 'Aksi']
                  : kind === 'users'
                    ? ['Nama', 'Email', 'Role', 'Status', 'Aksi']
                    : ['Waktu', 'Pengguna', 'Aktivitas', 'Keterangan']
                ).map((h) => (
                  <th key={h}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) =>
                kind === 'menus' ? (
                  <tr key={row.id}>
                    <td>
                      <strong>{(row as Menu).name}</strong>
                    </td>
                    <td>{(row as Menu).category.name}</td>
                    <td>{rupiah((row as Menu).price)}</td>
                    <td>{(row as Menu).stock}</td>
                    <td>
                      <span className={`badge ${(row as Menu).isAvailable ? 'PAID' : 'PENDING'}`}>
                        {(row as Menu).isAvailable ? 'Aktif' : 'Disembunyikan'}
                      </span>
                    </td>
                    <td>
                      <div className="row-actions">
                        <button title="Edit menu" onClick={() => setEdit(row as Menu)}>
                          <Pencil size={17} />
                        </button>
                        <button title="Arsipkan menu" onClick={() => action(row.id, true)}>
                          <Trash2 size={17} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ) : kind === 'users' ? (
                  <tr key={row.id}>
                    <td>
                      <strong>{(row as User).name}</strong>
                    </td>
                    <td>{(row as User).email}</td>
                    <td>
                      <span className="badge">{(row as User).role}</span>
                    </td>
                    <td>{(row as User).isActive ? 'Aktif' : 'Nonaktif'}</td>
                    <td>
                      {row.id !== user.id && (
                        <div className="row-actions">
                          <button title="Edit pengguna" onClick={() => setEdit(row as User)}>
                            <Pencil size={17} />
                          </button>
                          <button className="text-link" onClick={() => action(row.id)}>
                            Reset password
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                ) : (
                  <tr key={row.id}>
                    <td>{dateTime((row as Log).createdAt)}</td>
                    <td>{(row as Log).user.name}</td>
                    <td>{(row as Log).action}</td>
                    <td>{(row as Log).description}</td>
                  </tr>
                ),
              )}
            </tbody>
          </table>
        </div>
      )}
      {data && <Pager page={page} total={data.total} onChange={setPage} />}{' '}
      {edit !== null && (
        <div className="modal-backdrop">
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={edit ? 'Edit data' : 'Tambah data'}
          >
            <div className="row-between">
              <h2>
                {edit ? 'Edit' : 'Tambah'} {kind === 'menus' ? 'menu' : 'pengguna'}
              </h2>
              <button aria-label="Tutup" onClick={() => setEdit(null)}>
                <X />
              </button>
            </div>
            <Notice>{error}</Notice>
            <form onSubmit={save}>
              <label>
                Nama
                <input
                  name="name"
                  required
                  minLength={2}
                  maxLength={100}
                  defaultValue={edit ? edit.name : ''}
                />
              </label>
              {kind === 'menus' ? (
                <>
                  <label>
                    Deskripsi
                    <textarea
                      name="description"
                      maxLength={1000}
                      defaultValue={(edit as Menu)?.description ?? ''}
                    />
                  </label>
                  <div className="form-grid">
                    <label>
                      Harga (Rp)
                      <input
                        name="price"
                        type="number"
                        min={0}
                        max={100000000}
                        required
                        defaultValue={(edit as Menu)?.price ?? 0}
                      />
                    </label>
                    <label>
                      Stok
                      <input
                        name="stock"
                        type="number"
                        min={0}
                        max={100000}
                        required
                        defaultValue={(edit as Menu)?.stock ?? 0}
                      />
                    </label>
                  </div>
                  <label>
                    Kategori
                    <select
                      name="categoryId"
                      required
                      defaultValue={(edit as Menu)?.categoryId ?? categories?.[0]?.id}
                    >
                      {categories?.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Foto menu (maks. 3 MB)
                    <input name="image" type="file" accept="image/png,image/jpeg,image/webp" />
                  </label>
                  <label className="checkbox">
                    <input
                      name="isAvailable"
                      type="checkbox"
                      defaultChecked={edit ? (edit as Menu).isAvailable : true}
                    />{' '}
                    Tampilkan menu
                  </label>
                </>
              ) : (
                <>
                  <label>
                    Email
                    <input
                      name="email"
                      type="email"
                      required
                      defaultValue={(edit as User)?.email ?? ''}
                    />
                  </label>
                  <label>
                    Nomor HP
                    <input
                      name="phone"
                      pattern="\+?[0-9]{8,15}"
                      defaultValue={(edit as User)?.phone ?? ''}
                    />
                  </label>
                  <label>
                    Role
                    <select name="role" defaultValue={(edit as User)?.role ?? 'KASIR'}>
                      {(user.role === 'SUPERADMIN'
                        ? ['PEMBELI', 'KASIR', 'CHEF', 'FINANCE', 'ADMIN', 'SUPERADMIN']
                        : ['KASIR', 'CHEF', 'FINANCE']
                      ).map((r) => (
                        <option key={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  {edit && (
                    <label className="checkbox">
                      <input
                        name="isActive"
                        type="checkbox"
                        defaultChecked={(edit as User).isActive}
                      />{' '}
                      Akun aktif
                    </label>
                  )}
                  <p className="muted">
                    Akun baru mendapatkan password sementara yang wajib diganti saat login pertama.
                  </p>
                </>
              )}
              <button className="btn full" disabled={busy}>
                {busy ? 'Menyimpan…' : 'Simpan'}
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
