'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import { useAuth } from '@/context/AuthContext';
import {
  getMedicines,
  updateMedicine,
  addMedicine,
  initDB,
} from '@/database/db';
import {
  Medicine,
  MedicineCategory,
} from '@/database/schema';
import { formatRupiah, generateId } from '@/lib/formatters';

interface ImportedRow {
  nama_obat: string;
  bentuk_sediaan: string;
  satuan_dasar: string;
  satuan_tengah?: string;
  satuan_besar?: string;
  isi_per_strip?: number;
  strip_per_box?: number;
  harga_beli: number;
  harga_jual_box: number;
  harga_jual_strip?: number;
  stok_minimum: number;
  // Status matching
  status: 'UPDATE' | 'INSERT_BARU' | 'ERROR';
  errorMessage?: string;
}

export default function PricingPage() {
  const { isAdmin } = useAuth();
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Edit Modal State
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [editPrices, setEditPrices] = useState({
    buyPrice: 0,
    sellPrice: 0,
    sellPriceSecondary: 0,
    sellPriceBase: 0,
  });

  // Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [previewRows, setPreviewRows] = useState<ImportedRow[]>([]);
  const [fileName, setFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initDB();
    refreshData();
  }, []);

  const refreshData = () => {
    setMedicines(getMedicines());
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Quick Edit Modal
  const handleOpenEdit = (med: Medicine) => {
    setEditingMedicine(med);
    setEditPrices({
      buyPrice: med.buyPrice,
      sellPrice: med.sellPrice,
      sellPriceSecondary: med.sellPriceSecondary || 0,
      sellPriceBase: med.sellPriceBase || 0,
    });
  };

  const handleSavePrice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingMedicine) return;

    updateMedicine(editingMedicine.id, {
      buyPrice: Number(editPrices.buyPrice) || 0,
      sellPrice: Number(editPrices.sellPrice) || 0,
      sellPriceSecondary: editPrices.sellPriceSecondary ? Number(editPrices.sellPriceSecondary) : null,
      sellPriceBase: editPrices.sellPriceBase ? Number(editPrices.sellPriceBase) : null,
    });

    showNotification('success', `Harga obat ${editingMedicine.name} berhasil diperbarui.`);
    setEditingMedicine(null);
    refreshData();
  };

  // Download Template Excel
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        nama_obat: 'Paracetamol 500mg',
        bentuk_sediaan: 'TABLET',
        satuan_dasar: 'Tablet',
        satuan_tengah: 'Strip',
        satuan_besar: 'Box',
        isi_per_strip: 10,
        strip_per_box: 10,
        harga_beli: 25000,
        harga_jual_box: 35000,
        harga_jual_strip: 4000,
        stok_minimum: 100,
      },
      {
        nama_obat: 'Sanmol Sirup 60ml',
        bentuk_sediaan: 'SIRUP',
        satuan_dasar: 'Botol',
        satuan_tengah: '',
        satuan_besar: '',
        isi_per_strip: '',
        strip_per_box: '',
        harga_beli: 12000,
        harga_jual_box: 18000,
        harga_jual_strip: '',
        stok_minimum: 20,
      },
      {
        nama_obat: 'Bioplacenton Gel',
        bentuk_sediaan: 'SALEP',
        satuan_dasar: 'Tube',
        satuan_tengah: '',
        satuan_besar: '',
        isi_per_strip: '',
        strip_per_box: '',
        harga_beli: 18000,
        harga_jual_box: 28000,
        harga_jual_strip: '',
        stok_minimum: 15,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Obat');
    XLSX.writeFile(workbook, 'template_import_obat.xlsx');
    showNotification('success', 'Template Excel berhasil diunduh.');
  };

  // Export Data Katalog Obat ke Excel
  const handleExportData = () => {
    const exportData = medicines.map((m) => ({
      nama_obat: m.name,
      bentuk_sediaan: m.category,
      satuan_dasar: m.baseUnit,
      satuan_tengah: m.secondaryUnit || '',
      satuan_besar: m.tertiaryUnit || '',
      isi_per_strip: m.piecesPerSecondary || '',
      strip_per_box: m.secondaryPerTertiary || '',
      harga_beli: m.buyPrice,
      harga_jual_box: m.sellPrice,
      harga_jual_strip: m.sellPriceSecondary || '',
      stok_minimum: m.minStock,
    }));

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Katalog Obat');
    XLSX.writeFile(workbook, `katalog_harga_obat_${new Date().toISOString().split('T')[0]}.xlsx`);
    showNotification('success', 'Daftar harga obat berhasil diekspor ke Excel.');
  };

  // Handle File Upload (Excel / CSV)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const rawRows: any[] = XLSX.utils.sheet_to_json(sheet);

        if (rawRows.length === 0) {
          showNotification('error', 'File Excel kosong.');
          return;
        }

        const currentMedicines = getMedicines();
        const parsed: ImportedRow[] = rawRows.map((row) => {
          const nama = String(row.nama_obat || row.Nama || row.NAMA || '').trim();
          const buy = parseFloat(row.harga_beli || row.beli || 0);
          const sell = parseFloat(row.harga_jual_box || row.jual || 0);

          if (!nama) {
            return {
              nama_obat: '-',
              bentuk_sediaan: 'TABLET',
              satuan_dasar: 'Pcs',
              harga_beli: 0,
              harga_jual_box: 0,
              stok_minimum: 0,
              status: 'ERROR',
              errorMessage: 'Kolom nama_obat kosong',
            };
          }

          if (isNaN(sell) || sell < 0) {
            return {
              nama_obat: nama,
              bentuk_sediaan: String(row.bentuk_sediaan || 'TABLET').toUpperCase(),
              satuan_dasar: String(row.satuan_dasar || 'Tablet'),
              harga_beli: buy,
              harga_jual_box: sell,
              stok_minimum: parseInt(row.stok_minimum) || 10,
              status: 'ERROR',
              errorMessage: 'Harga jual tidak valid / negatif',
            };
          }

          const existingMed = currentMedicines.find((m) => m.name.toLowerCase() === nama.toLowerCase());

          return {
            nama_obat: nama,
            bentuk_sediaan: String(row.bentuk_sediaan || 'TABLET').toUpperCase(),
            satuan_dasar: String(row.satuan_dasar || (existingMed ? existingMed.baseUnit : 'Tablet')),
            satuan_tengah: row.satuan_tengah ? String(row.satuan_tengah) : existingMed?.secondaryUnit || undefined,
            satuan_besar: row.satuan_besar ? String(row.satuan_besar) : existingMed?.tertiaryUnit || undefined,
            isi_per_strip: row.isi_per_strip ? parseInt(row.isi_per_strip) : existingMed?.piecesPerSecondary || undefined,
            strip_per_box: row.strip_per_box ? parseInt(row.strip_per_box) : existingMed?.secondaryPerTertiary || undefined,
            harga_beli: isNaN(buy) ? 0 : buy,
            harga_jual_box: sell,
            harga_jual_strip: row.harga_jual_strip ? parseFloat(row.harga_jual_strip) : existingMed?.sellPriceSecondary || undefined,
            stok_minimum: parseInt(row.stok_minimum) || existingMed?.minStock || 10,
            status: existingMed ? 'UPDATE' : 'INSERT_BARU',
          };
        });

        setPreviewRows(parsed);
        setShowImportModal(true);
      } catch (err) {
        showNotification('error', 'Gagal membaca file spreadsheet. Pastikan format file benar.');
      }
    };
    reader.readAsBinaryString(file);
  };

  // Commit Import
  const handleCommitImport = () => {
    let updateCount = 0;
    let insertCount = 0;
    const currentMeds = getMedicines();

    for (const row of previewRows) {
      if (row.status === 'ERROR') continue;

      const existing = currentMeds.find((m) => m.name.toLowerCase() === row.nama_obat.toLowerCase());

      if (existing) {
        // Update Harga
        updateMedicine(existing.id, {
          buyPrice: row.harga_beli,
          sellPrice: row.harga_jual_box,
          sellPriceSecondary: row.harga_jual_strip || null,
          minStock: row.stok_minimum,
          updatedAt: new Date().toISOString(),
        });
        updateCount++;
      } else {
        // Tambah Obat Baru
        const categoryKey = Object.values(MedicineCategory).includes(row.bentuk_sediaan as MedicineCategory)
          ? (row.bentuk_sediaan as MedicineCategory)
          : MedicineCategory.TABLET;

        const newMed: Medicine = {
          id: 'med-' + generateId(),
          name: row.nama_obat,
          category: categoryKey,
          baseUnit: row.satuan_dasar,
          secondaryUnit: row.satuan_tengah || null,
          tertiaryUnit: row.satuan_besar || null,
          piecesPerSecondary: row.isi_per_strip || null,
          secondaryPerTertiary: row.strip_per_box || null,
          buyPrice: row.harga_beli,
          sellPrice: row.harga_jual_box,
          sellPriceSecondary: row.harga_jual_strip || null,
          sellPriceBase: null,
          minStock: row.stok_minimum,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addMedicine(newMed);
        insertCount++;
      }
    }

    showNotification(
      'success',
      `Import selesai: ${updateCount} obat diperbarui, ${insertCount} obat baru ditambahkan.`
    );
    setShowImportModal(false);
    setPreviewRows([]);
    if (fileInputRef.current) fileInputRef.current.value = '';
    refreshData();
  };

  const filteredMedicines = medicines.filter((m) =>
    m.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (!isAdmin) {
    return (
      <div className="card" style={{ maxWidth: '600px', margin: '40px auto', textAlign: 'center', padding: 'var(--sp-8)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '16px' }}>🔒</div>
        <h2>Akses Terbatas — Khusus Admin</h2>
        <p className="text-muted" style={{ margin: '12px 0 24px', lineHeight: 1.6 }}>
          Halaman Pengaturan Harga &amp; Import Katalog hanya dapat diakses oleh akun <strong>Admin (Apoteker Pengelola)</strong>.
          Sebagai Pegawai, Anda dapat mengoperasikan modul Kasir POS, Pelayanan Resep, dan Pergudangan.
        </p>
        <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
          <Link href="/pos" className="btn btn-primary">
            Ke Halaman Kasir POS
          </Link>
          <Link href="/gudang" className="btn btn-secondary">
            Ke Halaman Gudang
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Toast Notification */}
      {toast && (
        <div className="toast-container">
          <div className={`toast toast-${toast.type}`}>
            <span>{toast.message}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Penentuan Harga &amp; Import/Export File</h1>
          <p>
            Atur harga jual &amp; beli secara langsung (*inline/modal*), atau unggah file spreadsheet (Excel / CSV) untuk
            pembaruan massal.
          </p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-secondary" onClick={handleDownloadTemplate}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14v2a2 2 0 002 2h8a2 2 0 002-2v-2" strokeLinecap="round" />
              <polyline points="7 9 10 12 13 9" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="10" y1="2" x2="10" y2="12" strokeLinecap="round" />
            </svg>
            <span>Unduh Template Excel</span>
          </button>

          <button className="btn btn-secondary" onClick={handleExportData}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <line x1="3" y1="9" x2="17" y2="9" />
              <line x1="9" y1="3" x2="9" y2="17" />
            </svg>
            <span>Export Excel</span>
          </button>

          <label className="btn btn-primary" style={{ cursor: 'pointer' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 14v2a2 2 0 002 2h8a2 2 0 002-2v-2" strokeLinecap="round" />
              <polyline points="13 7 10 4 7 7" strokeLinecap="round" strokeLinejoin="round" />
              <line x1="10" y1="4" x2="10" y2="14" strokeLinecap="round" />
            </svg>
            <span>Import File Excel/CSV</span>
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx, .xls, .csv"
              style={{ display: 'none' }}
              onChange={handleFileUpload}
            />
          </label>
        </div>
      </div>

      {/* Search Bar */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div className="search-wrapper">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="9" cy="9" r="6" />
            <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            className="search-input"
            placeholder="Cari obat untuk edit harga..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Tabel Harga Obat */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama Obat</th>
              <th>Bentuk Sediaan</th>
              <th className="text-right">Harga Modal (Beli)</th>
              <th className="text-right">Harga Jual Satuan Utama</th>
              <th className="text-right">Harga Jual Strip</th>
              <th className="text-right">Estimasi Margin Keuntungan</th>
              <th className="text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredMedicines.map((med) => {
              const marginRp = med.sellPrice - med.buyPrice;
              const marginPercent = med.buyPrice > 0 ? ((marginRp / med.buyPrice) * 100).toFixed(1) : 0;

              return (
                <tr key={med.id}>
                  <td>
                    <strong>{med.name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{med.category}</span>
                  </td>
                  <td className="text-right text-muted">{formatRupiah(med.buyPrice)}</td>
                  <td className="text-right" style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                    {formatRupiah(med.sellPrice)}{' '}
                    <span className="text-xs text-muted">/ {med.tertiaryUnit || med.baseUnit}</span>
                  </td>
                  <td className="text-right">
                    {med.sellPriceSecondary ? formatRupiah(med.sellPriceSecondary) : '-'}
                  </td>
                  <td className="text-right">
                    <span style={{ color: marginRp >= 0 ? 'var(--green-600)' : 'var(--red-600)', fontWeight: 600 }}>
                      +{formatRupiah(marginRp)} ({marginPercent}%)
                    </span>
                  </td>
                  <td className="text-center">
                    <button className="btn btn-secondary btn-sm" onClick={() => handleOpenEdit(med)}>
                      Ubah Harga
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredMedicines.length === 0 && (
          <div className="empty-state">
            <p>Tidak ada data obat yang ditemukan.</p>
          </div>
        )}
      </div>

      {/* Modal Ubah Harga Cepat */}
      {editingMedicine && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Ubah Harga: {editingMedicine.name}</h2>
              <button className="modal-close" onClick={() => setEditingMedicine(null)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSavePrice}>
              <div className="modal-body">
                <div className="form-group">
                  <label className="form-label">Harga Modal Beli (Rp) *</label>
                  <input
                    type="number"
                    className="form-input"
                    value={editPrices.buyPrice}
                    onChange={(e) => setEditPrices({ ...editPrices, buyPrice: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>

                <div className="form-group">
                  <label className="form-label">
                    Harga Jual Satuan Utama ({editingMedicine.tertiaryUnit || editingMedicine.baseUnit}) (Rp) *
                  </label>
                  <input
                    type="number"
                    className="form-input"
                    value={editPrices.sellPrice}
                    onChange={(e) => setEditPrices({ ...editPrices, sellPrice: parseFloat(e.target.value) || 0 })}
                    required
                  />
                </div>

                {editingMedicine.secondaryUnit && (
                  <div className="form-group">
                    <label className="form-label">Harga Jual per Strip (Rp)</label>
                    <input
                      type="number"
                      className="form-input"
                      value={editPrices.sellPriceSecondary}
                      onChange={(e) =>
                        setEditPrices({ ...editPrices, sellPriceSecondary: parseFloat(e.target.value) || 0 })
                      }
                    />
                  </div>
                )}

                {(editingMedicine.secondaryUnit || editingMedicine.tertiaryUnit) && (() => {
                  const pieces =
                    (editingMedicine.piecesPerSecondary ?? 1) * (editingMedicine.secondaryPerTertiary ?? 1);
                  const autoPrice = Math.round(editPrices.sellPrice / pieces);
                  return (
                    <div className="form-group">
                      <label className="form-label">Harga Jual per {editingMedicine.baseUnit} (Rp)</label>
                      <input
                        type="number"
                        className="form-input"
                        value={editPrices.sellPriceBase || ''}
                        placeholder={`Otomatis: ${formatRupiah(autoPrice)}`}
                        onChange={(e) =>
                          setEditPrices({ ...editPrices, sellPriceBase: parseFloat(e.target.value) || 0 })
                        }
                      />
                      <div className="text-xs text-muted" style={{ marginTop: '4px' }}>
                        Kosongkan agar dihitung otomatis dari harga {editingMedicine.tertiaryUnit || 'satuan utama'} ({pieces}{' '}
                        {editingMedicine.baseUnit}).
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setEditingMedicine(null)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  Simpan Harga Baru
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Preview Import Excel/CSV */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide">
            <div className="modal-header">
              <div>
                <h2>Pratinjau Import Spreadsheet</h2>
                <div className="text-xs text-muted">File: {fileName} ({previewRows.length} baris data)</div>
              </div>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ maxHeight: '60vh', overflowY: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama Obat</th>
                    <th>Aksi Sistem</th>
                    <th className="text-right">Harga Beli</th>
                    <th className="text-right">Harga Jual Box</th>
                    <th className="text-right">Harga Jual Strip</th>
                    <th>Status Validasi</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.map((row, idx) => (
                    <tr key={idx}>
                      <td><strong>{row.nama_obat}</strong></td>
                      <td>
                        {row.status === 'UPDATE' && <span className="badge badge-info">Update Harga</span>}
                        {row.status === 'INSERT_BARU' && <span className="badge badge-safe">Obat Baru</span>}
                        {row.status === 'ERROR' && <span className="badge badge-expired">Error</span>}
                      </td>
                      <td className="text-right">{formatRupiah(row.harga_beli)}</td>
                      <td className="text-right" style={{ fontWeight: 600 }}>{formatRupiah(row.harga_jual_box)}</td>
                      <td className="text-right">{row.harga_jual_strip ? formatRupiah(row.harga_jual_strip) : '-'}</td>
                      <td>
                        {row.status === 'ERROR' ? (
                          <span className="text-xs" style={{ color: 'var(--red-600)' }}>
                            {row.errorMessage}
                          </span>
                        ) : (
                          <span className="text-xs" style={{ color: 'var(--green-600)' }}>
                            Valid siap commit
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowImportModal(false)}>
                Batalkan
              </button>
              <button type="button" className="btn btn-primary" onClick={handleCommitImport}>
                Terapkan Pembaruan ke Database
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
