'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getMedicines,
  getBatches,
  getMutations,
  addBatch,
  addMutation,
  reduceStock,
  initDB,
} from '@/database/db';
import {
  Medicine,
  StockBatch,
  StockMutation,
  BatchStatus,
  MutationType,
} from '@/database/schema';
import { toBaseUnit, getAvailableUnits } from '@/features/inventory/utils/conversion';
import {
  formatDate,
  formatDateInput,
  generateId,
  daysUntilExpiry,
} from '@/lib/formatters';

export default function WarehousePage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [mutations, setMutations] = useState<StockMutation[]>([]);
  const [activeTab, setActiveTab] = useState<'MASUK' | 'MUTASI' | 'KOREKSI'>('MASUK');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Form Input Barang Masuk
  const [receivingForm, setReceivingForm] = useState({
    medicineId: '',
    batchNumber: '',
    expiryDate: '',
    unit: '',
    quantity: 1 as number | '',
    supplierName: '',
  });

  // Form Koreksi Stok Rusak
  const [damageForm, setDamageForm] = useState({
    batchId: '',
    quantity: 1,
    reason: 'Botol sirup pecah saat penataan etalase',
  });

  useEffect(() => {
    initDB();
    refreshData();
  }, []);

  const refreshData = () => {
    const meds = getMedicines();
    setMedicines(meds);
    setBatches(getBatches());
    setMutations(getMutations().reverse()); // newest first

    if (meds.length > 0 && !receivingForm.medicineId) {
      const firstMed = meds[0];
      const units = getAvailableUnits(firstMed);
      setReceivingForm((prev) => ({
        ...prev,
        medicineId: firstMed.id,
        unit: units[0] || firstMed.baseUnit,
      }));
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMedicineChange = (medId: string) => {
    const med = medicines.find((m) => m.id === medId);
    if (!med) return;
    const units = getAvailableUnits(med);
    setReceivingForm((prev) => ({
      ...prev,
      medicineId: medId,
      unit: units[0] || med.baseUnit,
    }));
  };

  // Submit Barang Masuk
  const handleReceiveStock = (e: React.FormEvent) => {
    e.preventDefault();
    const med = medicines.find((m) => m.id === receivingForm.medicineId);
    if (!med) {
      showNotification('error', 'Pilih obat terlebih dahulu.');
      return;
    }

    const qty = Number(receivingForm.quantity);
    if (!receivingForm.batchNumber || !receivingForm.expiryDate || !(qty > 0)) {
      showNotification('error', 'Nomor batch, tanggal kedaluwarsa, dan kuantitas wajib diisi.');
      return;
    }

    const baseQtyToAdd = toBaseUnit(qty, receivingForm.unit, med);
    const batchId = 'bat-' + generateId();
    const po = `PO-${Date.now().toString().slice(-6)}`;

    // 1. Simpan Batch Baru
    const newBatch: StockBatch = {
      id: batchId,
      medicineId: med.id,
      batchNumber: receivingForm.batchNumber.toUpperCase(),
      expiryDate: receivingForm.expiryDate,
      totalBaseQty: baseQtyToAdd,
      supplierName: receivingForm.supplierName || 'Distributor Farmasi',
      receivedDate: formatDateInput(new Date().toISOString()),
      status: BatchStatus.ACTIVE,
    };
    addBatch(newBatch);

    // 2. Simpan Log Mutasi
    addMutation({
      id: generateId(),
      medicineId: med.id,
      batchId: batchId,
      mutationType: MutationType.BARANG_DATANG,
      qtyChange: baseQtyToAdd,
      unitUsed: `${qty} ${receivingForm.unit}`,
      referenceNumber: po,
      notes: `Penerimaan dari ${newBatch.supplierName} (Batch: ${newBatch.batchNumber})`,
      createdAt: new Date().toISOString(),
    });

    showNotification(
      'success',
      `Berhasil menerima ${qty} ${receivingForm.unit} (${baseQtyToAdd} ${med.baseUnit}) ${med.name}.`
    );

    // Reset Form
    setReceivingForm((prev) => ({
      ...prev,
      batchNumber: '',
      expiryDate: '',
      quantity: 1,
    }));
    refreshData();
  };

  // Submit Koreksi Rusak
  const handleDamageCorrection = (e: React.FormEvent) => {
    e.preventDefault();
    const batch = batches.find((b) => b.id === damageForm.batchId);
    if (!batch) {
      showNotification('error', 'Pilih batch obat yang rusak.');
      return;
    }

    const med = medicines.find((m) => m.id === batch.medicineId);
    if (!med) return;

    if (damageForm.quantity <= 0 || damageForm.quantity > batch.totalBaseQty) {
      showNotification('error', `Kuantitas koreksi harus antara 1 sampai ${batch.totalBaseQty} ${med.baseUnit}.`);
      return;
    }

    // Kurangi stok dari batch
    reduceStock(batch.id, damageForm.quantity);

    // Catat mutasi koreksi rusak
    addMutation({
      id: generateId(),
      medicineId: med.id,
      batchId: batch.id,
      mutationType: MutationType.KOREKSI_RUSAK,
      qtyChange: -damageForm.quantity,
      unitUsed: `${damageForm.quantity} ${med.baseUnit}`,
      referenceNumber: `CORR-${Date.now().toString().slice(-6)}`,
      notes: `Koreksi Rusak: ${damageForm.reason} (Batch ${batch.batchNumber})`,
      createdAt: new Date().toISOString(),
    });

    showNotification(
      'success',
      `Stok batch ${batch.batchNumber} berhasil dikurangi ${damageForm.quantity} ${med.baseUnit}.`
    );

    setDamageForm({
      batchId: '',
      quantity: 1,
      reason: '',
    });
    refreshData();
  };

  const selectedMed = medicines.find((m) => m.id === receivingForm.medicineId);
  const receivingQty = Number(receivingForm.quantity) || 0;
  const availableUnits = selectedMed ? getAvailableUnits(selectedMed) : [];

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
          <h1>Pergudangan &amp; Barang Datang</h1>
          <p>Catat obat baru yang masuk dari supplier distributor, nomor batch, tanggal EXP, serta audit mutasi stok.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/gudang" className="btn btn-secondary">
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 10L10 4l7 6" />
              <rect x="4" y="10" width="12" height="7" rx="1" />
              <line x1="8" y1="13" x2="12" y2="13" />
            </svg>
            <span>Buka Stok Gudang &amp; Import Excel</span>
          </Link>
        </div>
      </div>

      {/* Tabs */}
      <div className="filter-tabs">
        <button
          className={`filter-tab ${activeTab === 'MASUK' ? 'active' : ''}`}
          onClick={() => setActiveTab('MASUK')}
        >
          Form Input Barang Masuk
        </button>
        <button
          className={`filter-tab ${activeTab === 'MUTASI' ? 'active' : ''}`}
          onClick={() => setActiveTab('MUTASI')}
        >
          Riwayat Log Mutasi Stok ({mutations.length})
        </button>
        <button
          className={`filter-tab ${activeTab === 'KOREKSI' ? 'active' : ''}`}
          onClick={() => setActiveTab('KOREKSI')}
        >
          Koreksi Stok Rusak / Pecah
        </button>
      </div>

      {/* TAB 1: FORM INPUT BARANG MASUK */}
      {activeTab === 'MASUK' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(340px, 560px) 1fr', gap: 'var(--sp-6)' }}>
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-4)' }}>Pencatatan Faktur Barang Datang</h3>
            <form onSubmit={handleReceiveStock}>
              <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
                <label className="form-label">Pilih Obat *</label>
                <select
                  className="form-select"
                  value={receivingForm.medicineId}
                  onChange={(e) => handleMedicineChange(e.target.value)}
                  required
                >
                  {medicines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.category})
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
                <div className="form-group">
                  <label className="form-label">Satuan Kemasan Masuk *</label>
                  <select
                    className="form-select"
                    value={receivingForm.unit}
                    onChange={(e) => setReceivingForm({ ...receivingForm, unit: e.target.value })}
                    required
                  >
                    {availableUnits.map((u) => (
                      <option key={u} value={u}>
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label className="form-label">Jumlah Barang Masuk *</label>
                  <input
                    type="number"
                    min="1"
                    className="form-input"
                    value={receivingForm.quantity}
                    onChange={(e) => setReceivingForm({ ...receivingForm, quantity: e.target.value === '' ? '' : parseInt(e.target.value, 10) })}
                    required
                  />
                </div>
              </div>

              {selectedMed && receivingQty > 0 && (
                <div className="badge badge-info" style={{ marginBottom: 'var(--sp-4)', alignSelf: 'flex-start' }}>
                  Akan ditambahkan ke stok fisik: +
                  {toBaseUnit(receivingQty, receivingForm.unit, selectedMed)} {selectedMed.baseUnit}
                </div>
              )}

              <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
                <div className="form-group">
                  <label className="form-label">Nomor Batch Pabrik *</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: PCT-2026-X1"
                    value={receivingForm.batchNumber}
                    onChange={(e) => setReceivingForm({ ...receivingForm, batchNumber: e.target.value })}
                    required
                  />
                </div>
                <div className="form-group">
                  <label className="form-label">Tanggal Kedaluwarsa (EXP Date) *</label>
                  <input
                    type="date"
                    className="form-input"
                    value={receivingForm.expiryDate}
                    onChange={(e) => setReceivingForm({ ...receivingForm, expiryDate: e.target.value })}
                    required
                  />
                </div>
              </div>

              <div className="form-row" style={{ marginBottom: 'var(--sp-5)' }}>
                <div className="form-group">
                  <label className="form-label">Nama Supplier / PBF</label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="Contoh: PT Kimia Farma Trading"
                    value={receivingForm.supplierName}
                    onChange={(e) => setReceivingForm({ ...receivingForm, supplierName: e.target.value })}
                  />
                </div>
              </div>

              <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center' }}>
                Simpan &amp; Tambah ke Stok Pergudangan
              </button>
            </form>
          </div>

          {/* List Batch Aktif Obat Terpilih */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-3)' }}>
              Batch Stok Aktif: {selectedMed?.name || 'Obat Terpilih'}
            </h3>
            {batches.filter((b) => b.medicineId === receivingForm.medicineId).length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                <p>Belum ada batch stok untuk obat ini.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Jatuh Tempo</th>
                    <th>Supplier</th>
                    <th className="text-right">Sisa Stok</th>
                  </tr>
                </thead>
                <tbody>
                  {batches
                    .filter((b) => b.medicineId === receivingForm.medicineId)
                    .map((b) => {
                      const days = daysUntilExpiry(b.expiryDate);
                      return (
                        <tr key={b.id}>
                          <td><code>{b.batchNumber}</code></td>
                          <td>
                            {formatDate(b.expiryDate)}
                            <span className="text-xs text-muted" style={{ display: 'block' }}>
                              ({days <= 0 ? 'Sudah Expired' : `${days} hari lagi`})
                            </span>
                          </td>
                          <td className="text-sm">{b.supplierName}</td>
                          <td className="text-right" style={{ fontWeight: 600 }}>
                            {b.totalBaseQty} {selectedMed?.baseUnit}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: RIWAYAT MUTASI STOK */}
      {activeTab === 'MUTASI' && (
        <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr>
                <th>Waktu</th>
                <th>Nama Obat</th>
                <th>Tipe Mutasi</th>
                <th>Satuan Diinput</th>
                <th className="text-right">Perubahan Stok Fisik</th>
                <th>No Referensi</th>
                <th>Keterangan</th>
              </tr>
            </thead>
            <tbody>
              {mutations.map((m) => {
                const med = medicines.find((item) => item.id === m.medicineId);
                const isPositive = m.qtyChange > 0;
                const isZero = m.qtyChange === 0;

                let badgeClass = 'badge-info';
                if (m.mutationType === MutationType.PENJUALAN_KASIR) badgeClass = 'badge-neutral';
                if (m.mutationType === MutationType.BARANG_DATANG) badgeClass = 'badge-safe';
                if (m.mutationType === MutationType.KOREKSI_RUSAK) badgeClass = 'badge-critical';
                if (m.mutationType === MutationType.PENGELUARAN_RESEP) badgeClass = 'badge-warning';

                return (
                  <tr key={m.id}>
                    <td className="text-sm text-muted">
                      {formatDate(m.createdAt)}{' '}
                      {new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td><strong>{med?.name || 'Obat'}</strong></td>
                    <td><span className={`badge ${badgeClass}`}>{m.mutationType}</span></td>
                    <td><code>{m.unitUsed}</code></td>
                    <td
                      className="text-right"
                      style={{
                        fontWeight: 700,
                        color: isPositive ? 'var(--green-600)' : isZero ? 'var(--slate-600)' : 'var(--red-600)',
                      }}
                    >
                      {isPositive ? `+${m.qtyChange}` : m.qtyChange} {med?.baseUnit}
                    </td>
                    <td><span className="text-xs text-muted">{m.referenceNumber}</span></td>
                    <td className="text-sm">{m.notes}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {mutations.length === 0 && (
            <div className="empty-state">
              <p>Belum ada catatan riwayat mutasi stok.</p>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: KOREKSI STOK RUSAK */}
      {activeTab === 'KOREKSI' && (
        <div className="card" style={{ maxWidth: '560px' }}>
          <h3 style={{ marginBottom: 'var(--sp-2)' }}>Koreksi Stok Rusak / Pecah</h3>
          <p className="text-muted text-sm" style={{ marginBottom: 'var(--sp-4)' }}>
            Kurangi stok secara manual jika ditemukan botol sirup pecah, strip basah, atau kerusakan fisik lainnya.
          </p>

          <form onSubmit={handleDamageCorrection}>
            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label className="form-label">Pilih Batch Obat *</label>
              <select
                className="form-select"
                value={damageForm.batchId}
                onChange={(e) => setDamageForm({ ...damageForm, batchId: e.target.value })}
                required
              >
                <option value="">-- Pilih Batch Obat --</option>
                {batches.filter((b) => b.totalBaseQty > 0).map((b) => {
                  const med = medicines.find((m) => m.id === b.medicineId);
                  return (
                    <option key={b.id} value={b.id}>
                      {med?.name} | Batch {b.batchNumber} (Sisa: {b.totalBaseQty} {med?.baseUnit})
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label className="form-label">Jumlah Rusak (dalam Satuan Dasar) *</label>
              <input
                type="number"
                min="1"
                className="form-input"
                value={damageForm.quantity}
                onChange={(e) => setDamageForm({ ...damageForm, quantity: parseInt(e.target.value) || 1 })}
                required
              />
            </div>

            <div className="form-group" style={{ marginBottom: 'var(--sp-5)' }}>
              <label className="form-label">Alasan Kerusakan / Catatan *</label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: 1 botol sirup pecah saat perapihan etalase"
                value={damageForm.reason}
                onChange={(e) => setDamageForm({ ...damageForm, reason: e.target.value })}
                required
              />
            </div>

            <button type="submit" className="btn btn-danger" style={{ width: '100%', justifyContent: 'center' }}>
              Kurangi Stok Rusak
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
