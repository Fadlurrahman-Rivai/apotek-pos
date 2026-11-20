// ============================================================
// Supabase Client & Cloud Synchronization Helper
// ============================================================

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import {
  Medicine,
  StockBatch,
  StockMutation,
  Sale,
  SaleItem,
  MedicineCategory,
  BatchStatus,
  MutationType,
} from '@/database/schema';

const DEFAULT_SUPABASE_URL = 'https://xchgghsomfsuhnapndkh.supabase.co';
const DEFAULT_SUPABASE_ANON_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhjaGdnaHNvbWZzdWhuYXBuZGtoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTAxNDY4MzgsImV4cCI6MjEwNTcyMjgzOH0.oMT21Ne-0GvzoP-ry__UBht99DlVzYoScRPPOVcNTa4';

const STORAGE_KEYS = {
  url: 'apotek_supabase_url',
  key: 'apotek_supabase_key',
  disconnected: 'apotek_supabase_disconnected',
};

// Ambil URL dan Key dari Environment Variable atau Default Project
export function getSupabaseCredentials(): { url: string; key: string } {
  if (typeof window !== 'undefined' && localStorage.getItem(STORAGE_KEYS.disconnected) === 'true') {
    const localUrl = localStorage.getItem(STORAGE_KEYS.url);
    const localKey = localStorage.getItem(STORAGE_KEYS.key);
    if (localUrl && localKey) {
      return { url: localUrl.trim(), key: localKey.trim() };
    }
    return { url: '', key: '' };
  }

  let url = process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_SUPABASE_URL;
  let key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || DEFAULT_SUPABASE_ANON_KEY;

  if (typeof window !== 'undefined') {
    const localUrl = localStorage.getItem(STORAGE_KEYS.url);
    const localKey = localStorage.getItem(STORAGE_KEYS.key);
    if (localUrl && localKey) {
      url = localUrl.trim();
      key = localKey.trim();
    }
  }

  return { url: url.trim(), key: key.trim() };
}

let cachedClient: SupabaseClient | null = null;
let lastClientKey = '';

export function getSupabase(): SupabaseClient | null {
  const { url, key } = getSupabaseCredentials();

  if (!url || !key || url.includes('placeholder') || key.includes('placeholder')) {
    return null;
  }

  const combined = `${url}___${key}`;
  if (cachedClient && lastClientKey === combined) {
    return cachedClient;
  }

  try {
    cachedClient = createClient(url, key, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
    lastClientKey = combined;
    return cachedClient;
  } catch (err) {
    console.error('Failed to initialize Supabase client:', err);
    return null;
  }
}

export function isSupabaseReady(): boolean {
  return getSupabase() !== null;
}

export function saveSupabaseCredentials(url: string, key: string): void {
  if (typeof window === 'undefined') return;
  if (!url || !key) {
    localStorage.setItem(STORAGE_KEYS.disconnected, 'true');
    localStorage.removeItem(STORAGE_KEYS.url);
    localStorage.removeItem(STORAGE_KEYS.key);
  } else {
    localStorage.removeItem(STORAGE_KEYS.disconnected);
    localStorage.setItem(STORAGE_KEYS.url, url.trim());
    localStorage.setItem(STORAGE_KEYS.key, key.trim());
  }
  cachedClient = null;
  lastClientKey = '';
}

// ------------------------------------------------------------
// Cloud CRUD Functions for Medicines
// ------------------------------------------------------------

export async function cloudFetchMedicines(): Promise<Medicine[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('medicines').select('*').order('name', { ascending: true });
    if (error) throw error;
    if (!data) return [];

    return data.map((d: any) => ({
      id: d.id,
      name: d.name,
      category: d.category as MedicineCategory,
      baseUnit: d.base_unit,
      secondaryUnit: d.secondary_unit || null,
      tertiaryUnit: d.tertiary_unit || null,
      piecesPerSecondary: d.pieces_per_secondary ? Number(d.pieces_per_secondary) : null,
      secondaryPerTertiary: d.secondary_per_tertiary ? Number(d.secondary_per_tertiary) : null,
      buyPrice: Number(d.buy_price || 0),
      sellPrice: Number(d.sell_price || 0),
      sellPriceSecondary: d.sell_price_secondary ? Number(d.sell_price_secondary) : null,
      sellPriceBase: d.sell_price_base ? Number(d.sell_price_base) : null,
      minStock: Number(d.min_stock || 0),
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }));
  } catch (err) {
    console.error('cloudFetchMedicines error:', err);
    return null;
  }
}

