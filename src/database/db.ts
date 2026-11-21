// ============================================================
// DB — Local cache & Supabase Cloud Synchronization
// ============================================================

import {
  Medicine,
  StockBatch,
  StockMutation,
  Sale,
  SaleItem,
  BatchStatus,
  PrescriptionRecord,
  PrescriptionRecordItem,
  MutationType,
} from './schema';
import {
  seedMedicines,
  seedBatches,
  seedMutations,
  seedSales,
  seedSaleItems,
} from './seed';
import { daysUntilExpiry, formatDateInput, generateId, today } from '@/lib/formatters';
import {
  cloudFetchMedicines,
  cloudFetchBatches,
  cloudFetchMutations,
  cloudFetchSales,
  cloudFetchSaleItems,
  isSupabaseReady,
} from '@/lib/supabase';
import { enqueue, flushOutbox, hasPendingSync, outboxStamp, canOverwriteLocal } from '@/lib/outbox';

const KEYS = {
  medicines: 'apotek_medicines',
  batches: 'apotek_batches',
  mutations: 'apotek_mutations',
  sales: 'apotek_sales',
  saleItems: 'apotek_sale_items',
  prescriptions: 'apotek_prescription_records',
  seeded: 'apotek_seeded',
} as const;

function getStore<T>(key: string): T[] {
  if (typeof window === 'undefined') return [];
  const raw = localStorage.getItem(key);
  return raw ? JSON.parse(raw) : [];
}

function setStore<T>(key: string, data: T[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(key, JSON.stringify(data));
}

const PURGE_KEY = 'apotek_clean_slate_v1';

export function clearAllData(): void {
  if (typeof window === 'undefined') return;
  setStore(KEYS.medicines, []);
  setStore(KEYS.batches, []);
  setStore(KEYS.mutations, []);
  setStore(KEYS.sales, []);
  setStore(KEYS.saleItems, []);
  localStorage.setItem('apotek_gudang_rows', JSON.stringify([]));
  localStorage.setItem('apotek_gudang_file_name', 'Data Master Gudang');
  localStorage.setItem(KEYS.seeded, 'true');
  localStorage.setItem(PURGE_KEY, 'true');
}

// ── Cloud Synchronization ──

/**
 * Tarik data cloud dan timpa cache lokal. Dilewati bila masih ada tulis yang belum terkirim,
 * atau ada tulis lokal selama fetch (data lokal lebih baru dan tidak boleh tertimpa).
 */
export async function syncFromCloud(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!isSupabaseReady()) return false;

  await flushOutbox();
  if (hasPendingSync()) return false;
  const stamp = outboxStamp();

  try {
    const [cloudMeds, cloudBatches, cloudMutations, cloudSales, cloudItems] = await Promise.all([
      cloudFetchMedicines(),
      cloudFetchBatches(),
      cloudFetchMutations(),
      cloudFetchSales(),
      cloudFetchSaleItems(),
    ]);

    if (!canOverwriteLocal(stamp)) return false;

    let changed = false;

    if (cloudMeds !== null) {
      setStore(KEYS.medicines, cloudMeds);
      changed = true;
    }
    if (cloudBatches !== null) {
      setStore(KEYS.batches, cloudBatches);
      changed = true;
    }
    if (cloudMutations !== null) {
      setStore(KEYS.mutations, cloudMutations);
      changed = true;
    }
    if (cloudSales !== null) {
      setStore(KEYS.sales, cloudSales);
      changed = true;
    }
    if (cloudItems !== null) {
      setStore(KEYS.saleItems, cloudItems);
      changed = true;
    }

    if (changed && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('apotek-cloud-synced'));
    }
    return true;
  } catch (err) {
    console.error('syncFromCloud error:', err);
    return false;
  }
}

// ── Initialize / Seed ──

