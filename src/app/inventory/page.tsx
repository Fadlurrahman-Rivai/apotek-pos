'use client';

import { useState, useEffect } from 'react';
import {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
  getTotalStock,
  addMutation,
  getBestBatchForSale,
  initDB,
} from '@/database/db';
import {
  Medicine,
  MedicineCategory,
  MutationType,
} from '@/database/schema';
import { formatRupiah, generateId } from '@/lib/formatters';

export default function InventoryPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Modal State: Tambah/Edit
  const [showModal, setShowModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState<Medicine | null>(null);
  const [formData, setFormData] = useState<Partial<Medicine>>({
    name: '',
    category: MedicineCategory.TABLET,
    baseUnit: 'Tablet',
    secondaryUnit: 'Strip',
    tertiaryUnit: 'Box',
    piecesPerSecondary: 10,
    secondaryPerTertiary: 10,
    buyPrice: 0,
    sellPrice: 0,
    sellPriceSecondary: 0,
    sellPriceBase: 0,
    minStock: 50,
  });

  // Modal State: Unbox
  const [showUnboxModal, setShowUnboxModal] = useState(false);
  const [unboxMedicine, setUnboxMedicine] = useState<Medicine | null>(null);
  const [unboxBoxCount, setUnboxBoxCount] = useState(1);

  useEffect(() => {
    initDB();
    refreshData();
    const handleSync = () => refreshData();
    window.addEventListener('apotek-cloud-synced', handleSync);
    return () => window.removeEventListener('apotek-cloud-synced', handleSync);
  }, []);

  const refreshData = () => {
    setMedicines(getMedicines());
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleOpenAdd = () => {
    setEditingMedicine(null);
    setFormData({
      name: '',
      category: MedicineCategory.TABLET,
      baseUnit: 'Tablet',
      secondaryUnit: 'Strip',
      tertiaryUnit: 'Box',
      piecesPerSecondary: 10,
      secondaryPerTertiary: 10,
      buyPrice: 0,
      sellPrice: 0,
      sellPriceSecondary: 0,
      sellPriceBase: 0,
      minStock: 50,
    });
    setShowModal(true);
  };

  const handleOpenEdit = (med: Medicine) => {
    setEditingMedicine(med);
    setFormData({ ...med });
    setShowModal(true);
  };

  const handleCategoryChange = (cat: MedicineCategory) => {
    // Default units based on category
    if (cat === MedicineCategory.SIRUP) {
      setFormData((prev) => ({
        ...prev,
        category: cat,
        baseUnit: 'Botol',
        secondaryUnit: null,
        tertiaryUnit: null,
        piecesPerSecondary: null,
        secondaryPerTertiary: null,
        sellPriceSecondary: null,
        sellPriceBase: null,
      }));
    } else if (cat === MedicineCategory.SALEP) {
      setFormData((prev) => ({
        ...prev,
        category: cat,
        baseUnit: 'Tube',
        secondaryUnit: null,
        tertiaryUnit: null,
        piecesPerSecondary: null,
        secondaryPerTertiary: null,
        sellPriceSecondary: null,
        sellPriceBase: null,
      }));
    } else if (cat === MedicineCategory.TETES) {
      setFormData((prev) => ({
        ...prev,
        category: cat,
        baseUnit: 'Botol',
        secondaryUnit: null,
        tertiaryUnit: null,
        piecesPerSecondary: null,
        secondaryPerTertiary: null,
        sellPriceSecondary: null,
        sellPriceBase: null,
      }));
    } else {
      setFormData((prev) => ({
        ...prev,
        category: cat,
        baseUnit: 'Tablet',
        secondaryUnit: 'Strip',
        tertiaryUnit: 'Box',
        piecesPerSecondary: 10,
        secondaryPerTertiary: 10,
      }));
    }
  };

  const handleSaveMedicine = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name || !formData.baseUnit || !formData.sellPrice) {
      showNotification('error', 'Nama obat, satuan dasar, dan harga jual wajib diisi.');
      return;
    }

    if (editingMedicine) {
      updateMedicine(editingMedicine.id, formData);
      showNotification('success', `Data obat ${formData.name} berhasil diperbarui.`);
    } else {
      const newMed: Medicine = {
        id: 'med-' + generateId(),
        name: formData.name,
        category: formData.category || MedicineCategory.TABLET,
        baseUnit: formData.baseUnit,
        secondaryUnit: formData.secondaryUnit || null,
        tertiaryUnit: formData.tertiaryUnit || null,
        piecesPerSecondary: formData.piecesPerSecondary || null,
        secondaryPerTertiary: formData.secondaryPerTertiary || null,
        buyPrice: Number(formData.buyPrice) || 0,
        sellPrice: Number(formData.sellPrice) || 0,
        sellPriceSecondary: formData.sellPriceSecondary ? Number(formData.sellPriceSecondary) : null,
        sellPriceBase: formData.sellPriceBase ? Number(formData.sellPriceBase) : null,
        minStock: Number(formData.minStock) || 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      addMedicine(newMed);
      showNotification('success', `Obat baru ${formData.name} berhasil ditambahkan.`);
    }

    setShowModal(false);
    refreshData();
  };

  const handleDelete = (med: Medicine) => {
    if (confirm(`Apakah Anda yakin ingin menghapus data obat "${med.name}"?`)) {
      deleteMedicine(med.id);
      showNotification('success', `Obat ${med.name} telah dihapus.`);
      refreshData();
    }
  };

  // Unbox handler
  const handleOpenUnbox = (med: Medicine) => {
    setUnboxMedicine(med);
    setUnboxBoxCount(1);
    setShowUnboxModal(true);
  };

  const handleConfirmUnbox = () => {
    if (!unboxMedicine) return;
    const piecesPerStrip = unboxMedicine.piecesPerSecondary ?? 1;
    const stripsPerBox = unboxMedicine.secondaryPerTertiary ?? 1;
    const totalBaseUnitsPerBox = piecesPerStrip * stripsPerBox;
    const totalBaseNeeded = unboxBoxCount * totalBaseUnitsPerBox;
    const currentStock = getTotalStock(unboxMedicine.id);

    if (totalBaseNeeded > currentStock) {
      showNotification('error', `Stok tidak mencukupi untuk membuka ${unboxBoxCount} Box.`);
      return;
    }

    const batch = getBestBatchForSale(unboxMedicine.id);

    // Catat mutasi unboxing
    addMutation({
      id: generateId(),
      medicineId: unboxMedicine.id,
      batchId: batch ? batch.id : null,
      mutationType: MutationType.UNBOX,
      qtyChange: 0, // Total stok fisik tablet sama, tapi bentuk kemasan di etalase dipecah
      unitUsed: `${unboxBoxCount} Box ➔ ${unboxBoxCount * stripsPerBox} Strip`,
      referenceNumber: `UNBOX-${Date.now().toString().slice(-6)}`,
      notes: `Buka ${unboxBoxCount} Box menjadi ${unboxBoxCount * stripsPerBox} Strip (${unboxBoxCount * totalBaseUnitsPerBox} ${unboxMedicine.baseUnit}) untuk etalase/racik`,
      createdAt: new Date().toISOString(),
    });

    showNotification(
      'success',
      `Berhasil memecah ${unboxBoxCount} Box ${unboxMedicine.name} menjadi ${unboxBoxCount * stripsPerBox} Strip.`
    );
    setShowUnboxModal(false);
  };

  const filteredMedicines = medicines.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = categoryFilter === 'ALL' || m.category === categoryFilter;
    return matchesSearch && matchesCategory;
  });

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
          <h1>Katalog Obat &amp; Sediaan</h1>
          <p>Kelola master data obat, bentuk sediaan, hierarki satuan kemasan bertingkat, dan aksi pecah satuan.</p>
        </div>
        <div className="page-header-actions">
          <button className="btn btn-primary" onClick={handleOpenAdd}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
              <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
            </svg>
            <span>Tambah Obat Baru</span>
          </button>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="card" style={{ marginBottom: 'var(--sp-6)' }}>
        <div style={{ display: 'flex', gap: 'var(--sp-4)', flexWrap: 'wrap', alignItems: 'center' }}>
          <div className="search-wrapper" style={{ flex: 1, minWidth: '280px' }}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="9" cy="9" r="6" />
              <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              className="search-input"
              placeholder="Cari nama obat atau sediaan..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <div className="filter-tabs" style={{ marginBottom: 0 }}>
            {['ALL', ...Object.values(MedicineCategory)].map((cat) => (
              <button
                key={cat}
                className={`filter-tab ${categoryFilter === cat ? 'active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {cat === 'ALL' ? 'Semua' : cat}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Medicines Table */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nama Obat</th>
              <th>Sediaan</th>
              <th>Hierarki Satuan</th>
              <th className="text-right">Harga Modal</th>
              <th className="text-right">Harga Jual</th>
              <th className="text-right">Total Stok</th>
              <th>Status Stok</th>
              <th className="text-center">Aksi</th>
            </tr>
          </thead>
          <tbody>
            {filteredMedicines.map((med) => {
              const stock = getTotalStock(med.id);
              const isLow = stock <= med.minStock;
              const isOut = stock === 0;

              return (
                <tr key={med.id}>
                  <td>
                    <strong>{med.name}</strong>
                  </td>
                  <td>
                    <span className="badge badge-neutral">{med.category}</span>
                  </td>
                  <td className="text-sm">
                    {med.tertiaryUnit && med.secondaryUnit ? (
                      <span>
                        1 {med.tertiaryUnit} = {med.secondaryPerTertiary} {med.secondaryUnit} ={' '}
                        {(med.secondaryPerTertiary ?? 1) * (med.piecesPerSecondary ?? 1)} {med.baseUnit}
                      </span>
                    ) : (
                      <span>Satuan Tunggal ({med.baseUnit})</span>
                    )}
                  </td>
                  <td className="text-right text-muted">{formatRupiah(med.buyPrice)}</td>
                  <td className="text-right" style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                    {formatRupiah(med.sellPrice)}
                    {med.sellPriceSecondary && (
                      <div className="text-xs text-muted">Strip: {formatRupiah(med.sellPriceSecondary)}</div>
                    )}
                  </td>
                  <td className="text-right" style={{ fontWeight: 700 }}>
                    {stock} <span className="text-xs text-muted">{med.baseUnit}</span>
                  </td>
                  <td>
                    {isOut ? (
                      <span className="badge badge-expired">Habis</span>
                    ) : isLow ? (
                      <span className="badge badge-critical">Menipis (&le; {med.minStock})</span>
                    ) : (
                      <span className="badge badge-safe">Aman</span>
                    )}
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                      {med.tertiaryUnit && med.secondaryUnit && (
                        <button
                          className="btn btn-secondary btn-sm"
                          title="Pecah Box Menjadi Strip"
                          onClick={() => handleOpenUnbox(med)}
                        >
                          Buka Box
                        </button>
                      )}
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => handleOpenEdit(med)}
                      >
                        Edit
                      </button>
                      <button
                        className="btn btn-ghost btn-sm"
                        style={{ color: 'var(--red-600)' }}
                        onClick={() => handleDelete(med)}
                      >
                        Hapus
                      </button>
                    </div>
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

      {/* Modal Tambah / Edit Obat */}
      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide">
            <div className="modal-header">
              <h2>{editingMedicine ? 'Edit Data Obat' : 'Tambah Obat Baru'}</h2>
              <button className="modal-close" onClick={() => setShowModal(false)}>
                &times;
              </button>
            </div>
            <form onSubmit={handleSaveMedicine}>
              <div className="modal-body">
                <div className="form-row">
                  <div className="form-group">
                    <label className="form-label">Nama Obat *</label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="Contoh: Paracetamol 500mg"
                      value={formData.name || ''}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      required
                    />
                  </div>

                  <div className="form-group">
                    <label className="form-label">Bentuk Sediaan *</label>
                    <select
                      className="form-select"
                      value={formData.category}
                      onChange={(e) => handleCategoryChange(e.target.value as MedicineCategory)}
                    >
                      {Object.values(MedicineCategory).map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div style={{ borderTop: '1px solid var(--slate-200)', paddingTop: 'var(--sp-4)' }}>
                  <h4 style={{ marginBottom: 'var(--sp-3)' }}>Hierarki Satuan Kemasan</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Satuan Terkecil / Dasar *</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Contoh: Tablet, Botol, Tube"
                        value={formData.baseUnit || ''}
                        onChange={(e) => setFormData({ ...formData, baseUnit: e.target.value })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Satuan Menengah (Opsional)</label>
                      <input
                        type="text"
                        className="form-input"
                        placeholder="Contoh: Strip (kosongkan jika sirup/salep)"
                        value={formData.secondaryUnit || ''}
                        onChange={(e) => setFormData({ ...formData, secondaryUnit: e.target.value || null })}
                      />
                    </div>
                  </div>

                  {formData.secondaryUnit && (
                    <div className="form-row" style={{ marginTop: 'var(--sp-3)' }}>
                      <div className="form-group">
                        <label className="form-label">Satuan Besar / Kemasan Luar</label>
                        <input
                          type="text"
                          className="form-input"
                          placeholder="Contoh: Box"
                          value={formData.tertiaryUnit || ''}
                          onChange={(e) => setFormData({ ...formData, tertiaryUnit: e.target.value || null })}
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Isi per Strip (Pcs/Strip)</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="10"
                          value={formData.piecesPerSecondary || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              piecesPerSecondary: parseInt(e.target.value) || null,
                            })
                          }
                        />
                      </div>
                      <div className="form-group">
                        <label className="form-label">Strip per Box</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="10"
                          value={formData.secondaryPerTertiary || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              secondaryPerTertiary: parseInt(e.target.value) || null,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>

                <div style={{ borderTop: '1px solid var(--slate-200)', paddingTop: 'var(--sp-4)' }}>
                  <h4 style={{ marginBottom: 'var(--sp-3)' }}>Harga &amp; Batas Minimum</h4>
                  <div className="form-row">
                    <div className="form-group">
                      <label className="form-label">Harga Modal Beli (Rp) *</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="45000"
                        value={formData.buyPrice || ''}
                        onChange={(e) => setFormData({ ...formData, buyPrice: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>
                    <div className="form-group">
                      <label className="form-label">Harga Jual Satuan Utama / Box (Rp) *</label>
                      <input
                        type="number"
                        className="form-input"
                        placeholder="55000"
                        value={formData.sellPrice || ''}
                        onChange={(e) => setFormData({ ...formData, sellPrice: parseFloat(e.target.value) || 0 })}
                        required
                      />
                    </div>
                  </div>

                  {formData.secondaryUnit && (
                    <div className="form-row" style={{ marginTop: 'var(--sp-3)' }}>
                      <div className="form-group">
                        <label className="form-label">Harga Jual per Strip (Rp)</label>
                        <input
                          type="number"
                          className="form-input"
                          placeholder="6000"
                          value={formData.sellPriceSecondary || ''}
                          onChange={(e) =>
                            setFormData({
                              ...formData,
                              sellPriceSecondary: parseFloat(e.target.value) || null,
                            })
                          }
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="modal-footer">
                <button type="button" className="btn btn-secondary" onClick={() => setShowModal(false)}>
                  Batal
                </button>
                <button type="submit" className="btn btn-primary">
                  {editingMedicine ? 'Simpan Perubahan' : 'Tambah Obat'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Unbox (Buka Kemasan Box jadi Strip) */}
      {showUnboxModal && unboxMedicine && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h2>Buka Box Menjadi Strip (Unboxing)</h2>
              <button className="modal-close" onClick={() => setShowUnboxModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p>
                Membuka kemasan Box obat <strong>{unboxMedicine.name}</strong> untuk dipajang di etalase penjualan atau
                meja peracikan resep.
              </p>

              <div className="card card-compact" style={{ background: 'var(--slate-50)' }}>
                <div>Rasio Konversi: <strong>1 Box = {unboxMedicine.secondaryPerTertiary} Strip</strong></div>
                <div>Isi per Strip: <strong>{unboxMedicine.piecesPerSecondary} {unboxMedicine.baseUnit}</strong></div>
              </div>

              <div className="form-group">
                <label className="form-label">Jumlah Box yang Ingin Dibuka:</label>
                <input
                  type="number"
                  min="1"
                  className="form-input"
                  value={unboxBoxCount}
                  onChange={(e) => setUnboxBoxCount(parseInt(e.target.value) || 1)}
                />
              </div>

              <div className="badge badge-info" style={{ alignSelf: 'flex-start', padding: '6px 12px' }}>
                Hasil Pecahan: +{(unboxMedicine.secondaryPerTertiary ?? 1) * unboxBoxCount} Strip ({((unboxMedicine.secondaryPerTertiary ?? 1) * (unboxMedicine.piecesPerSecondary ?? 1) * unboxBoxCount)} {unboxMedicine.baseUnit})
              </div>
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-secondary" onClick={() => setShowUnboxModal(false)}>
                Batal
              </button>
              <button type="button" className="btn btn-primary" onClick={handleConfirmUnbox}>
                Konfirmasi Buka Box
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