export async function cloudUpsertMedicine(med: Medicine): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const payload = {
      id: med.id,
      name: med.name,
      category: med.category,
      base_unit: med.baseUnit,
      secondary_unit: med.secondaryUnit,
      tertiary_unit: med.tertiaryUnit,
      pieces_per_secondary: med.piecesPerSecondary,
      secondary_per_tertiary: med.secondaryPerTertiary,
      buy_price: med.buyPrice,
      sell_price: med.sellPrice,
      sell_price_secondary: med.sellPriceSecondary,
      sell_price_base: med.sellPriceBase,
      min_stock: med.minStock,
      created_at: med.createdAt,
      updated_at: new Date().toISOString(),
    };

    const { error } = await sb.from('medicines').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudUpsertMedicine error:', err);
    return false;
  }
}

export async function cloudDeleteMedicine(id: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('medicines').delete().eq('id', id);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudDeleteMedicine error:', err);
    return false;
  }
}

// ------------------------------------------------------------
// Cloud CRUD Functions for Batches
// ------------------------------------------------------------

export async function cloudFetchBatches(): Promise<StockBatch[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('stock_batches').select('*');
    if (error) throw error;
    if (!data) return [];

    return data.map((d: any) => ({
      id: d.id,
      medicineId: d.medicine_id,
      batchNumber: d.batch_number,
      expiryDate: d.expiry_date,
      totalBaseQty: Number(d.total_base_qty || 0),
      supplierName: d.supplier_name || '',
      receivedDate: d.received_date || '',
      status: d.status as BatchStatus,
    }));
  } catch (err) {
    console.error('cloudFetchBatches error:', err);
    return null;
  }
}

export async function cloudUpsertBatch(batch: StockBatch): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const payload = {
      id: batch.id,
      medicine_id: batch.medicineId,
      batch_number: batch.batchNumber,
      expiry_date: batch.expiryDate,
      total_base_qty: batch.totalBaseQty,
      supplier_name: batch.supplierName,
      received_date: batch.receivedDate,
      status: batch.status,
    };

    const { error } = await sb.from('stock_batches').upsert(payload, { onConflict: 'id' });
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudUpsertBatch error:', err);
    return false;
  }
}

export async function cloudDeleteBatches(ids: string[]): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('stock_batches').delete().in('id', ids);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudDeleteBatches error:', err);
    return false;
  }
}

// ------------------------------------------------------------
// Cloud CRUD Functions for Mutations
// ------------------------------------------------------------

export async function cloudFetchMutations(): Promise<StockMutation[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb
      .from('stock_mutations')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    return data.map((d: any) => ({
      id: d.id,
      medicineId: d.medicine_id,
      batchId: d.batch_id || null,
      mutationType: d.mutation_type as MutationType,
      qtyChange: Number(d.qty_change || 0),
      unitUsed: d.unit_used || '',
      referenceNumber: d.reference_number || '',
      notes: d.notes || '',
      createdAt: d.created_at,
    }));
  } catch (err) {
    console.error('cloudFetchMutations error:', err);
    return null;
  }
}

export async function cloudAddMutation(m: StockMutation): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const payload = {
      id: m.id,
      medicine_id: m.medicineId,
      batch_id: m.batchId,
      mutation_type: m.mutationType,
      qty_change: m.qtyChange,
      unit_used: m.unitUsed,
      reference_number: m.referenceNumber,
      notes: m.notes,
      created_at: m.createdAt,
    };

    const { error } = await sb.from('stock_mutations').insert(payload);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudAddMutation error:', err);
    return false;
  }
}

// ------------------------------------------------------------
// Cloud CRUD Functions for Sales
// ------------------------------------------------------------

export async function cloudFetchSales(): Promise<Sale[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('sales').select('*').order('created_at', { ascending: false });
    if (error) throw error;
    if (!data) return [];

    return data.map((d: any) => ({
      id: d.id,
      invoiceNumber: d.invoice_number,
      totalAmount: Number(d.total_amount || 0),
      amountPaid: Number(d.amount_paid || 0),
      changeAmount: Number(d.change_amount || 0),
      createdAt: d.created_at,
    }));
  } catch (err) {
    console.error('cloudFetchSales error:', err);
    return null;
  }
}

export async function cloudFetchSaleItems(): Promise<SaleItem[] | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const { data, error } = await sb.from('sale_items').select('*');
    if (error) throw error;
    if (!data) return [];

    return data.map((d: any) => ({
      id: d.id,
      saleId: d.sale_id,
      medicineId: d.medicine_id,
      batchId: d.batch_id || null,
      medicineName: d.medicine_name,
      unit: d.unit,
      quantity: Number(d.quantity || 0),
      unitPrice: Number(d.unit_price || 0),
      subtotal: Number(d.subtotal || 0),
    }));
  } catch (err) {
    console.error('cloudFetchSaleItems error:', err);
    return null;
  }
}

