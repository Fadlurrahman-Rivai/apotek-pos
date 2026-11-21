'use client';

import { useState, useEffect } from 'react';
import {
  getMedicines,
  getTotalStock,
  getBestBatchForSale,
  commitSale,
  getSales,
  initDB,
} from '@/database/db';
import type { StockLine } from '@/database/db';
import {
  Medicine,
  MedicineCategory,
  SaleUnit,
  Sale,
  SaleItem,
  MutationType,
} from '@/database/schema';
import {
  toBaseUnit,
  getPriceForUnit,
  getAvailableUnits,
} from '@/features/inventory/utils/conversion';
import {
  formatRupiah,
  formatDate,
  generateId,
  generateDailyNumber,
  daysUntilExpiry,
  formatNumberDots,
} from '@/lib/formatters';

interface CartItem {
  id: string;
  medicine: Medicine;
  unit: string;
  quantity: number;
  unitPrice: number;
  subtotal: number;
  batchId: string | null;
}

interface PosProductCardProps {
  medicine: Medicine;
  onAddToCart: (medicine: Medicine, unit: string) => void;
}

function PosProductCard({ medicine, onAddToCart }: PosProductCardProps) {
  const currentStock = getTotalStock(medicine.id);
  const bestBatch = getBestBatchForSale(medicine.id);
  const units = getAvailableUnits(medicine);
  const isOutOfStock = currentStock <= 0 || !bestBatch;
  const daysLeft = bestBatch ? daysUntilExpiry(bestBatch.expiryDate) : null;
  const isNearExpiry = daysLeft !== null && daysLeft <= 30;

  const baseUnitDisplay = medicine.baseUnit.toLowerCase() === 'tablet' ? 'Biji' : medicine.baseUnit;
  // Prioritaskan satuan 'Strip' jika tersedia, jika tidak pilih satuan pertama
  const defaultUnit = units.includes('Strip') ? 'Strip' : (units[0] || baseUnitDisplay);
  const [selectedUnit, setSelectedUnit] = useState<string>(defaultUnit);

  const activeUnit = units.includes(selectedUnit) ? selectedUnit : defaultUnit;

  return (
    <div className={`product-card ${isOutOfStock ? 'product-card-disabled' : ''}`}>
      {/* Header: Nama & Kategori */}
      <div className="product-card-header">
        <div className="product-card-name" title={medicine.name}>
          {medicine.name}
        </div>
        <span className="badge badge-neutral product-card-badge">{medicine.category}</span>
      </div>

      {/* Meta: Stok & Exp dalam 1 baris ringkas */}
      <div className="product-card-meta">
        <span className="product-card-stock">
          <span className={`stock-indicator-dot ${isOutOfStock ? 'dot-red' : 'dot-green'}`} />
          {isOutOfStock ? (
            <span style={{ color: 'var(--red-600)', fontWeight: 600 }}>Stok Habis</span>
          ) : (
            <span>Stok: {currentStock} {baseUnitDisplay}</span>
          )}
        </span>
        {bestBatch && (
          <span className={`product-card-exp ${isNearExpiry ? 'text-amber' : ''}`} title={`Exp: ${formatDate(bestBatch.expiryDate)}`}>
            {isNearExpiry ? `⚠️ Exp: ${daysLeft}hr` : `Exp: ${new Date(bestBatch.expiryDate).toLocaleDateString('id-ID', { month: 'short', year: '2-digit' })}`}
          </span>
        )}
      </div>

      {/* Dropdown Satuan & Tombol Tambah ke Kasir */}
      <div className="product-card-actions">
        <div className="product-unit-select-wrapper">
          <select
            className="product-unit-select"
            value={activeUnit}
            disabled={isOutOfStock}
            onChange={(e) => setSelectedUnit(e.target.value)}
            aria-label={`Pilih satuan untuk ${medicine.name}`}
          >
            {units.map((unit) => {
              const price = getPriceForUnit(medicine, unit);
              return (
                <option key={unit} value={unit}>
                  {unit} — {formatRupiah(price)}
                </option>
              );
            })}
          </select>
        </div>
        <button
          type="button"
          className="product-add-btn"
          disabled={isOutOfStock}
          onClick={() => onAddToCart(medicine, activeUnit)}
          title={`Tambah 1 ${activeUnit} ke keranjang`}
        >
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
            <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
            <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
          </svg>
          <span>Kasir</span>
        </button>
      </div>
    </div>
  );
}

