'use client';

import { useState, useEffect } from 'react';
import {
  getMedicines,
  getTotalStock,
  deductStockFEFO,
  addMutation,
  getMutations,
  initDB,
  completeSale,
} from '@/database/db';
import {
  Medicine,
  StockMutation,
  MutationType,
  Sale,
  SaleItem,
  SaleUnit,
} from '@/database/schema';
import { toBaseUnit, getPrescriptionUnits, getPriceForUnit } from '@/features/inventory/utils/conversion';
import { formatDate, generateId, formatRupiah, formatNumberDots, parseNumberDots } from '@/lib/formatters';

interface PrescriptionItem {
  id: string;
  medicine: Medicine;
  unit: string;
  quantity: number;
  baseQtyToDeduct: number;
  unitPrice: number;
  subtotal: number;
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
  medicinesCost: number;
  prescriptionFee: number;
  totalCost: number;
  paymentMethod: 'TUNAI' | 'QRIS' | 'TRANSFER';
  amountPaid: number;
  changeAmount: number;
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
  const [unitPriceInput, setUnitPriceInput] = useState<string>('0');
  const [isManualPrice, setIsManualPrice] = useState<boolean>(false);
  const [signa, setSigna] = useState('');
  const [labelType, setLabelType] = useState<'DALAM' | 'LUAR'>('DALAM');

  // Biaya Tambahan & Jasa Resep (Tuslah / Embalase / Racik)
  const [prescriptionFee, setPrescriptionFee] = useState<number>(0);

  // Metode & Pembayaran Pasien
  const [paymentMethod, setPaymentMethod] = useState<'TUNAI' | 'QRIS' | 'TRANSFER'>('TUNAI');
  const [patientPaid, setPatientPaid] = useState<number>(0);
  const [isManualPaid, setIsManualPaid] = useState<boolean>(false);

  // Modal Cetak Etiket & Kwitansi
  const [completedPrescription, setCompletedPrescription] = useState<CompletedPrescription | null>(null);
  const [showEtiketModal, setShowEtiketModal] = useState(false);
  const [modalTab, setModalTab] = useState<'KWITANSI' | 'ETIKET'>('KWITANSI');

  const totalMedicinesCost = prescriptionItems.reduce((sum, item) => sum + item.subtotal, 0);
  const totalPrescriptionBill = totalMedicinesCost + prescriptionFee;
  const changeAmount = Math.max(0, patientPaid - totalPrescriptionBill);

  useEffect(() => {
    if (!isManualPaid) {
      setPatientPaid(totalPrescriptionBill);
    }
  }, [totalPrescriptionBill, isManualPaid]);

  const getMutationPaidAmount = (m: StockMutation, med?: Medicine): number => {
    if (typeof m.paidAmount === 'number') {
      return m.paidAmount;
    }
    const match = m.notes.match(/(?:Bayar|Dibayar):\s*Rp\s*([\d.,]+)/i);
    if (match) {
      const clean = match[1].replace(/\D/g, '');
      if (clean) return parseInt(clean, 10);
    }
    if (med) {
      const parts = m.unitUsed.trim().split(' ');
      const qty = parseFloat(parts[0]) || Math.abs(m.qtyChange);
      const unit = parts.slice(1).join(' ') || (med.category === 'TABLET' || med.category === 'KAPSUL' ? 'Biji' : med.baseUnit);
      const unitPrice = getPriceForUnit(med, unit);
      return Math.round(unitPrice * qty);
    }
    return 0;
  };

  const handlePaidChange = (val: string) => {
    setIsManualPaid(true);
    const num = parseNumberDots(val);
    setPatientPaid(num);
  };

  const handlePrescriptionFeeChange = (val: string) => {
    const num = parseNumberDots(val);
    setPrescriptionFee(num);
  };

  const handleUnitPriceChange = (val: string) => {
    setIsManualPrice(true);
    const num = parseNumberDots(val);
    setUnitPriceInput(formatNumberDots(num));
  };

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
      const firstUnit = units[0] || 'Biji';
      setSelectedMedicineId(first.id);
      setSelectedUnit(firstUnit);
      const price = getPriceForUnit(first, firstUnit);
      setUnitPriceInput(formatNumberDots(price) || '0');
      setIsManualPrice(false);
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