export async function cloudSaveSale(sale: Sale, items: SaleItem[]): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const salePayload = {
      id: sale.id,
      invoice_number: sale.invoiceNumber,
      total_amount: sale.totalAmount,
      amount_paid: sale.amountPaid,
      change_amount: sale.changeAmount,
      created_at: sale.createdAt,
    };

    const { error: saleErr } = await sb.from('sales').insert(salePayload);
    if (saleErr) throw saleErr;

    if (items.length > 0) {
      const itemsPayload = items.map((it) => ({
        id: it.id,
        sale_id: it.saleId,
        medicine_id: it.medicineId,
        batch_id: it.batchId,
        medicine_name: it.medicineName,
        unit: it.unit,
        quantity: it.quantity,
        unit_price: it.unitPrice,
        subtotal: it.subtotal,
      }));

      const { error: itemsErr } = await sb.from('sale_items').insert(itemsPayload);
      if (itemsErr) throw itemsErr;
    }

    return true;
  } catch (err) {
    console.error('cloudSaveSale error:', err);
    return false;
  }
}

// ------------------------------------------------------------
// Cloud CRUD Functions for Master Gudang (Warehouse)
// ------------------------------------------------------------

export async function cloudFetchWarehouse(): Promise<{
  rows: Record<string, any>[];
  allColumns: string[];
  selectedColumns: string[];
  fileName: string;
  importTime: string;
} | null> {
  const sb = getSupabase();
  if (!sb) return null;

  try {
    const [rowsRes, metaRes] = await Promise.all([
      sb.from('warehouse_rows').select('*').order('created_at', { ascending: false }),
      sb.from('warehouse_meta').select('*'),
    ]);

    if (rowsRes.error) throw rowsRes.error;

    const rows = (rowsRes.data || []).map((r: any) => ({
      _rowId: r.id,
      ...r.row_data,
    }));

    const metaMap: Record<string, any> = {};
    (metaRes.data || []).forEach((m: any) => {
      metaMap[m.key] = m.value;
    });

    return {
      rows,
      allColumns: metaMap.allColumns || [],
      selectedColumns: metaMap.selectedColumns || [],
      fileName: metaMap.fileName || 'Data Master Gudang',
      importTime: metaMap.importTime || '',
    };
  } catch (err) {
    console.error('cloudFetchWarehouse error:', err);
    return null;
  }
}

export async function cloudSaveWarehouse(
  rows: Record<string, any>[],
  allCols: string[],
  selCols: string[],
  name: string
): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const now = new Date().toISOString();

    // 1. Simpan metadata
    const metaPayloads = [
      { key: 'allColumns', value: allCols, updated_at: now },
      { key: 'selectedColumns', value: selCols, updated_at: now },
      { key: 'fileName', value: name, updated_at: now },
      { key: 'importTime', value: now, updated_at: now },
    ];
    const { error: metaErr } = await sb.from('warehouse_meta').upsert(metaPayloads, { onConflict: 'key' });
    if (metaErr) throw metaErr;

    // 2. Bersihkan baris lama dan timpa dengan baris baru (agar sinkron penuh antar device)
    await sb.from('warehouse_rows').delete().neq('id', '___NEVER_MATCH___');

    if (rows.length > 0) {
      const rowsPayload = rows.map((r, idx) => {
        const id = r._rowId || `row_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
        const { _rowId, ...rest } = r;
        return {
          id,
          row_data: rest,
          updated_at: now,
        };
      });

      // Insert in chunks of 100 to avoid payload limits
      const chunkSize = 100;
      for (let i = 0; i < rowsPayload.length; i += chunkSize) {
        const chunk = rowsPayload.slice(i, i + chunkSize);
        const { error: rowsErr } = await sb.from('warehouse_rows').insert(chunk);
        if (rowsErr) throw rowsErr;
      }
    }

    return true;
  } catch (err) {
    console.error('cloudSaveWarehouse error:', err);
    return false;
  }
}

export async function cloudDeleteWarehouseRow(rowId: string): Promise<boolean> {
  const sb = getSupabase();
  if (!sb) return false;

  try {
    const { error } = await sb.from('warehouse_rows').delete().eq('id', rowId);
    if (error) throw error;
    return true;
  } catch (err) {
    console.error('cloudDeleteWarehouseRow error:', err);
    return false;
  }
}