export default function PosPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('ALL');
  const [cart, setCart] = useState<CartItem[]>([]);
  const [amountPaid, setAmountPaid] = useState<number>(0);
  const [completedSale, setCompletedSale] = useState<{
    sale: Sale;
    items: CartItem[];
  } | null>(null);
  const [showReceipt, setShowReceipt] = useState(false);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  // Teks sementara kolom jumlah, agar kolom bisa dikosongkan saat mengetik tanpa menghapus baris
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

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

  // Filter medicines
  const filteredMedicines = medicines.filter((m) => {
    const matchesSearch = m.name.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'ALL' || m.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Total qty (satuan dasar) satu obat di keranjang, semua satuan digabung; `skipIndex` dikecualikan
  const cartBaseQtyOf = (medicineId: string, skipIndex = -1) =>
    cart.reduce(
      (sum, item, i) =>
        i !== skipIndex && item.medicine.id === medicineId
          ? sum + toBaseUnit(item.quantity, item.unit, item.medicine)
          : sum,
      0
    );

  // Tambah ke keranjang
  const handleAddToCart = (medicine: Medicine, unit: string) => {
    const stock = getTotalStock(medicine.id);
    const bestBatch = getBestBatchForSale(medicine.id);

    if (stock <= 0 || !bestBatch) {
      showNotification('error', `Stok ${medicine.name} habis atau semua batch telah kedaluwarsa!`);
      return;
    }

    const price = getPriceForUnit(medicine, unit);
    const baseQtyNeeded = toBaseUnit(1, unit, medicine);

    // Stok dihitung dari total semua batch (FEFO bisa mengambil dari beberapa batch),
    // termasuk yang sudah ada di keranjang dalam satuan lain.
    if (cartBaseQtyOf(medicine.id) + baseQtyNeeded > stock + 1e-9) {
      const baseUnitDisplay = medicine.baseUnit.toLowerCase() === 'tablet' ? 'Biji' : medicine.baseUnit;
      showNotification('error', `Jumlah melebihi total stok fisik yang tersedia (${stock} ${baseUnitDisplay}).`);
      return;
    }

    const existingIndex = cart.findIndex(
      (item) => item.medicine.id === medicine.id && item.unit === unit
    );

    if (existingIndex > -1) {
      const newQty = cart[existingIndex].quantity + 1;
      setCart(
        cart.map((item, i) =>
          i === existingIndex ? { ...item, quantity: newQty, subtotal: newQty * item.unitPrice } : item
        )
      );
    } else {
      const newItem: CartItem = {
        id: generateId(),
        medicine,
        unit,
        quantity: 1,
        unitPrice: price,
        subtotal: price,
        batchId: bestBatch.id,
      };
      setCart([...cart, newItem]);
    }

    showNotification('success', `${medicine.name} (${unit}) ditambahkan ke keranjang.`);
  };

  // Update kuantitas item keranjang
  // Mengembalikan true bila jumlah diterima (atau baris dihapus)
  const handleUpdateQuantity = (index: number, newQty: number): boolean => {
    if (!Number.isFinite(newQty)) return false;
    if (newQty <= 0) {
      handleRemoveItem(index);
      return true;
    }

    const item = cart[index];
    const totalStock = getTotalStock(item.medicine.id);
    const baseQtyNeeded = toBaseUnit(newQty, item.unit, item.medicine);
    const baseUnitDisplay = item.medicine.baseUnit.toLowerCase() === 'tablet' ? 'Biji' : item.medicine.baseUnit;

    // Gabungkan dengan baris lain obat yang sama (satuan berbeda)
    if (cartBaseQtyOf(item.medicine.id, index) + baseQtyNeeded > totalStock + 1e-9) {
      showNotification('error', `Stok tidak mencukupi. Total stok ${totalStock} ${baseUnitDisplay}.`);
      return false;
    }

    setCart(cart.map((c, i) => (i === index ? { ...c, quantity: newQty, subtotal: newQty * c.unitPrice } : c)));
    return true;
  };

  const handleQtyInputChange = (index: number, itemId: string, raw: string) => {
    setQtyDrafts((prev) => ({ ...prev, [itemId]: raw }));
    const parsed = parseFloat(raw);
    // Kolom kosong / belum valid: tunggu pengguna selesai mengetik, jangan hapus baris
    if (!(parsed > 0)) return;
    if (!handleUpdateQuantity(index, parsed)) {
      setQtyDrafts((prev) => {
        const { [itemId]: _drop, ...rest } = prev;
        return rest;
      });
    }
  };

  const clearQtyDraft = (itemId: string) =>
    setQtyDrafts((prev) => {
      const { [itemId]: _drop, ...rest } = prev;
      return rest;
    });

  // Hapus item dari keranjang
  const handleRemoveItem = (index: number) => {
    const updated = cart.filter((_, i) => i !== index);
    setCart(updated);
  };

  // Perhitungan total belanja & kembalian
  const totalAmount = cart.reduce((sum, item) => sum + item.subtotal, 0);
  const changeAmount = amountPaid >= totalAmount ? amountPaid - totalAmount : 0;

  // Format input nominal pembayaran kasir dengan tanda titik (ribu/juta)
  const handleAmountPaidChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const input = e.target;
    const rawValue = input.value;
    const cursorPosition = input.selectionStart || 0;

    // Hitung berapa banyak digit angka sebelum kursor untuk menjaga posisi kursor
    const digitsBeforeCursor = rawValue.slice(0, cursorPosition).replace(/\D/g, '').length;

    const cleanDigits = rawValue.replace(/\D/g, '');
    const numValue = cleanDigits ? parseInt(cleanDigits, 10) : 0;
    setAmountPaid(numValue);

    const formatted = numValue > 0 ? numValue.toLocaleString('id-ID') : '';

    requestAnimationFrame(() => {
      let newPos = 0;
      let digitCount = 0;
      for (let i = 0; i < formatted.length; i++) {
        if (/\d/.test(formatted[i])) {
          digitCount++;
        }
        if (digitCount === digitsBeforeCursor) {
          newPos = i + 1;
          break;
        }
      }
      if (digitCount < digitsBeforeCursor) {
        newPos = formatted.length;
      }
      input.setSelectionRange(newPos, newPos);
    });
  };

  const handleAmountPaidKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    // Jika tombol Backspace ditekan tepat di belakang titik (misal "10.|000"), hapus digit sebelum titik
    if (e.key === 'Backspace') {
      const input = e.currentTarget;
      const pos = input.selectionStart ?? 0;
      if (pos > 0 && input.selectionStart === input.selectionEnd && input.value[pos - 1] === '.') {
        e.preventDefault();
        const val = input.value;
        const newVal = val.slice(0, pos - 2) + val.slice(pos - 1);
        const cleanDigits = newVal.replace(/\D/g, '');
        const numValue = cleanDigits ? parseInt(cleanDigits, 10) : 0;
        setAmountPaid(numValue);
      }
    }
  };

  // Checkout Transaksi Kasir
  const handleCheckout = () => {
    if (cart.length === 0) {
      showNotification('error', 'Keranjang belanja masih kosong.');
      return;
    }

    if (amountPaid < totalAmount) {
      showNotification('error', 'Nominal uang yang dibayar masih kurang!');
      return;
    }

    const invoiceNumber = generateDailyNumber('INV', getSales().map((s) => s.invoiceNumber));
    const saleId = generateId();
    const createdAt = new Date().toISOString();

    const newSale: Sale = {
      id: saleId,
      invoiceNumber,
      totalAmount,
      amountPaid,
      changeAmount,
      createdAt,
    };

    const saleItemsToSave: SaleItem[] = cart.map((item) => ({
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

    // Stok dipotong FEFO dan disimpan atomik: bila satu baris kurang, tidak ada yang berubah
    const stockLines: StockLine[] = cart.map((item, i) => ({
      itemId: saleItemsToSave[i].id,
      medicineId: item.medicine.id,
      baseQty: toBaseUnit(item.quantity, item.unit, item.medicine),
      mutation: {
        medicineId: item.medicine.id,
        mutationType: MutationType.PENJUALAN_KASIR,
        unitUsed: `${item.quantity} ${item.unit}`,
        referenceNumber: invoiceNumber,
        notes: `Penjualan Kasir - Faktur ${invoiceNumber}`,
        createdAt,
      },
    }));

    const result = commitSale(newSale, saleItemsToSave, stockLines);
    if (!result.ok) {
      const name = cart.find((c) => c.medicine.id === result.medicineId)?.medicine.name ?? 'Obat';
      showNotification('error', `Stok ${name} tidak mencukupi saat pembayaran. Transaksi dibatalkan, keranjang dipertahankan.`);
      refreshData();
      return;
    }

    // Set struk
    setCompletedSale({
      sale: newSale,
      items: [...cart],
    });
    setShowReceipt(true);

    // Reset Form
    setCart([]);
    setAmountPaid(0);
    refreshData();
    showNotification('success', `Transaksi ${invoiceNumber} berhasil diselesaikan.`);
  };

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
          <h1>Kasir Penjualan (POS)</h1>
          <p>Pencarian obat cepat, pilihan satuan bertingkat (Box/Strip/Pcs), validasi stok &amp; cetak struk.</p>
        </div>
      </div>

      <div className="pos-layout">
        {/* Left Side: Katalog & Pencarian */}
        <div>
          {/* Search Bar & Categories */}
          <div className="card" style={{ marginBottom: 'var(--sp-4)' }}>
            <div className="search-wrapper" style={{ marginBottom: 'var(--sp-3)' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Ketik nama obat (misal: Paracetamol, Sanmol, Bioplacenton)..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                autoFocus
              />
            </div>

            <div className="filter-tabs" style={{ marginBottom: 0 }}>
              {['ALL', ...Object.values(MedicineCategory)].map((cat) => (
                <button
                  key={cat}
                  className={`filter-tab ${selectedCategory === cat ? 'active' : ''}`}
                  onClick={() => setSelectedCategory(cat)}
                >
                  {cat === 'ALL' ? 'Semua Bentuk' : cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Grid */}
          <div className="product-grid">
            {filteredMedicines.map((medicine) => (
              <PosProductCard
                key={medicine.id}
                medicine={medicine}
                onAddToCart={handleAddToCart}
              />
            ))}
          </div>

          {filteredMedicines.length === 0 && (
            <div className="empty-state">
              <p>Tidak ada obat yang cocok dengan kriteria pencarian.</p>
            </div>
          )}
        </div>

        {/* Right Side: Keranjang Kasir & Pembayaran */}
        <div id="pos-cart-section" className="pos-cart">
          <div className="pos-cart-header">
            <span>Keranjang Belanja</span>
            <span className="badge badge-info">{cart.length} Item</span>
          </div>

          {/* Cart Items List */}
          <div className="pos-cart-items">
            {cart.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-8) var(--sp-4)' }}>
                <svg width="32" height="32" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <circle cx="7" cy="17" r="1.5" />
                  <circle cx="15" cy="17" r="1.5" />
                  <path d="M2 3h3l2.5 9h9l2-7H6" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <p>Klik tombol satuan pada obat untuk menambahkan ke kasir.</p>
              </div>
            ) : (
              cart.map((item, idx) => (
                <div key={`${item.id}-${idx}`} className="pos-cart-item">
                  <div style={{ flex: 1 }}>
                    <div className="pos-cart-item-name">{item.medicine.name}</div>
                    <div className="pos-cart-item-detail">
                      Satuan: <strong>{item.unit}</strong> @ {formatRupiah(item.unitPrice)}
                    </div>

                    {/* Quantity Controls */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px' }}>
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ width: '26px', height: '26px', padding: 0, justifyContent: 'center' }}
                        onClick={() => handleUpdateQuantity(idx, item.quantity - 1)}
                      >
                        -
                      </button>
                      <input
                        type="number"
                        min="0.1"
                        step="any"
                        value={qtyDrafts[item.id] ?? item.quantity}
                        onChange={(e) => handleQtyInputChange(idx, item.id, e.target.value)}
                        onBlur={() => clearQtyDraft(item.id)}
                        style={{
                          width: '50px',
                          textAlign: 'center',
                          height: '26px',
                          border: '1px solid var(--slate-300)',
                          borderRadius: '4px',
                          fontSize: '0.857rem',
                        }}
                      />
                      <button
                        className="btn btn-secondary btn-sm"
                        style={{ width: '26px', height: '26px', padding: 0, justifyContent: 'center' }}
                        onClick={() => handleUpdateQuantity(idx, item.quantity + 1)}
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div style={{ textAlign: 'right' }}>
                    <div className="pos-cart-item-price">{formatRupiah(item.subtotal)}</div>
                    <button
                      className="pos-cart-item-remove"
                      onClick={() => handleRemoveItem(idx)}
                      style={{ marginTop: '8px' }}
                    >
                      Hapus
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          {/* Cart Summary */}
          <div className="pos-cart-summary">
            <div className="pos-cart-total">
              <span>Total Belanja:</span>
              <span style={{ color: 'var(--teal-700)' }}>{formatRupiah(totalAmount)}</span>
            </div>
          </div>

          {/* Payment Input */}
          <div className="pos-payment">
            <div className="form-group">
              <label className="form-label">Nominal Uang Diterima:</label>
              <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
                <span
                  style={{
                    position: 'absolute',
                    left: '12px',
                    color: 'var(--slate-500)',
                    fontWeight: 600,
                    fontSize: '0.929rem',
                    pointerEvents: 'none',
                  }}
                >
                  Rp
                </span>
                <input
                  type="text"
                  inputMode="numeric"
                  className="form-input"
                  style={{ paddingLeft: '38px', fontWeight: 600 }}
                  placeholder="0"
                  value={formatNumberDots(amountPaid)}
                  onChange={handleAmountPaidChange}
                  onKeyDown={handleAmountPaidKeyDown}
                />
              </div>
            </div>

            {/* Quick cash buttons */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '6px' }}>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAmountPaid(totalAmount)}
                disabled={totalAmount === 0}
              >
                Uang Pas
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAmountPaid(Math.ceil(totalAmount / 50000) * 50000 || 50000)}
                disabled={totalAmount === 0}
              >
                50 Rb
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setAmountPaid(Math.ceil(totalAmount / 100000) * 100000 || 100000)}
                disabled={totalAmount === 0}
              >
                100 Rb
              </button>
            </div>

            <div className="pos-change">
              <span>Kembalian:</span>
              <span>{formatRupiah(changeAmount)}</span>
            </div>

            <button
              className="btn btn-primary btn-lg"
              style={{ width: '100%', justifyContent: 'center', marginTop: '6px' }}
              disabled={cart.length === 0 || amountPaid < totalAmount}
              onClick={handleCheckout}
            >
              Bayar &amp; Selesaikan (Faktur)
            </button>
          </div>
        </div>
      </div>

      {/* Floating Mobile Quick-Cart Bar */}
      {cart.length > 0 && (
        <div
          className="pos-mobile-cart-bar"
          onClick={() => {
            document.getElementById('pos-cart-section')?.scrollIntoView({ behavior: 'smooth' });
          }}
          role="button"
          tabIndex={0}
          aria-label="Lihat keranjang belanja dan bayar"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
              className="badge"
              style={{
                background: 'rgba(255, 255, 255, 0.25)',
                color: '#ffffff',
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: '6px',
              }}
            >
              {cart.length} Item
            </span>
            <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{formatRupiah(totalAmount)}</span>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', fontWeight: 600 }}>
            <span>Lihat Keranjang &amp; Bayar</span>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </div>
        </div>
      )}

      {/* Modal Cetak Struk */}
      {showReceipt && completedSale && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '380px' }}>
            <div className="modal-header">
              <h2>Struk Penjualan</h2>
              <button className="modal-close" onClick={() => setShowReceipt(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body" style={{ padding: 0 }}>
              <div className="receipt">
                <div className="receipt-header">
                  <div style={{ fontWeight: 'bold', fontSize: '1rem' }}>APOTEK SEHAT SENTOSA</div>
                  <div>Jl. Raya Kesehatan No. 12, Jakarta</div>
                  <div>Telp: (021) 555-1234</div>
                  <div style={{ margin: '8px 0', borderTop: '1px dashed #666', borderBottom: '1px dashed #666', padding: '4px 0' }}>
                    <div>No: {completedSale.sale.invoiceNumber}</div>
                    <div>Tgl: {formatDate(completedSale.sale.createdAt)} {new Date(completedSale.sale.createdAt).toLocaleTimeString('id-ID')}</div>
                  </div>
                </div>

                <div style={{ marginBottom: '12px' }}>
                  {completedSale.items.map((item, i) => (
                    <div key={i} style={{ marginBottom: '6px' }}>
                      <div style={{ fontWeight: 'bold' }}>{item.medicine.name}</div>
                      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>{item.quantity} {item.unit} x {formatRupiah(item.unitPrice)}</span>
                        <span>{formatRupiah(item.subtotal)}</span>
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ borderTop: '1px dashed #666', paddingTop: '8px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>TOTAL:</span>
                    <span>{formatRupiah(completedSale.sale.totalAmount)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>TUNAI:</span>
                    <span>{formatRupiah(completedSale.sale.amountPaid)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontWeight: 'bold' }}>
                    <span>KEMBALIAN:</span>
                    <span>{formatRupiah(completedSale.sale.changeAmount)}</span>
                  </div>
                </div>

                <div className="receipt-footer">
                  <div>Terima kasih atas kunjungan Anda</div>
                  <div>Semoga lekas sembuh!</div>
                  <div style={{ fontSize: '0.7rem', marginTop: '6px', color: '#666' }}>Barang yang sudah dibeli tidak dapat ditukar</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button
                className="btn btn-secondary"
                onClick={() => window.print()}
              >
                Cetak Struk
              </button>
              <button
                className="btn btn-primary"
                onClick={() => setShowReceipt(false)}
              >
                Transaksi Baru
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