export function initDB(): void {
  if (typeof window === 'undefined') return;

  // Satu kali pembersihan total data dummy lama bagi user yang sudah deploy
  if (!localStorage.getItem(PURGE_KEY)) {
    clearAllData();
  } else if (!localStorage.getItem(KEYS.seeded)) {
    clearAllData();
  }

  // Jika Supabase terhubung, jalankan sinkronisasi awan di background
  if (isSupabaseReady()) {
    syncFromCloud();
  }

  // Migrasi otomatis data lama: ubah baseUnit 'Tablet' menjadi 'Biji'
  const existingMeds = getStore<Medicine>(KEYS.medicines);
  if (existingMeds.length > 0) {
    let hasChanges = false;
    const updated = existingMeds.map((m) => {
      if (m.baseUnit && m.baseUnit.toLowerCase() === 'tablet') {
        hasChanges = true;
        return { ...m, baseUnit: 'Biji' };
      }
      return m;
    });
    if (hasChanges) {
      setStore(KEYS.medicines, updated);
    }
  }
}

// ── Medicines ──

export function getMedicines(): Medicine[] {
  const meds = getStore<Medicine>(KEYS.medicines);
  return meds.map((m) => {
    if (m.baseUnit && m.baseUnit.toLowerCase() === 'tablet') {
      return { ...m, baseUnit: 'Biji' };
    }
    return m;
  });
}

export function getMedicineById(id: string): Medicine | undefined {
  return getMedicines().find((m) => m.id === id);
}

export function addMedicine(med: Medicine): void {
  const all = getMedicines();
  all.push(med);
  setStore(KEYS.medicines, all);
  enqueue({ kind: 'medicineUpsert', data: med });
}

export function updateMedicine(id: string, updates: Partial<Medicine>): void {
  const all = getMedicines();
  const idx = all.findIndex((m) => m.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates, updatedAt: new Date().toISOString() };
  setStore(KEYS.medicines, all);
  enqueue({ kind: 'medicineUpsert', data: all[idx] });
}

export function deleteMedicine(id: string): void {
  setStore(
    KEYS.medicines,
    getMedicines().filter((m) => m.id !== id)
  );
  enqueue({ kind: 'medicineDelete', id });
}

// ── StockBatches ──

export function getBatches(): StockBatch[] {
  return getStore<StockBatch>(KEYS.batches);
}

export function getBatchesByMedicine(medicineId: string): StockBatch[] {
  return getBatches().filter((b) => b.medicineId === medicineId);
}

export function addBatch(batch: StockBatch): void {
  const all = getBatches();
  all.push(batch);
  setStore(KEYS.batches, all);
  enqueue({ kind: 'batchUpsert', data: batch });
}

export function updateBatch(id: string, updates: Partial<StockBatch>): void {
  const all = getBatches();
  const idx = all.findIndex((b) => b.id === id);
  if (idx === -1) return;
  all[idx] = { ...all[idx], ...updates };
  setStore(KEYS.batches, all);
  enqueue({ kind: 'batchUpsert', data: all[idx] });
}

export function deleteBatchesByMedicine(medicineId: string): void {
  const all = getBatches();
  const targetIds = all.filter((b) => b.medicineId === medicineId).map((b) => b.id);
  setStore(
    KEYS.batches,
    all.filter((b) => b.medicineId !== medicineId)
  );
  if (targetIds.length > 0) enqueue({ kind: 'batchDelete', ids: targetIds });
}

/** Batch yang boleh dijual: stok > 0, belum kedaluwarsa, dan tidak RETURNED. */
function isSellable(b: StockBatch): boolean {
  return (
    b.totalBaseQty > 0 &&
    b.status !== BatchStatus.EXPIRED &&
    b.status !== BatchStatus.RETURNED &&
    daysUntilExpiry(b.expiryDate) > 0
  );
}

/** Batch sellable milik satu obat, urut FEFO (kedaluwarsa paling awal dulu). */
function sellableBatchesFEFO(batches: StockBatch[], medicineId: string): StockBatch[] {
  return batches
    .filter((b) => b.medicineId === medicineId && isSellable(b))
    .sort((a, b) => new Date(a.expiryDate).getTime() - new Date(b.expiryDate).getTime());
}

/**
 * Reduce stock from a specific batch (koreksi rusak/pecah).
 * Returns false if insufficient stock.
 */
export function reduceStock(batchId: string, baseQty: number): boolean {
  const all = getBatches();
  const idx = all.findIndex((b) => b.id === batchId);
  if (idx === -1) return false;
  if (all[idx].totalBaseQty < baseQty) return false;
  all[idx].totalBaseQty -= baseQty;
  setStore(KEYS.batches, all);
  enqueue({ kind: 'batchUpsert', data: all[idx] });
  return true;
}