    const price = getPriceForUnit(med, primaryUnit);
    setUnitPriceInput(formatNumberDots(price) || '0');
    setIsManualPrice(false);

    // Otomatis tentukan label obat dalam vs obat luar
    if (med.category === 'SALEP' || med.category === 'TETES') {
      setLabelType('LUAR');
      setQtyInput('1');
    } else if (med.category === 'SIRUP') {
      setLabelType('DALAM');
      setQtyInput('1');
    } else {
      setLabelType('DALAM');
      setQtyInput('10');
    }
  };

  const handleUnitChange = (newUnit: string) => {
    setSelectedUnit(newUnit);
    const med = medicines.find((m) => m.id === selectedMedicineId);
    if (med) {
      const price = getPriceForUnit(med, newUnit);
      setUnitPriceInput(formatNumberDots(price) || '0');
      setIsManualPrice(false);
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

    const unitPrice = parseNumberDots(unitPriceInput) || getPriceForUnit(med, selectedUnit);
    const subtotal = Math.round(unitPrice * qty);

    const newItem: PrescriptionItem = {
      id: generateId(),
      medicine: med,
      unit: selectedUnit,
      quantity: qty,
      baseQtyToDeduct: baseQty,
      unitPrice,
      subtotal,
      signa: signa.trim() || 'Sesuai petunjuk dokter',
      labelType,
    };

    setPrescriptionItems([...prescriptionItems, newItem]);
    setSigna('');
    showNotification('success', `${med.name} (${qty} ${selectedUnit} @ ${formatRupiah(unitPrice)}) ditambahkan ke lembar resep.`);
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

    if (paymentMethod === 'TUNAI' && patientPaid < totalPrescriptionBill) {
      showNotification('error', `Nominal pembayaran pasien masih kurang! Total tagihan: ${formatRupiah(totalPrescriptionBill)}`);
      return;
    }

    const rxNo = prescriptionNo.trim() || `RXP-${Date.now().toString().slice(-6)}`;
    const deductionLogs: string[] = [];

    const diagText = diagnosis.trim();
    const actText = action.trim();
    const diagPart = diagText ? ` | Diagnosa: ${diagText}` : '';
    const actPart = actText ? ` | Tindakan: ${actText}` : '';

    const effectivePaid = paymentMethod !== 'TUNAI' ? totalPrescriptionBill : (patientPaid > 0 ? patientPaid : totalPrescriptionBill);

    // 1. Eksekusi pemotongan stok untuk setiap obat dalam resep (FEFO)
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
        notes: `Pasien: ${patientName} (${patientAge || '-'}) | dr. ${doctorName || '-'}${diagPart}${actPart} | Bayar: ${formatRupiah(item.subtotal)} | Aturan: ${item.signa} | ${batchInfo}`,
        diagnosis: diagText || undefined,
        action: actText || undefined,
        paidAmount: item.subtotal,
        createdAt: new Date().toISOString(),
      });

      deductionLogs.push(`${item.medicine.name}: -${item.baseQtyToDeduct} ${item.medicine.baseUnit}`);
    }

    // 2. Simpan Transaksi Penjualan Resmi (completeSale) agar tercatat di Dashboard & Laporan Keuangan
    const saleId = generateId();
    const newSale: Sale = {
      id: saleId,
      invoiceNumber: rxNo,
      totalAmount: totalPrescriptionBill,
      amountPaid: effectivePaid,
      changeAmount: Math.max(0, effectivePaid - totalPrescriptionBill),
      createdAt: new Date().toISOString(),
    };

    const saleItemsToSave: SaleItem[] = prescriptionItems.map((item) => ({
      id: generateId(),
      saleId,
      medicineId: item.medicine.id,
      batchId: null,
      medicineName: item.medicine.name,
      unit: item.unit as SaleUnit,
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      subtotal: item.subtotal,
    }));

    if (prescriptionFee > 0) {
      saleItemsToSave.push({
        id: generateId(),
        saleId,
        medicineId: 'FEE-RESEP',
        batchId: null,
        medicineName: 'Biaya Jasa / Embalase / Tuslah Resep',
        unit: 'Paket' as SaleUnit,
        quantity: 1,
        unitPrice: prescriptionFee,
        subtotal: prescriptionFee,
      });
    }

    completeSale(newSale, saleItemsToSave);

    // 3. Set data etiket & kwitansi pembayaran resep
    setCompletedPrescription({
      recipeNo: rxNo,
      patientName,
      patientAge,
      doctorName: doctorName || 'Dokter Umum',
      diagnosis: diagText,
      action: actText,
      date: new Date().toISOString(),
      medicinesCost: totalMedicinesCost,
      prescriptionFee,
      totalCost: totalPrescriptionBill,
      paymentMethod,
      amountPaid: effectivePaid,
      changeAmount: Math.max(0, effectivePaid - totalPrescriptionBill),
      items: [...prescriptionItems],
    });

    setModalTab('KWITANSI');
    setShowEtiketModal(true);

    // Reset Form
    setPrescriptionItems([]);
    setPatientName('');
    setPatientAge('');
    setDoctorName('');
    setPrescriptionNo('');
    setDiagnosis('');
    setAction('');
    setSigna('');
    setPrescriptionFee(0);
    setPatientPaid(0);
    setIsManualPaid(false);
    refreshData();

    showNotification('success', `Pengeluaran resep & pembayaran ${rxNo} berhasil diproses.`);
  };

  const currentMed = medicines.find((m) => m.id === selectedMedicineId);
  const units = currentMed ? getPrescriptionUnits(currentMed) : [];
  const currentStock = currentMed ? getTotalStock(currentMed.id) : 0;
  const calculatedBaseUnits =
    currentMed && !isNaN(parseFloat(qtyInput))
      ? toBaseUnit(parseFloat(qtyInput), selectedUnit, currentMed)
      : 0;
  const currentParsedUnitPrice = parseNumberDots(unitPriceInput) || (currentMed ? getPriceForUnit(currentMed, selectedUnit) : 0);
  const currentEstimatedTotal =
    currentMed && !isNaN(parseFloat(qtyInput))
      ? Math.round(currentParsedUnitPrice * parseFloat(qtyInput))
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

            <div className="form-group" style={{ marginBottom: 'var(--sp-3)' }}>
              <label className="form-label">Diagnosa</label>
              <textarea
                className="form-input"
                rows={3}
                placeholder="Ketik diagnosa pasien di sini..."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
              />
            </div>

            <div className="form-group">
              <label className="form-label">Tindakan</label>
              <input
                type="text"
                className="form-input"
                placeholder="Contoh: Pemberian Obat Oral, Edukasi..."
                value={action}
                onChange={(e) => setAction(e.target.value)}
              />
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
                  onChange={(e) => handleUnitChange(e.target.value)}
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

            {/* Input Harga Pembayaran per Satuan & Estimasi Subtotal */}
            <div
              className="card card-compact"
              style={{
                background: 'var(--slate-50)',
                borderColor: 'var(--slate-200)',
                marginBottom: 'var(--sp-3)',
                padding: 'var(--sp-3)',
              }}
            >
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: 'var(--sp-3)', alignItems: 'center' }}>
                <div className="form-group" style={{ marginBottom: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                    <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 0 }}>
                      Harga Pembayaran per {selectedUnit} (Rp) *
                    </label>
                    {isManualPrice ? (
                      <span className="badge badge-warning" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        Disesuaikan
                      </span>
                    ) : (
                      <span className="badge badge-neutral" style={{ fontSize: '0.68rem', padding: '1px 6px' }}>
                        Harga Master
                      </span>
                    )}
                  </div>
                  <div style={{ position: 'relative' }}>
                    <span
                      style={{
                        position: 'absolute',
                        left: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        color: 'var(--slate-400)',
                        fontSize: '0.85rem',
                        fontWeight: 700,
                      }}
                    >
                      Rp
                    </span>
                    <input
                      type="text"
                      inputMode="numeric"
                      className="form-input"
                      style={{ paddingLeft: '36px', fontWeight: 700 }}
                      value={unitPriceInput}
                      onChange={(e) => handleUnitPriceChange(e.target.value)}
                      placeholder="0"
                    />
                  </div>
                </div>

                <div>
                  <div className="text-xs text-muted" style={{ fontWeight: 600, marginBottom: '2px' }}>
                    Estimasi Subtotal Obat
                  </div>
                  <div style={{ fontSize: '1.15rem', fontWeight: 800, color: 'var(--teal-700)' }}>
                    {formatRupiah(currentEstimatedTotal)}
                  </div>
                  <div className="text-xs text-muted">
                    {qtyInput || 0} {selectedUnit} &times; {formatRupiah(currentParsedUnitPrice)}
                  </div>
                </div>
              </div>
            </div>
            {currentMed && (
              <div
                className="card card-compact"
                style={{ background: 'var(--teal-50)', borderColor: 'var(--teal-200)', marginBottom: 'var(--sp-3)' }}
              >
                <div style={{ fontSize: '0.857rem', color: 'var(--teal-800)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div>
                    Kalkulasi Pengurangan Stok: <strong>{qtyInput} {selectedUnit}</strong> akan memotong persis{' '}
                    <strong>{calculatedBaseUnits} {selectedUnit === 'Biji' ? 'Biji' : currentMed.baseUnit}</strong> dari stok pergudangan (Sisa stok:{' '}
                    {currentStock} {selectedUnit === 'Biji' ? 'Biji' : currentMed.baseUnit}).
                  </div>
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
                      <th className="text-right">Harga Satuan</th>
                      <th className="text-right">Subtotal Biaya</th>
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
                        <td className="text-right" style={{ color: 'var(--slate-600)', fontSize: '0.875rem' }}>
                          {formatRupiah(item.unitPrice)}
                        </td>
                        <td className="text-right" style={{ fontWeight: 700, color: 'var(--teal-700)' }}>
                          {formatRupiah(item.subtotal)}
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
                  <tfoot>
                    <tr style={{ background: 'var(--slate-50)', fontWeight: 700 }}>
                      <td colSpan={4} className="text-right">Subtotal Seluruh Obat:</td>
                      <td className="text-right" style={{ color: 'var(--teal-800)', fontSize: '0.95rem' }}>
                        {formatRupiah(totalMedicinesCost)}
                      </td>
                      <td colSpan={2}></td>
                    </tr>
                  </tfoot>
                </table>

                {/* Rincian Pembayaran Resep Lengkap */}
                <div
                  className="card card-compact"
                  style={{
                    background: 'var(--slate-50)',
                    borderColor: 'var(--slate-200)',
                    marginBottom: 'var(--sp-4)',
                    padding: 'var(--sp-4)',
                  }}
                >
                  {/* Baris 1: Subtotal Obat, Biaya Resep, Total Tagihan */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-4)', marginBottom: 'var(--sp-3)', paddingBottom: 'var(--sp-3)', borderBottom: '1px solid var(--slate-200)' }}>
                    <div>
                      <div className="text-xs text-muted" style={{ fontWeight: 600 }}>Subtotal Biaya Obat</div>
                      <div style={{ fontSize: '1.1rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                        {formatRupiah(totalMedicinesCost)}
                      </div>
                    </div>

                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                        <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: 0 }}>
                          Biaya Jasa / Embalase (Rp)
                        </label>
                      </div>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--slate-400)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                          }}
                        >
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input"
                          style={{ paddingLeft: '36px', fontWeight: 700 }}
                          value={formatNumberDots(prescriptionFee)}
                          onChange={(e) => handlePrescriptionFeeChange(e.target.value)}
                          placeholder="0"
                        />
                      </div>
                      {/* Tombol biaya cepat */}
                      <div style={{ display: 'flex', gap: '4px', marginTop: '6px' }}>
                        {[0, 2000, 3000, 5000].map((fee) => (
                          <button
                            key={fee}
                            type="button"
                            className={`btn btn-xs ${prescriptionFee === fee ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => setPrescriptionFee(fee)}
                            style={{ fontSize: '0.72rem', padding: '2px 6px' }}
                          >
                            {fee === 0 ? 'Rp 0' : `+${fee / 1000}k`}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs text-muted" style={{ fontWeight: 600 }}>Total Tagihan Resep</div>
                      <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--teal-700)' }}>
                        {formatRupiah(totalPrescriptionBill)}
                      </div>
                    </div>
                  </div>

                  {/* Baris 2: Metode Pembayaran, Jumlah Dibayar Pasien, Kembalian */}
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--sp-3)', alignItems: 'flex-start' }}>
                    {/* Metode Pembayaran */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                        Metode Pembayaran
                      </label>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {(['TUNAI', 'QRIS', 'TRANSFER'] as const).map((m) => (
                          <button
                            key={m}
                            type="button"
                            className={`btn btn-sm ${paymentMethod === m ? 'btn-primary' : 'btn-secondary'}`}
                            onClick={() => {
                              setPaymentMethod(m);
                              if (m !== 'TUNAI') {
                                setPatientPaid(totalPrescriptionBill);
                                setIsManualPaid(false);
                              }
                            }}
                            style={{ flex: 1, padding: '6px 8px', fontSize: '0.8rem' }}
                          >
                            {m === 'TUNAI' ? 'Tunai' : m}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Input Jumlah Dibayar Pasien */}
                    <div className="form-group" style={{ marginBottom: 0 }}>
                      <label className="form-label" style={{ fontSize: '0.8rem', fontWeight: 600, marginBottom: '4px' }}>
                        Jumlah yang Dibayar Pasien (Rp)
                      </label>
                      <div style={{ position: 'relative' }}>
                        <span
                          style={{
                            position: 'absolute',
                            left: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            color: 'var(--slate-400)',
                            fontSize: '0.85rem',
                            fontWeight: 700,
                          }}
                        >
                          Rp
                        </span>
                        <input
                          type="text"
                          inputMode="numeric"
                          className="form-input"
                          style={{ paddingLeft: '36px', fontWeight: 700 }}
                          placeholder={formatNumberDots(totalPrescriptionBill) || '0'}
                          value={formatNumberDots(patientPaid)}
                          onChange={(e) => handlePaidChange(e.target.value)}
                          disabled={paymentMethod !== 'TUNAI'}
                        />
                      </div>
                    </div>

                    {/* Kembalian Pasien */}
                    <div>
                      <div className="text-xs text-muted" style={{ fontWeight: 600 }}>
                        {paymentMethod === 'TUNAI' ? 'Kembalian Pasien' : 'Status Pembayaran'}
                      </div>
                      <div
                        style={{
                          fontSize: '1.15rem',
                          fontWeight: 700,
                          marginTop: '4px',
                          color:
                            paymentMethod !== 'TUNAI' || patientPaid >= totalPrescriptionBill
                              ? 'var(--green-700)'
                              : 'var(--amber-700)',
                        }}
                      >
                        {paymentMethod !== 'TUNAI'
                          ? 'Lunas Non-Tunai'
                          : patientPaid >= totalPrescriptionBill
                          ? formatRupiah(changeAmount)
                          : `Kurang ${formatRupiah(totalPrescriptionBill - patientPaid)}`}
                      </div>
                    </div>
                  </div>

                  {/* Tombol Nominal Cepat (Hanya saat Tunai) */}
                  {paymentMethod === 'TUNAI' && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '12px', flexWrap: 'wrap', alignItems: 'center' }}>
                      <span className="text-xs text-muted" style={{ marginRight: '4px' }}>Nominal Cepat:</span>
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => {
                          setPatientPaid(totalPrescriptionBill);
                          setIsManualPaid(false);
                        }}
                        disabled={totalPrescriptionBill === 0}
                      >
                        Uang Pas ({formatRupiah(totalPrescriptionBill)})
                      </button>
                      {[20000, 50000, 100000, 200000].map((nominal) => (
                        <button
                          key={nominal}
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => {
                            setPatientPaid(nominal);
                            setIsManualPaid(true);
                          }}
                          disabled={totalPrescriptionBill === 0}
                        >
                          {nominal >= 1000 ? `${nominal / 1000} Rb` : formatRupiah(nominal)}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

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
                  Eksekusi Pengeluaran &amp; Pembayaran Resep
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
                      <th className="text-right">Jumlah yang Dibayar Pasien</th>
                      <th>Keterangan Resep</th>
                    </tr>
                  </thead>
                  <tbody>
                    {mutations.slice(0, 10).map((m) => {
                      const med = medicines.find((item) => item.id === m.medicineId);
                      const paid = getMutationPaidAmount(m, med);
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
                          <td className="text-right" style={{ color: 'var(--teal-700)', fontWeight: 700 }}>
                            {formatRupiah(paid)}
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

      {/* MODAL CETAK KWITANSI & ETIKET OBAT FARMASI */}
      {showEtiketModal && completedPrescription && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide" id="printable-prescription-modal" style={{ maxWidth: '780px' }}>
            <div className="modal-header no-print">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0 }}>Pelayanan Resep Selesai</h2>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--slate-100)', padding: '3px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${modalTab === 'KWITANSI' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setModalTab('KWITANSI')}
                    style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  >
                    📄 Kwitansi Pembayaran
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${modalTab === 'ETIKET' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setModalTab('ETIKET')}
                    style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  >
                    🏷️ Etiket Obat ({completedPrescription.items.length})
                  </button>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowEtiketModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
              {/* TAB 1: KWITANSI PEMBAYARAN RESEP */}
              {modalTab === 'KWITANSI' && (
                <div>
                  <div
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      borderRadius: '8px',
                      padding: '20px',
                      color: '#0f172a',
                      boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                    }}
                  >
                    {/* Header Faktur Apotek */}
                    <div style={{ textAlign: 'center', borderBottom: '2px solid #0f766e', paddingBottom: '12px', marginBottom: '16px' }}>
                      <h2 style={{ margin: '0 0 4px 0', fontSize: '1.25rem', color: '#0f766e', letterSpacing: '0.5px' }}>
                        APOTEK SEHAT SENTOSA
                      </h2>
                      <div style={{ fontSize: '0.8rem', color: '#475569' }}>
                        SIA: 503/Apt/2025 &bull; APA: Apt. Fadhil S.Farm &bull; Telp: (0411) 889900
                      </div>
                      <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginTop: '6px' }}>
                        KWITANSI PEMBAYARAN RESEP DOKTER
                      </div>
                    </div>

                    {/* Data Resep & Pasien */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '10px', fontSize: '0.85rem', marginBottom: '16px', background: '#f8fafc', padding: '12px', borderRadius: '6px' }}>
                      <div>
                        <div>No. Resep: <strong>{completedPrescription.recipeNo}</strong></div>
                        <div>Tgl/Waktu: <strong>{formatDate(completedPrescription.date)} {new Date(completedPrescription.date).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</strong></div>
                        <div>Metode Bayar: <strong className="badge badge-info" style={{ fontSize: '0.75rem', padding: '1px 6px' }}>{completedPrescription.paymentMethod}</strong></div>
                      </div>
                      <div>
                        <div>Pasien: <strong>{completedPrescription.patientName}</strong> {completedPrescription.patientAge && `(${completedPrescription.patientAge})`}</div>
                        <div>Dokter: <strong>{completedPrescription.doctorName}</strong></div>
                        {completedPrescription.diagnosis && (
                          <div style={{ color: '#0f766e' }}>Diagnosa: <strong>{completedPrescription.diagnosis}</strong></div>
                        )}
                        {completedPrescription.action && (
                          <div style={{ color: '#1d4ed8' }}>Tindakan: <strong>{completedPrescription.action}</strong></div>
                        )}
                      </div>
                    </div>

                    {/* Tabel Item Obat */}
                    <table className="data-table" style={{ width: '100%', marginBottom: '16px', fontSize: '0.85rem' }}>
                      <thead>
                        <tr style={{ background: '#f1f5f9' }}>
                          <th>Nama Obat &amp; Signa</th>
                          <th className="text-center">Jumlah</th>
                          <th className="text-right">Harga Satuan</th>
                          <th className="text-right">Subtotal</th>
                        </tr>
                      </thead>
                      <tbody>
                        {completedPrescription.items.map((item, idx) => (
                          <tr key={idx}>
                            <td>
                              <strong>{item.medicine.name}</strong>
                              <div className="text-xs text-muted">Aturan: {item.signa}</div>
                            </td>
                            <td className="text-center">{item.quantity} {item.unit}</td>
                            <td className="text-right">{formatRupiah(item.unitPrice)}</td>
                            <td className="text-right" style={{ fontWeight: 700 }}>{formatRupiah(item.subtotal)}</td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr>
                          <td colSpan={3} className="text-right" style={{ fontWeight: 600 }}>Subtotal Biaya Obat:</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{formatRupiah(completedPrescription.medicinesCost)}</td>
                        </tr>
                        {completedPrescription.prescriptionFee > 0 && (
                          <tr>
                            <td colSpan={3} className="text-right" style={{ fontWeight: 600 }}>Biaya Jasa / Embalase Resep:</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#0f766e' }}>{formatRupiah(completedPrescription.prescriptionFee)}</td>
                          </tr>
                        )}
                        <tr style={{ background: '#f8fafc', fontSize: '1rem' }}>
                          <td colSpan={3} className="text-right" style={{ fontWeight: 800, color: '#0f766e' }}>TOTAL TAGIHAN:</td>
                          <td className="text-right" style={{ fontWeight: 800, color: '#0f766e', fontSize: '1.1rem' }}>{formatRupiah(completedPrescription.totalCost)}</td>
                        </tr>
                        <tr>
                          <td colSpan={3} className="text-right">Jumlah Dibayar Pasien:</td>
                          <td className="text-right" style={{ fontWeight: 700 }}>{formatRupiah(completedPrescription.amountPaid)}</td>
                        </tr>
                        {completedPrescription.changeAmount > 0 && (
                          <tr>
                            <td colSpan={3} className="text-right" style={{ color: '#16a34a', fontWeight: 600 }}>Kembalian Pasien:</td>
                            <td className="text-right" style={{ fontWeight: 700, color: '#16a34a' }}>{formatRupiah(completedPrescription.changeAmount)}</td>
                          </tr>
                        )}
                      </tfoot>
                    </table>

                    {/* Footer Kwitansi */}
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginTop: '20px', paddingTop: '12px', borderTop: '1px dashed #cbd5e1', fontSize: '0.8rem' }}>
                      <div style={{ color: '#64748b' }}>
                        <div>&bull; Obat yang sudah dibeli tidak dapat ditukar/dikembalikan</div>
                        <div>&bull; Simpan struk ini sebagai bukti pembayaran yang sah</div>
                        <div style={{ marginTop: '4px', fontWeight: 600, color: '#0f766e' }}>Semoga Lekas Sembuh &amp; Sehat Selalu</div>
                      </div>
                      <div style={{ textAlign: 'center', minWidth: '150px' }}>
                        <div style={{ marginBottom: '40px' }}>Petugas Farmasi / Kasir,</div>
                        <div style={{ borderTop: '1px solid #334155', paddingTop: '4px', fontWeight: 700 }}>Apt. Fadhil S.Farm</div>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* TAB 2: ETIKET OBAT FARMASI */}
              {modalTab === 'ETIKET' && (
                <div>
                  <p className="text-sm text-muted" style={{ marginBottom: '12px' }}>
                    Label etiket aturan pakai obat resep untuk ditempelkan pada wadah/kemasan obat:
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
              )}
            </div>
            <div className="modal-footer no-print">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setModalTab('KWITANSI');
                  setTimeout(() => window.print(), 100);
                }}
              >
                🖨️ Cetak Kwitansi Resep
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setModalTab('ETIKET');
                  setTimeout(() => window.print(), 100);
                }}
              >
                🏷️ Cetak Etiket
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
