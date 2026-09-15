import { useState, type FormEvent } from 'react';
import { Save } from 'lucide-react';
import { api, errorText } from '../lib';
import { Loading, Notice, PageTitle, useLoad } from '../components/UI';
import type { Settings } from '../types';
export default function SiteSettings() {
  const { data: s, error: loadError } = useLoad<Settings>('/settings');
  const [error, setError] = useState(''),
    [success, setSuccess] = useState(''),
    [busy, setBusy] = useState(false);
  async function save(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError('');
    setSuccess('');
    try {
      const form = new FormData(e.currentTarget),
        payload: Record<string, unknown> = { ...s };
      for (const key of [
        'storeName',
        'address',
        'contact',
        'openingHours',
        'primaryColor',
        'secondaryColor',
        'bankInfo',
      ])
        payload[key] = form.get(key);
      for (const key of ['logoUrl', 'faviconUrl', 'iconUrl', 'qrisUrl']) {
        const file = form.get(key) as File;
        if (file?.size) {
          const data = new FormData();
          data.append('file', file);
          payload[key] = (await api.post('/uploads', data)).data.url;
        }
      }
      await api.patch('/settings', payload);
      document.documentElement.style.setProperty('--primary', String(payload.primaryColor));
      document.documentElement.style.setProperty('--accent', String(payload.secondaryColor));
      setSuccess('Pengaturan tersimpan. Muat ulang halaman untuk memperbarui seluruh branding.');
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <PageTitle eyebrow="SUPERADMIN" title="Pengaturan toko" />
      <Notice>{error || loadError}</Notice>
      <Notice good>{success}</Notice>
      {!s ? (
        <Loading />
      ) : (
        <form onSubmit={save} className="settings-grid">
          <section className="panel">
            <h2>Identitas toko</h2>
            <label>
              Nama toko
              <input
                name="storeName"
                required
                minLength={2}
                maxLength={80}
                defaultValue={s.storeName}
              />
            </label>
            <label>
              Alamat
              <textarea name="address" maxLength={300} defaultValue={s.address} />
            </label>
            <label>
              Kontak
              <input name="contact" maxLength={100} defaultValue={s.contact} />
            </label>
            <label>
              Jam operasional
              <input name="openingHours" maxLength={200} defaultValue={s.openingHours} />
            </label>
            <label>
              Informasi rekening transfer
              <textarea
                name="bankInfo"
                maxLength={300}
                placeholder="Bank, nomor rekening, dan nama pemilik"
                defaultValue={s.bankInfo}
              />
            </label>
          </section>
          <section className="panel">
            <h2>Tampilan & aset</h2>
            <div className="form-grid">
              <label>
                Warna utama
                <input name="primaryColor" type="color" defaultValue={s.primaryColor} />
              </label>
              <label>
                Warna sekunder
                <input name="secondaryColor" type="color" defaultValue={s.secondaryColor} />
              </label>
            </div>
            {[
              { key: 'logoUrl', label: 'Logo' },
              { key: 'faviconUrl', label: 'Favicon' },
              { key: 'iconUrl', label: 'Icon aplikasi' },
              { key: 'qrisUrl', label: 'QRIS toko' },
            ].map((f) => (
              <label key={f.key}>
                {f.label}
                {s[f.key as keyof Settings] && (
                  <img className="asset-preview" src={s[f.key as keyof Settings]!} alt={f.label} />
                )}
                <input name={f.key} type="file" accept="image/png,image/jpeg,image/webp" />
              </label>
            ))}
            <small>
              PNG, JPEG, atau WebP, maksimal 3 MB per gambar. Icon aplikasi digunakan sebagai ikon
              layar utama; aplikasi belum mendukung mode offline.
            </small>
          </section>
          <button className="btn" disabled={busy}>
            <Save size={18} />
            {busy ? 'Menyimpan…' : 'Simpan pengaturan'}
          </button>
        </form>
      )}
    </>
  );
}