/** Total stok sellable obat: satu-satunya sumber untuk kasir, resep, dan dashboard. */
export function getTotalStock(medicineId: string): number {
  return sellableBatchesFEFO(getBatches(), medicineId).reduce((sum, b) => sum + b.totalBaseQty, 0);
}

/** Batch FEFO berikutnya untuk dijual. */
export function getBestBatchForSale(medicineId: string): StockBatch | null {
  return sellableBatchesFEFO(getBatches(), medicineId)[0] ?? null;
}

const QTY_EPSILON = 1e-9;

/**
 * Alokasikan qty ke batch FEFO. MEMUTASI `batches` in-place: hanya pakai hasil getBatches().
 * Mengembalikan null bila stok sellable tidak cukup.
 */
function allocateFEFO(
  batches: StockBatch[],
  medicineId: string,
  baseQty: number
): { batch: StockBatch; deductedQty: number }[] | null {
  let remaining = baseQty;
  const out: { batch: StockBatch; deductedQty: number }[] = [];
  for (const batch of sellableBatchesFEFO(batches, medicineId)) {
    if (remaining <= QTY_EPSILON) break;
    const take = Math.min(batch.totalBaseQty, remaining);
    batch.totalBaseQty -= take;
    remaining -= take;
    out.push({ batch, deductedQty: take });
  }
  return remaining > QTY_EPSILON ? null : out;
}

// ── StockMutations ──

export function getMutations(): StockMutation[] {
  return getStore<StockMutation>(KEYS.mutations);
}

export function getMutationsByMedicine(medicineId: string): StockMutation[] {
  return getMutations().filter((m) => m.medicineId === medicineId);
}

export function addMutation(mutation: StockMutation): void {
  const all = getMutations();
  all.push(mutation);
  setStore(KEYS.mutations, all);
  enqueue({ kind: 'mutationAdd', data: mutation });
}

export function deleteMutation(id: string): void {
  const all = getMutations();
  setStore(KEYS.mutations, all.filter((m) => m.id !== id));
}

export function deleteMutationsByRef(referenceNumber: string): void {
  const all = getMutations();
  const cleanRef = referenceNumber.trim().toLowerCase();
  setStore(KEYS.mutations, all.filter((m) => (m.referenceNumber || '').trim().toLowerCase() !== cleanRef));
}

// ── Sales ──

export function getSales(): Sale[] {
  return getStore<Sale>(KEYS.sales);
}

export function getTodaySales(): Sale[] {
  // Tanggal lokal perangkat, bukan UTC, agar transaksi dini hari tidak masuk ke hari kemarin
  const todayStr = today();
  return getSales().filter((s) => formatDateInput(s.createdAt) === todayStr);
}

// ── Sale Items ──

export function getSaleItems(): SaleItem[] {
  return getStore<SaleItem>(KEYS.saleItems);
}

export function getSaleItemsBySale(saleId: string): SaleItem[] {
  return getSaleItems().filter((si) => si.saleId === saleId);
}

/** Satu baris stok keluar; dipecah per batch oleh allocateFEFO. */
export interface StockLine {
  /** SaleItem.id yang diisi batchId dari batch FEFO pertama */
  itemId: string;
  medicineId: string;
  /** Qty dalam satuan dasar */
  baseQty: number;
  /** Field mutasi bersama; id, batchId, qtyChange dibuat per batch */
  mutation: Omit<StockMutation, 'id' | 'batchId' | 'qtyChange'>;
}

/**
 * Simpan transaksi (penjualan kasir / pengeluaran resep) semua-atau-tidak-sama-sekali.
 * Alokasi FEFO dihitung pada salinan in-memory; bila ada baris yang kurang stok,
 * tidak ada yang ditulis. Bila lolos: batch, mutasi (satu per batch), sale & sale items
 * ditulis lokal lalu diantrikan ke cloud.
 */
