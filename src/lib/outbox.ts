// ============================================================
// Outbox — antrean tulis ke Supabase yang belum terkirim
// Setiap tulis cloud diantrikan ke localStorage lalu dikirim berurutan (FIFO).
// Operasi yang gagal tetap di antrean dan dicoba lagi pada flush berikutnya
// (tulis baru, focus, init). Semua operasi idempoten (upsert / delete by id).
// Selama antrean belum kosong, data cloud TIDAK boleh menimpa cache lokal.
// ============================================================

import type { Medicine, Sale, SaleItem, StockBatch, StockMutation } from '@/database/schema';
import {
  cloudAddMutation,
  cloudDeleteBatches,
  cloudDeleteMedicine,
  cloudSaveSale,
  cloudSaveWarehouse,
  cloudUpsertBatch,
  cloudUpsertMedicine,
  isSupabaseReady,
} from '@/lib/supabase';

const OUTBOX_KEY = 'apotek_outbox';

export type OutboxOp =
  | { kind: 'medicineUpsert'; data: Medicine }
  | { kind: 'medicineDelete'; id: string }
  | { kind: 'batchUpsert'; data: StockBatch }
  | { kind: 'batchDelete'; ids: string[] }
  | { kind: 'mutationAdd'; data: StockMutation }
  | { kind: 'saleSave'; sale: Sale; items: SaleItem[] }
  | {
      kind: 'warehouseSave';
      rows: Record<string, any>[];
      allCols: string[];
      selCols: string[];
      name: string;
    };

/** Naik setiap ada tulis baru; dipakai mendeteksi tulis lokal selama fetch cloud. */
let version = 0;

function readQueue(): OutboxOp[] {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(OUTBOX_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeQueue(ops: OutboxOp[]): void {
  localStorage.setItem(OUTBOX_KEY, JSON.stringify(ops));
}

function send(op: OutboxOp): Promise<boolean> {
  switch (op.kind) {
    case 'medicineUpsert':
      return cloudUpsertMedicine(op.data);
    case 'medicineDelete':
      return cloudDeleteMedicine(op.id);
    case 'batchUpsert':
      return cloudUpsertBatch(op.data);
    case 'batchDelete':
      return cloudDeleteBatches(op.ids);
    case 'mutationAdd':
      return cloudAddMutation(op.data);
    case 'saleSave':
      return cloudSaveSale(op.sale, op.items);
    case 'warehouseSave':
      return cloudSaveWarehouse(op.rows, op.allCols, op.selCols, op.name);
  }
}

/** True jika ada tulis lokal yang belum terkirim ke cloud. */
export function hasPendingSync(): boolean {
  return readQueue().length > 0;
}

/** Catat versi sebelum fetch cloud; pasangkan dengan canOverwriteLocal setelah fetch. */
export function outboxStamp(): number {
  return version;
}

/** Aman menimpa cache lokal: tidak ada antrean dan tidak ada tulis sejak `stamp`. */
export function canOverwriteLocal(stamp: number): boolean {
  return !hasPendingSync() && stamp === version;
}

let running: Promise<void> | null = null;

/**
 * Kirim antrean sekarang. Single-flight: pemanggil paralel berbagi satu proses.
 * `await Promise.resolve()` memastikan `running` sudah terisi sebelum loop mulai,
 * dan `finally` dijalankan segera setelah pengecekan antrean terakhir, tanpa celah.
 */
export function flushOutbox(): Promise<void> {
  if (!running) {
    running = (async () => {
      await Promise.resolve();
      try {
        while (isSupabaseReady()) {
          const queue = readQueue();
          if (queue.length === 0) break;
          if (!(await send(queue[0]))) break; // tetap di antrean; dicoba lagi nanti
          // Hanya flush ini yang menghapus head; enqueue hanya menambah di ujung.
          writeQueue(readQueue().slice(1));
        }
      } finally {
        running = null;
      }
    })();
  }
  return running;
}

/** Antrikan tulis cloud lalu coba kirim. Tanpa konfigurasi Supabase, tidak ada yang diantrikan. */
export function enqueue(op: OutboxOp): void {
  if (!isSupabaseReady()) return;
  version++;
  writeQueue([...readQueue(), op]);
  flushOutbox().catch((err) => console.error('Outbox flush gagal:', err));
}
