'use client';

import { useState, useEffect } from 'react';
import {
  getMedicines,
  getTotalStock,
  deductStockFEFO,
  addMutation,
  getMutations,
  initDB,
} from '@/database/db';
import {
  Medicine,
  StockMutation,
  MutationType,
} from '@/database/schema';
import { toBaseUnit, getPrescriptionUnits } from '@/features/inventory/utils/conversion';
import { formatDate, generateId } from '@/lib/formatters';

interface PrescriptionItem {
  id: string;
  medicine: Medicine;
  unit: string;
  quantity: number;
  baseQtyToDeduct: number;
  signa: string; // Aturan pakai (contoh: 3x sehari 1 tablet sesudah makan)
  labelType: 'DALAM' | 'LUAR'; // Etiket putih (obat dalam) vs biru (obat luar)
}

interface CompletedPrescription {
  recipeNo: string;
  patientName: string;
  patientAge: string;
  doctorName: string;
  diagnosis?: string;
  action?: string;
  date: string;
  items: PrescriptionItem[];
}

export default function PrescriptionPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [mutations, setMutations] = useState<StockMutation[]>([]);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Header Identitas Resep
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [doctorName, setDoctorName] = useState('');
  const [prescriptionNo, setPrescriptionNo] = useState('');
  const [diagnosis, setDiagnosis] = useState('');
  const [action, setAction] = useState('');

  // Item Builder Resep Saat Ini
  const [prescriptionItems, setPrescriptionItems] = useState<PrescriptionItem[]>([]);
  const [selectedMedicineId, setSelectedMedicineId] = useState('');
  const [selectedUnit, setSelectedUnit] = useState('Biji');
  const [qtyInput, setQtyInput] = useState<string>('10');
  const [signa, setSigna] = useState('3 x sehari 1 biji sesudah makan');
  const [labelType, setLabelType] = useState<'DALAM' | 'LUAR'>('DALAM');

  // Modal Cetak Etiket
  const [completedPrescription, setCompletedPrescription] = useState<CompletedPrescription | null>(null);
  const [showEtiketModal, setShowEtiketModal] = useState(false);

  useEffect(() => {
    initDB();
    refreshData();
  }, []);

  const refreshData = () => {
    const meds = getMedicines();
    setMedicines(meds);
    setMutations(
      getMutations()
        .filter((m) => m.mutationType === MutationType.PENGELUARAN_RESEP)
        .reverse()
    );

    if (meds.length > 0 && !selectedMedicineId) {
      const first = meds[0];
      const units = getPrescriptionUnits(first);
      setSelectedMedicineId(first.id);
      setSelectedUnit(units[0] || 'Biji');
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const handleMedicineChange = (medId: string) => {
    const med = medicines.find((m) => m.id === medId);
    if (!med) return;
    const units = getPrescriptionUnits(med);
    const primaryUnit = units[0] || 'Biji';
    setSelectedMedicineId(medId);
    setSelectedUnit(primaryUnit);

    // Otomatis tentukan label obat dalam vs obat luar & aturan pakai default
    if (med.category === 'SALEP' || med.category === 'TETES') {
      setLabelType('LUAR');
      setSigna(med.category === 'SALEP' ? 'Oleskan tipis pada bagian yang sakit 2x sehari' : 'Teteskan 1-2 tetes pada mata yang sakit 3x sehari');
      setQtyInput('1');
    } else if (med.category === 'SIRUP') {
      setLabelType('DALAM');
      setSigna('3 x sehari 1 sendok takar (5ml) sesudah makan');
      setQtyInput('1');
    } else {
      setLabelType('DALAM');
      setSigna('3 x sehari 1 biji sesudah makan');
      setQtyInput('10');
    }
  };

  // Tambahkan obat ke daftar resep
  const handleAddItemToPrescription = () => {
    const med = medicines.find((m) => m.id === selectedMedicineId);
    if (!med) {
      showNotification('error', 'Pilih obat terlebih dahulu.');
      return;
    }

    const qty = parseFloat(qtyInput);
    if (isNaN(qty) || qty <= 0) {
      showNotification('error', 'Jumlah kuantitas harus lebih besar dari 0.');
      return;
    }

    const baseQty = toBaseUnit(qty, selectedUnit, med);
    const availableStock = getTotalStock(med.id);

    // Cek apakah item sudah ada di list resep saat ini
    const existingInList = prescriptionItems
      .filter((item) => item.medicine.id === med.id)
      .reduce((sum, item) => sum + item.baseQtyToDeduct, 0);

    if (existingInList + baseQty > availableStock) {
      showNotification(
        'error',
        `Stok tidak mencukupi. Sisa stok fisik di gudang: ${availableStock} ${selectedUnit === 'Biji' ? 'Biji' : med.baseUnit}.`
      );
      return;
    }

    const newItem: PrescriptionItem = {
      id: generateId(),
      medicine: med,
      unit: selectedUnit,
      quantity: qty,
      baseQtyToDeduct: baseQty,
      signa: signa.trim() || 'Sesuai petunjuk dokter',
      labelType,
    };

    setPrescriptionItems([...prescriptionItems, newItem]);
    showNotification('success', `${med.name} (${qty} ${selectedUnit}) ditambahkan ke lembar resep.`);
  };

  const handleRemoveItem = (id: string) => {
    setPrescriptionItems(prescriptionItems.filter((item) => item.id !== id));
  };

  // Eksekusi Pemotongan Stok untuk Seluruh Obat dalam Resep
  const handleDispensePrescription = () => {
    if (!patientName.trim()) {
      showNotification('error', 'Nama pasien wajib diisi.');
      return;
    }

    if (prescriptionItems.length === 0) {
      showNotification('error', 'Belum ada obat yang dimasukkan ke dalam resep.');
      return;
    }

    const rxNo = prescriptionNo.trim() || `RXP-${Date.now().toString().slice(-6)}`;
    const deductionLogs: string[] = [];

    const diagText = diagnosis.trim();
    const actText = action.trim();
    const diagPart = diagText ? ` | Diagnosa: ${diagText}` : '';
    const actPart = actText ? ` | Tindakan: ${actText}` : '';

    // 1. Eksekusi pemotongan stok untuk setiap obat dalam resep
    for (const item of prescriptionItems) {
      const deductions = deductStockFEFO(item.medicine.id, item.baseQtyToDeduct);

      if (!deductions) {
        showNotification(
          'error',
          `Gagal memotong stok ${item.medicine.name}. Stok fisik mungkin sudah berubah.`
        );
        refreshData();
        return;
      }

      const batchInfo = deductions.map((d) => `Batch ${d.batchNumber} (-${d.deductedQty})`).join(', ');

      // Catat mutasi pengeluaran resep terpadu
      addMutation({
        id: generateId(),
        medicineId: item.medicine.id,
        batchId: deductions[0].batchId,
        mutationType: MutationType.PENGELUARAN_RESEP,
        qtyChange: -item.baseQtyToDeduct,
        unitUsed: `${item.quantity} ${item.unit}`,
        referenceNumber: rxNo,
        notes: `Pasien: ${patientName} (${patientAge || '-'}) | dr. ${doctorName || '-'}${diagPart}${actPart} | Aturan: ${item.signa} | ${batchInfo}`,
        diagnosis: diagText || undefined,
        action: actText || undefined,
        createdAt: new Date().toISOString(),
      });

      deductionLogs.push(`${item.medicine.name}: -${item.baseQtyToDeduct} ${item.medicine.baseUnit}`);
    }

    // Set data etiket
    setCompletedPrescription({
      recipeNo: rxNo,
      patientName,
      patientAge,
      doctorName: doctorName || 'Dokter Umum',
      diagnosis: diagText,
      action: actText,
      date: new Date().toISOString(),
      items: [...prescriptionItems],
    });

    setShowEtiketModal(true);

    // Reset Form
    setPrescriptionItems([]);
    setPatientName('');
    setPatientAge('');
    setDoctorName('');
    setPrescriptionNo('');
    setDiagnosis('');
    setAction('');
    refreshData();

    showNotification('success', `Pengurangan stok resep ${rxNo} berhasil diproses.`);
  };

  const currentMed = medicines.find((m) => m.id === selectedMedicineId);
  const units = currentMed ? getPrescriptionUnits(currentMed) : [];
  const currentStock = currentMed ? getTotalStock(currentMed.id) : 0;
  const calculatedBaseUnits =
    currentMed && !isNaN(parseFloat(qtyInput))
      ? toBaseUnit(parseFloat(qtyInput), selectedUnit, currentMed)
      : 0;

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
          <h1>Pengeluaran Resep &amp; Pengurangan Stok</h1>
          <p>
            Alur pengeluaran obat resep dokter dihitung dengan satuan per biji (bukan per strip/box), otomatis memotong stok
            fisik pergudangan berbasis FEFO, dan mencetak etiket obat farmasi.
          </p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(350px, 580px) 1fr', gap: 'var(--sp-6)', alignItems: 'flex-start' }}>
        
        {/* KOLOM KIRI: BUILDER RESEP */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-4)' }}>
          
          {/* Card Identitas Pasien & Resep */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-3)' }}>1. Data Lembar Resep</h3>
            <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="form-group">
                <label className="form-label">Nama Pasien *</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: Ny. Siti Rahmawati"
                  value={patientName}
                  onChange={(e) => setPatientName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label className="form-label">Usia / Tgl Lahir</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: 35 Tahun / Dewasa"
                  value={patientAge}
                  onChange={(e) => setPatientAge(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="form-group">
                <label className="form-label">Nama Dokter / Klinik</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: dr. Budi Santoso Sp.PD"
                  value={doctorName}
                  onChange={(e) => setDoctorName(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="form-label">Nomor Resep</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: RX-2026-001"
                  value={prescriptionNo}
                  onChange={(e) => setPrescriptionNo(e.target.value)}
                />
              </div>
            </div>

            <div className="form-row">
              <div className="form-group">
                <label className="form-label">Diagnosa</label>
                <input
                  type="text"
                  list="diagnosa-list"
                  className="form-input"
                  placeholder="Contoh: ISPA, Hipertensi, Gastritis..."
                  value={diagnosis}
                  onChange={(e) => setDiagnosis(e.target.value)}
                />
                <datalist id="diagnosa-list">
                  <option value="ISPA (Infeksi Saluran Pernapasan Akut)" />
                  <option value="Hipertensi Primer" />
                  <option value="Diabetes Melitus Tipe 2" />
                  <option value="Gastritis / Dispepsia" />
                  <option value="Faringitis Akut" />
                  <option value="Cephalgia / Sakit Kepala" />
                  <option value="Dermatitis Alergi" />
                  <option value="Demam Tifoid" />
                  <option value="Myalgia / Nyeri Otot" />
                  <option value="Gastroenteritis Akut (GEA)" />
                </datalist>
              </div>

              <div className="form-group">
                <label className="form-label">Tindakan</label>
                <input
                  type="text"
                  list="tindakan-list"
                  className="form-input"
                  placeholder="Contoh: Pemberian Obat Oral, Edukasi..."
                  value={action}
                  onChange={(e) => setAction(e.target.value)}
                />
                <datalist id="tindakan-list">
                  <option value="Pemberian Obat Oral & Konseling Farmasi" />
                  <option value="Edukasi Kepatuhan & Aturan Minum Obat" />
                  <option value="Injeksi Intramuskular (IM)" />
                  <option value="Injeksi Intravena (IV)" />
                  <option value="Nebulisasi Salbutamol" />
                  <option value="Perawatan & Pembersihan Luka" />
                  <option value="Pemeriksaan Tekanan Darah & Konseling" />
                  <option value="Pemeriksaan Gula Darah & Edukasi Diet" />
                </datalist>
              </div>
            </div>
          </div>

          {/* Card Pilih Obat & Jumlah Per Biji */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-3)' }}>2. Tambahkan Obat ke Resep</h3>

            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label className="form-label">Pilih Obat dari Katalog *</label>
              <select
                className="form-select"
                value={selectedMedicineId}
                onChange={(e) => handleMedicineChange(e.target.value)}
              >
                {medicines.map((m) => {
                  const stock = getTotalStock(m.id);
                  const isSolid = m.category === 'TABLET' || m.category === 'KAPSUL' || m.baseUnit === 'Tablet' || m.baseUnit === 'Kapsul';
                  return (
                    <option key={m.id} value={m.id}>
                      {m.name} — Stok Gudang: {stock} {isSolid ? 'Biji' : m.baseUnit}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="form-group">
                <label className="form-label">Satuan Yang Diresepkan *</label>
                <select
                  className="form-select"
                  value={selectedUnit}
                  onChange={(e) => setSelectedUnit(e.target.value)}
                >
                  {units.map((u) => (
                    <option key={u} value={u}>
                      {u === 'Biji' ? 'Biji (Per Butir / Biji)' : u}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-group">
                <label className="form-label">Jumlah Yang Dikeluarkan ({selectedUnit}) *</label>
                <input
                  type="number"
                  step="any"
                  min="0.1"
                  className="form-input"
                  value={qtyInput}
                  onChange={(e) => setQtyInput(e.target.value)}
                />
              </div>
            </div>

            {/* Quick buttons per biji untuk resep */}
            {selectedUnit === 'Biji' ? (
              <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="text-xs text-muted" style={{ marginRight: '4px' }}>Pilihan Cepat (Biji):</span>
                {[3, 5, 10, 15, 20, 30].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`btn btn-sm ${qtyInput === String(num) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => {
                      setSelectedUnit('Biji');
                      setQtyInput(String(num));
                      setSigna(`3 x sehari 1 biji sesudah makan`);
                    }}
                  >
                    {num} Biji
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display: 'flex', gap: '6px', marginBottom: 'var(--sp-3)', flexWrap: 'wrap', alignItems: 'center' }}>
                <span className="text-xs text-muted" style={{ marginRight: '4px' }}>Pilihan Cepat:</span>
                {[1, 2, 3].map((num) => (
                  <button
                    key={num}
                    type="button"
                    className={`btn btn-sm ${qtyInput === String(num) ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => setQtyInput(String(num))}
                  >
                    {num} {selectedUnit}
                  </button>
                ))}
              </div>
            )}

            {currentMed && (
              <div
                className="card card-compact"
                style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)', marginBottom: 'var(--sp-3)' }}
              >
                <div style={{ fontSize: '0.857rem', color: 'var(--teal-800)' }}>
                  Kalkulasi Pengurangan Stok: <strong>{qtyInput} {selectedUnit}</strong> akan memotong persis{' '}
                  <strong>{calculatedBaseUnits} {selectedUnit === 'Biji' ? 'Biji' : currentMed.baseUnit}</strong> dari stok pergudangan (Sisa stok:{' '}
                  {currentStock} {selectedUnit === 'Biji' ? 'Biji' : currentMed.baseUnit}).
                </div>
              </div>
            )}

            <div className="form-row" style={{ marginBottom: 'var(--sp-3)' }}>
              <div className="form-group" style={{ flex: 2 }}>
                <label className="form-label">Aturan Pakai (Signa)</label>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Contoh: 3 x sehari 1 biji sesudah makan"
                  value={signa}
                  onChange={(e) => setSigna(e.target.value)}
                />
              </div>

              <div className="form-group" style={{ flex: 1 }}>
                <label className="form-label">Jenis Etiket</label>
                <select
                  className="form-select"
                  value={labelType}
                  onChange={(e) => setLabelType(e.target.value as 'DALAM' | 'LUAR')}
                >
                  <option value="DALAM">Obat Dalam (Putih)</option>
                  <option value="LUAR">Obat Luar (Biru)</option>
                </select>
              </div>
            </div>

            <button
              type="button"
              className="btn btn-secondary"
              style={{ width: '100%', justifyContent: 'center' }}
              onClick={handleAddItemToPrescription}
            >
              + Masukkan Obat ke Lembar Resep
            </button>
          </div>
        </div>

        {/* KOLOM KANAN: DAFTAR RESEP SIAP POTONG STOK */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <h3>3. Daftar Obat dalam Resep</h3>
              <span className="badge badge-info">{prescriptionItems.length} Obat</span>
            </div>

            {prescriptionItems.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <rect x="4" y="2" width="12" height="16" rx="2" />
                  <line x1="7" y1="6" x2="13" y2="6" />
                  <line x1="7" y1="9" x2="13" y2="9" />
                  <line x1="7" y1="12" x2="10" y2="12" />
                </svg>
                <p>Belum ada obat di lembar resep. Pilih obat di sebelah kiri dan klik tombol tambah.</p>
              </div>
            ) : (
              <div>
                <table className="data-table" style={{ marginBottom: 'var(--sp-4)' }}>
                  <thead>
                    <tr>
                      <th>Nama Obat</th>
                      <th>Jumlah Resep</th>
                      <th className="text-right">Potong Stok Fisik</th>
                      <th>Aturan Pakai</th>
                      <th className="text-center">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {prescriptionItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.medicine.name}</strong>
                          <span className="text-xs text-muted" style={{ display: 'block' }}>
                            {item.labelType === 'DALAM' ? 'Etiket Putih (Dalam)' : 'Etiket Biru (Luar)'}
                          </span>
                        </td>
                        <td>
                          <code>{item.quantity} {item.unit}</code>
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: 'var(--red-600)' }}>
                          -{item.baseQtyToDeduct} {item.unit === 'Biji' ? 'Biji' : item.medicine.baseUnit}
                        </td>
                        <td className="text-sm">{item.signa}</td>
                        <td className="text-center">
                          <button
                            className="btn btn-ghost btn-sm"
                            style={{ color: 'var(--red-600)' }}
                            onClick={() => handleRemoveItem(item.id)}
                          >
                            Hapus
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <div className="card card-compact" style={{ background: 'var(--slate-50)', marginBottom: 'var(--sp-4)' }}>
                  <div className="text-sm" style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div>
                      Pasien: <strong>{patientName || '(Nama Pasien Belum Diisi)'}</strong>{' '}
                      {patientAge && `(${patientAge})`} | Dokter: <strong>{doctorName || 'Umum'}</strong>
                    </div>
                    {(diagnosis || action) && (
                      <div style={{ fontSize: '0.8rem', color: 'var(--slate-600)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        {diagnosis && (
                          <span>
                            Diagnosa: <strong style={{ color: 'var(--teal-700)' }}>{diagnosis}</strong>
                          </span>
                        )}
                        {diagnosis && action && <span>&bull;</span>}
                        {action && (
                          <span>
                            Tindakan: <strong style={{ color: 'var(--blue-700)' }}>{action}</strong>
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <button
                  className="btn btn-primary btn-lg"
                  style={{ width: '100%', justifyContent: 'center' }}
                  onClick={handleDispensePrescription}
                >
                  Eksekusi Pengeluaran &amp; Potong Stok Fisik
                </button>
              </div>
            )}
          </div>

          {/* Tabel Riwayat Pengeluaran Resep Sebelumnya */}
          <div className="card">
            <h3 style={{ marginBottom: 'var(--sp-3)' }}>Riwayat Pengeluaran Resep Terakhir</h3>
            {mutations.length === 0 ? (
              <div className="empty-state">
                <p>Belum ada riwayat resep yang diproses.</p>
              </div>
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Waktu</th>
                      <th>Obat</th>
                      <th>Satuan Diambil</th>
                      <th className="text-right">Stok Terpotong</th>
                      <th>Keterangan Resep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutations.slice(0, 8).map((m) => {
                      const med = medicines.find((item) => item.id === m.medicineId);
                      return (
                        <tr key={m.id}>
                          <td className="text-xs text-muted">
                            {formatDate(m.createdAt)}{' '}
                            {new Date(m.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td><strong>{med?.name || 'Obat'}</strong></td>
                          <td><code>{m.unitUsed}</code></td>
                          <td className="text-right" style={{ color: 'var(--red-600)', fontWeight: 600 }}>
                            {m.qtyChange} {m.unitUsed?.includes('Biji') ? 'Biji' : (med?.category === 'TABLET' || med?.category === 'KAPSUL' ? 'Biji' : (med?.baseUnit || 'Biji'))}
                          </td>
                          <td className="text-xs">
                            <div style={{ lineHeight: '1.4' }}>
                              {m.notes.includes(' | Diagnosa:') || m.notes.includes(' | Tindakan:') ? (
                                <div>
                                  <div>
                                    {m.notes.split(' | ').filter(part => !part.startsWith('Diagnosa:') && !part.startsWith('Tindakan:')).join(' | ')}
                                  </div>
                                  <div style={{ display: 'flex', gap: '6px', marginTop: '4px', flexWrap: 'wrap' }}>
                                    {m.notes.split(' | ').filter(part => part.startsWith('Diagnosa:')).map((diag, i) => (
                                      <span key={i} className="badge badge-info" style={{ fontSize: '0.7rem', padding: '1px 6px' }}>
                                        {diag}
                                      </span>
                                    ))}
                                    {m.notes.split(' | ').filter(part => part.startsWith('Tindakan:')).map((act, i) => (
                                      <span key={i} className="badge badge-warning" style={{ fontSize: '0.7rem', padding: '1px 6px', background: '#fef3c7', color: '#92400e' }}>
                                        {act}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                m.notes
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* MODAL CETAK ETIKET OBAT FARMASI */}
      {showEtiketModal && completedPrescription && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide">
            <div className="modal-header">
              <h2>Etiket Obat Resep (Label Aturan Pakai)</h2>
              <button className="modal-close" onClick={() => setShowEtiketModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p className="text-sm text-muted">
                Stok fisik pergudangan telah berhasil dipotong secara otomatis. Berikut adalah label etiket aturan pakai
                untuk ditempelkan pada kemasan obat:
              </p>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--sp-4)' }}>
                {completedPrescription.items.map((item, idx) => {
                  const isLuar = item.labelType === 'LUAR';
                  return (
                    <div
                      key={idx}
                      style={{
                        border: isLuar ? '2px solid #2563eb' : '2px solid #334155',
                        borderRadius: '8px',
                        padding: '14px',
                        background: isLuar ? '#eff6ff' : '#ffffff',
                        boxShadow: '0 2px 6px rgba(0,0,0,0.06)',
                      }}
                    >
                      {/* Header Etiket */}
                      <div style={{ textAlign: 'center', borderBottom: '1px dashed #64748b', paddingBottom: '6px', marginBottom: '8px' }}>
                        <div style={{ fontWeight: 'bold', fontSize: '0.9rem', color: isLuar ? '#1d4ed8' : '#0f172a' }}>
                          APOTEK SEHAT SENTOSA
                        </div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                          SIA: 503/Apt/2025 | APA: Apt. Fadhil S.Farm
                        </div>
                      </div>

                      <div style={{ fontSize: '0.8rem', marginBottom: '6px' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span>No: <strong>{completedPrescription.recipeNo}</strong></span>
                          <span>Tgl: {formatDate(completedPrescription.date)}</span>
                        </div>
                        <div>
                          Pasien: <strong>{completedPrescription.patientName}</strong>{' '}
                          {completedPrescription.patientAge && `(${completedPrescription.patientAge})`}
                        </div>
                        <div>Dokter: {completedPrescription.doctorName}</div>
                        {completedPrescription.diagnosis && (
                          <div style={{ marginTop: '2px', color: '#0f766e', fontWeight: 600 }}>
                            Diagnosa: <span>{completedPrescription.diagnosis}</span>
                          </div>
                        )}
                        {completedPrescription.action && (
                          <div style={{ marginTop: '2px', color: '#1d4ed8', fontWeight: 600 }}>
                            Tindakan: <span>{completedPrescription.action}</span>
                          </div>
                        )}
                      </div>

                      <div
                        style={{
                          background: isLuar ? '#dbeafe' : '#f8fafc',
                          border: '1px solid #cbd5e1',
                          borderRadius: '6px',
                          padding: '8px',
                          textAlign: 'center',
                          margin: '8px 0',
                        }}
                      >
                        <div style={{ fontWeight: 'bold', fontSize: '0.95rem' }}>{item.medicine.name}</div>
                        <div style={{ fontSize: '0.75rem', color: '#475569' }}>
                          Jumlah: {item.quantity} {item.unit}
                        </div>
                        <div style={{ fontWeight: 700, fontSize: '0.9rem', color: isLuar ? '#1e40af' : '#0d9488', marginTop: '4px' }}>
                          {item.signa}
                        </div>
                      </div>

                      <div style={{ textAlign: 'center', fontSize: '0.72rem', fontWeight: 600, color: isLuar ? '#1d4ed8' : '#334155' }}>
                        {isLuar ? 'OBAT LUAR — TIDAK BOLEH DITELAN' : 'OBAT DALAM — DIMINUM SESUAI ATURAN'}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-secondary" onClick={() => window.print()}>
                Cetak Semua Etiket
              </button>
              <button className="btn btn-primary" onClick={() => setShowEtiketModal(false)}>
                Selesai &amp; Tutup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