export function commitSale(
  sale: Sale,
  items: SaleItem[],
  stockLines: StockLine[]
): { ok: true } | { ok: false; medicineId: string } {
  const batches = getBatches();
  const touched = new Set<StockBatch>();
  const newMutations: StockMutation[] = [];
  const firstBatchByItem = new Map<string, string>();

  for (const line of stockLines) {
    const allocations = allocateFEFO(batches, line.medicineId, line.baseQty);
    if (!allocations) return { ok: false, medicineId: line.medicineId };

    for (const { batch, deductedQty } of allocations) {
      touched.add(batch);
      if (!firstBatchByItem.has(line.itemId)) firstBatchByItem.set(line.itemId, batch.id);
      newMutations.push({
        ...line.mutation,
        id: generateId(),
        batchId: batch.id,
        qtyChange: -deductedQty,
        notes: `${line.mutation.notes} | Batch ${batch.batchNumber} (-${deductedQty})`,
      });
    }
  }

  const savedItems = items.map((it) => {
    const batchId = firstBatchByItem.get(it.id);
    return batchId ? { ...it, batchId } : it;
  });

  setStore(KEYS.batches, batches);
  for (const b of touched) enqueue({ kind: 'batchUpsert', data: b });

  setStore(KEYS.mutations, [...getMutations(), ...newMutations]);
  for (const m of newMutations) enqueue({ kind: 'mutationAdd', data: m });

  setStore(KEYS.sales, [...getSales(), sale]);
  setStore(KEYS.saleItems, [...getSaleItems(), ...savedItems]);
  enqueue({ kind: 'saleSave', sale, items: savedItems });

  return { ok: true };
}

// ── Prescription Records (Riwayat & Impor Pengeluaran Resep) ──

export function getStoredPrescriptionRecords(): PrescriptionRecord[] {
  return getStore<PrescriptionRecord>(KEYS.prescriptions);
}

export function savePrescriptionRecord(record: PrescriptionRecord): void {
  const all = getStoredPrescriptionRecords();
  const idx = all.findIndex((r) => r.id === record.id || r.prescriptionNo === record.prescriptionNo);
  if (idx >= 0) {
    all[idx] = record;
  } else {
    all.unshift(record);
  }
  setStore(KEYS.prescriptions, all);
}

export function getPrescriptionRecords(): PrescriptionRecord[] {
  const stored = getStoredPrescriptionRecords();
  const storedRxNos = new Set(stored.map((r) => (r.prescriptionNo || '').toLowerCase().trim()));

  // Ekstrak dari riwayat mutasi PENGELUARAN_RESEP lokal
  const mutations = getMutations().filter((m) => m.mutationType === MutationType.PENGELUARAN_RESEP);
  const groupedMutations: Record<string, StockMutation[]> = {};

  for (const m of mutations) {
    const rxNo = (m.referenceNumber || 'RXP-UNKNOWN').trim();
    if (!groupedMutations[rxNo]) {
      groupedMutations[rxNo] = [];
    }
    groupedMutations[rxNo].push(m);
  }

  const extracted: PrescriptionRecord[] = [];
  const meds = getMedicines();
  const medMap = new Map(meds.map((med) => [med.id, med.name]));

  for (const [rxNo, mutList] of Object.entries(groupedMutations)) {
    if (storedRxNos.has(rxNo.toLowerCase())) {
      continue;
    }

    const first = mutList[0];
    const notes = first.notes || '';

    let patientName = 'Pasien Umum';
    let patientAge = '';
    let doctorName = '';
    let examFee = first.paidAmount || 0;

    const pMatch = notes.match(/Pasien:\s*([^|(]+)(?:\(([^)]*)\))?/i);
    if (pMatch) {
      patientName = pMatch[1]?.trim() || patientName;
      patientAge = pMatch[2]?.trim() || '';
    }

    const dMatch = notes.match(/dr\.\s*([^|]+)/i);
    if (dMatch) {
      doctorName = dMatch[1]?.trim() || '';
    }

    const feeMatch = notes.match(/Biaya Pemeriksaan:\s*Rp\s*([\d.,]+)/i);
    if (feeMatch && !examFee) {
      const clean = feeMatch[1].replace(/\D/g, '');
      if (clean) examFee = parseInt(clean, 10);
    }

    // Satu baris resep = satu obat. Mutasi per batch (batchId ada) digabung; impor/legacy (batchId null) tetap per mutasi.
    const lineHeads = new Map<string, StockMutation>();
    for (const m of mutList) {
      const key = m.batchId ? `${m.medicineId}|${m.createdAt}|${m.unitUsed}` : `id:${m.id}`;
      if (!lineHeads.has(key)) lineHeads.set(key, m);
    }
    const items: PrescriptionRecordItem[] = Array.from(lineHeads.values()).map((m) => {
      const medName = medMap.get(m.medicineId) || 'Obat Resep';
      const unitUsed = m.unitUsed || '';
      const uParts = unitUsed.split(' ');
      const qty = Math.abs(parseFloat(uParts[0]) || m.qtyChange || 1);
      const unit = uParts.slice(1).join(' ') || 'Biji';

      const signaMatch = m.notes.match(/Aturan:\s*([^|]+)/i);
      const signa = signaMatch ? signaMatch[1].trim() : 'Sesuai petunjuk dokter';

      return {
        medicineName: medName,
        quantity: qty,
        unit,
        signa,
        labelType: /sirup|tetes|salep/i.test(unit) ? 'LUAR' : 'DALAM',
      };
    });

    extracted.push({
      id: first.id,
      prescriptionNo: rxNo,
      patientName,
      patientAge,
      doctorName: doctorName ? `dr. ${doctorName}` : 'dr. Praktek Umum',
      diagnosis: first.diagnosis || '',
      action: first.action || '',
      examinationFee: examFee,
      totalCost: examFee,
      date: first.createdAt || new Date().toISOString(),
      items,
      notes,
      source: 'LOCAL',
    });
  }

  const combined = [...stored, ...extracted].sort((a, b) => {
    return new Date(b.date).getTime() - new Date(a.date).getTime();
  });

  return combined;
}

