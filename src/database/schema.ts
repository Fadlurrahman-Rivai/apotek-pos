// ============================================================
// Schema — Apotek Web POS
// TypeScript interfaces & enums for all core entities
// ============================================================

// --------------- Enums ---------------

export enum MedicineCategory {
  TABLET = 'TABLET',
  BOX = 'BOX',
  SIRUP = 'SIRUP',
  SALEP = 'SALEP',
  KAPSUL = 'KAPSUL',
  TETES = 'TETES',
  LAINNYA = 'LAINNYA',
}

export enum MutationType {
  BARANG_DATANG = 'BARANG_DATANG',
  PENJUALAN_KASIR = 'PENJUALAN_KASIR',
  PENGELUARAN_RESEP = 'PENGELUARAN_RESEP',
  KOREKSI_RUSAK = 'KOREKSI_RUSAK',
  UNBOX = 'UNBOX',
}

export enum BatchStatus {
  ACTIVE = 'ACTIVE',
  NEAR_EXP = 'NEAR_EXP',
  EXPIRED = 'EXPIRED',
  RETURNED = 'RETURNED',
}

export enum SaleUnit {
  BOX = 'BOX',
  STRIP = 'STRIP',
  PCS = 'PCS',
  BOTOL = 'BOTOL',
  TUBE = 'TUBE',
  BIJI = 'BIJI',
  TABLET = 'TABLET',
}

export enum UserRole {
  ADMIN = 'ADMIN',
  PEGAWAI = 'PEGAWAI',
}

export interface User {
  id: string;
  username: string;
  name: string;
  role: UserRole;
  password?: string;
  avatar?: string;
}

// --------------- Entities ---------------

export interface Medicine {
  id: string;
  name: string;
  category: MedicineCategory;
  /** Satuan dasar terkecil, e.g. "Tablet", "Botol", "Tube" */
  baseUnit: string;
  /** Satuan menengah, e.g. "Strip" (opsional, null untuk sirup/salep) */
  secondaryUnit: string | null;
  /** Satuan besar, e.g. "Box" (opsional) */
  tertiaryUnit: string | null;
  /** Jumlah pcs per secondary unit (e.g. 10 tablet per strip) */
  piecesPerSecondary: number | null;
  /** Jumlah secondary per tertiary (e.g. 10 strip per box) */
  secondaryPerTertiary: number | null;
  /** Harga beli / modal per tertiary atau per baseUnit jika tidak punya hierarki */
  buyPrice: number;
  /** Harga jual per tertiary (Box) atau per baseUnit */
  sellPrice: number;
  /** Harga jual per secondary unit (Strip), opsional */
  sellPriceSecondary: number | null;
  /** Harga jual per pcs/baseUnit, opsional */
  sellPriceBase: number | null;
  /** Batas stok minimum (safety stock) dalam satuan dasar */
  minStock: number;
  createdAt: string;
  updatedAt: string;
}

export interface StockBatch {
  id: string;
  medicineId: string;
  batchNumber: string;
  expiryDate: string; // ISO date string
  /** Total stok dalam satuan dasar */
  totalBaseQty: number;
  supplierName: string;
  receivedDate: string; // ISO date string
  status: BatchStatus;
}

export interface StockMutation {
  id: string;
  medicineId: string;
  batchId: string | null;
  mutationType: MutationType;
  /** Perubahan dalam satuan dasar (positif = masuk, negatif = keluar) */
  qtyChange: number;
  /** Satuan yang dipilih staf saat input, e.g. "0.5 Strip", "1 Box" */
  unitUsed: string;
  referenceNumber: string;
  notes: string;
  diagnosis?: string;
  action?: string;
  createdAt: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  totalAmount: number;
  amountPaid: number;
  changeAmount: number;
  createdAt: string;
}

export interface SaleItem {
  id: string;
  saleId: string;
  medicineId: string;
  batchId: string | null;
  medicineName: string;
  unit: SaleUnit;
  quantity: number; // bisa desimal
  unitPrice: number;
  subtotal: number;
}