export function importPrescriptionRecords(
  records: PrescriptionRecord[],
  syncToMutations: boolean = true
): void {
  const current = getStoredPrescriptionRecords();
  const currentRxMap = new Map(current.map((r) => [(r.prescriptionNo || '').toLowerCase().trim(), r]));

  records.forEach((rec) => {
    currentRxMap.set((rec.prescriptionNo || '').toLowerCase().trim(), rec);

    if (syncToMutations) {
      const existingMutations = getMutations();
      const exists = existingMutations.some(
        (m) => (m.referenceNumber || '').toLowerCase().trim() === (rec.prescriptionNo || '').toLowerCase().trim()
      );
      if (!exists && rec.items && rec.items.length > 0) {
        rec.items.forEach((item, idx) => {
          addMutation({
            id: `mut-imp-${Date.now().toString(36)}-${idx}-${Math.random().toString(36).substring(2, 6)}`,
            medicineId: 'IMP-MED',
            batchId: null,
            mutationType: MutationType.PENGELUARAN_RESEP,
            qtyChange: -Math.abs(item.quantity || 1),
            unitUsed: `${item.quantity} ${item.unit || 'Biji'}`,
            referenceNumber: rec.prescriptionNo,
            notes: `Pasien: ${rec.patientName} (${rec.patientAge || '-'}) | ${rec.doctorName || '-'} | Diagnosa: ${rec.diagnosis || '-'} | Tindakan: ${rec.action || '-'} | Biaya Pemeriksaan: Rp ${rec.examinationFee || 0} | Aturan: ${item.signa || '-'} | [Impor Riwayat]`,
            diagnosis: rec.diagnosis,
            action: rec.action,
            paidAmount: rec.examinationFee,
            createdAt: rec.date || new Date().toISOString(),
          });
        });
      }
    }
  });

  setStore(KEYS.prescriptions, Array.from(currentRxMap.values()));
}

export function deletePrescriptionRecord(idOrRxNo: string): void {
  const stored = getStoredPrescriptionRecords();
  const clean = idOrRxNo.toLowerCase().trim();
  const filtered = stored.filter(
    (r) => r.id.toLowerCase().trim() !== clean && (r.prescriptionNo || '').toLowerCase().trim() !== clean
  );
  setStore(KEYS.prescriptions, filtered);

  deleteMutationsByRef(idOrRxNo);
}

/**
 * Reset all data and re-seed
 */
export function resetDB(): void {
  if (typeof window === 'undefined') return;
  Object.values(KEYS).forEach((k) => localStorage.removeItem(k));
  initDB();
}
