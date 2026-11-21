'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  getMedicines,
  getBatches,
  getTodaySales,
  getTotalStock,
  initDB,
} from '@/database/db';
import { Medicine, StockBatch, Sale, BatchStatus } from '@/database/schema';
import { formatRupiah, formatDate, daysUntilExpiry } from '@/lib/formatters';

export default function DashboardPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [todaySales, setTodaySales] = useState<Sale[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    initDB();
    const loadState = () => {
      setMedicines(getMedicines());
      setBatches(getBatches());
      setTodaySales(getTodaySales());
    };
    loadState();
    setMounted(true);

    window.addEventListener('apotek-cloud-synced', loadState);
    return () => window.removeEventListener('apotek-cloud-synced', loadState);
  }, []);

  if (!mounted) {
    return (
      <div className="card">
        <p className="text-muted">Memuat data dashboard apotek...</p>
      </div>
    );
  }

  // Ringkasan Finansial Hari Ini
  const totalRevenueToday = todaySales.reduce((acc, sale) => acc + sale.totalAmount, 0);

  // Status Kedaluwarsa Batch
  // Hanya batch yang masih punya stok dan belum diretur yang perlu diwaspadai
  const activeBatches = batches.filter(
    (b) => b.totalBaseQty > 0 && b.status !== BatchStatus.RETURNED
  );
  const expiredBatches = activeBatches.filter(
    (b) => b.status === BatchStatus.EXPIRED || daysUntilExpiry(b.expiryDate) <= 0
  );
  const criticalBatches = activeBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate);
    return b.status !== BatchStatus.EXPIRED && d > 0 && d <= 30;
  });
  const warningBatches = activeBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate);
    return b.status !== BatchStatus.EXPIRED && d > 30 && d <= 90;
  });

  // Obat dengan Stok Menipis
  const lowStockMedicines = medicines.filter((m) => {
    const currentStock = getTotalStock(m.id);
    return currentStock <= m.minStock;
  });

  return (
    <div>
      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Dashboard Apotek</h1>
          <p>Ringkasan performa penjualan, ketersediaan stok pergudangan, dan kontrol masa berlaku obat.</p>
        </div>
        <div className="page-header-actions">
          <Link href="/pos" className="btn btn-primary">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="16" height="14" rx="2" />
              <line x1="2" y1="8" x2="18" y2="8" />
              <line x1="8" y1="8" x2="8" y2="17" />
            </svg>
            <span>Buka Kasir POS</span>
          </Link>
          <Link href="/prescription" className="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="4" y="2" width="12" height="16" rx="2" />
              <line x1="7" y1="6" x2="13" y2="6" />
              <line x1="7" y1="9" x2="13" y2="9" />
              <line x1="7" y1="12" x2="10" y2="12" />
            </svg>
            <span>Pengeluaran Resep</span>
          </Link>
          <Link href="/warehouse" className="btn btn-secondary">
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 10L10 4l7 6" />
              <rect x="4" y="10" width="12" height="7" rx="1" />
              <line x1="8" y1="13" x2="12" y2="13" />
            </svg>
            <span>Barang Masuk</span>
          </Link>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-card-icon teal">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <line x1="10" y1="2" x2="10" y2="18" />
              <path d="M14 6H7.5a3 3 0 000 6H12a3 3 0 010 6H6" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{formatRupiah(totalRevenueToday)}</div>
            <div className="summary-card-label">Penjualan Hari Ini ({todaySales.length} transaksi)</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon blue">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" />
              <path d="M3 6l7 4" />
              <path d="M17 6l-7 4" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{medicines.length}</div>
            <div className="summary-card-label">Total Katalog Obat</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon amber">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="7.5" />
              <line x1="10" y1="6" x2="10" y2="10" />
              <line x1="10" y1="14" x2="10.01" y2="14" strokeWidth="2.5" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{criticalBatches.length + warningBatches.length}</div>
            <div className="summary-card-label">Mendekati Kedaluwarsa (&lt; 90 hari)</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon red">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="10" cy="10" r="8" />
              <line x1="13" y1="7" x2="7" y2="13" />
              <line x1="7" y1="7" x2="13" y2="13" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{expiredBatches.length}</div>
            <div className="summary-card-label">Obat Kedaluwarsa (Karantina)</div>
          </div>
        </div>
      </div>

      {/* Grid: Peringatan Kritis & Transaksi Terkini */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))', gap: 'var(--sp-6)' }}>
        
        {/* Kolom 1: Perhatian Kedaluwarsa & Stok Menipis */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--sp-6)' }}>
          
          {/* Card EXP Warning */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <h3>Peringatan Kedaluwarsa (FEFO)</h3>
              <Link href="/expiry" className="text-sm" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>
                Lihat Semua &rarr;
              </Link>
            </div>

            {expiredBatches.length === 0 && criticalBatches.length === 0 && warningBatches.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
                <p>Tidak ada obat yang kedaluwarsa atau mendekati jatuh tempo.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Batch</th>
                    <th>Obat</th>
                    <th>Jatuh Tempo</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {expiredBatches.slice(0, 3).map((b) => {
                    const med = medicines.find((m) => m.id === b.medicineId);
                    return (
                      <tr key={b.id}>
                        <td><code>{b.batchNumber}</code></td>
                        <td><strong>{med?.name || 'Obat'}</strong></td>
                        <td>{formatDate(b.expiryDate)}</td>
                        <td><span className="badge badge-expired">Expired</span></td>
                      </tr>
                    );
                  })}
                  {criticalBatches.slice(0, 3).map((b) => {
                    const med = medicines.find((m) => m.id === b.medicineId);
                    const days = daysUntilExpiry(b.expiryDate);
                    return (
                      <tr key={b.id}>
                        <td><code>{b.batchNumber}</code></td>
                        <td><strong>{med?.name || 'Obat'}</strong></td>
                        <td>{formatDate(b.expiryDate)}</td>
                        <td><span className="badge badge-critical">{days} hari lagi</span></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>

          {/* Card Stok Menipis */}
          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
              <h3>Stok Menipis / Perlu Restok</h3>
              <Link href="/inventory" className="text-sm" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>
                Katalog &rarr;
              </Link>
            </div>

            {lowStockMedicines.length === 0 ? (
              <div className="empty-state" style={{ padding: 'var(--sp-6)' }}>
                <p>Seluruh stok obat berada di atas batas safety stock minimum.</p>
              </div>
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Nama Obat</th>
                    <th>Kategori</th>
                    <th className="text-right">Sisa Stok</th>
                    <th className="text-right">Batas Min</th>
                  </tr>
                </thead>
                <tbody>
                  {lowStockMedicines.slice(0, 4).map((m) => {
                    const stock = getTotalStock(m.id);
                    return (
                      <tr key={m.id}>
                        <td><strong>{m.name}</strong></td>
                        <td><span className="badge badge-neutral">{m.category}</span></td>
                        <td className="text-right" style={{ color: stock === 0 ? 'var(--red-600)' : 'var(--amber-600)', fontWeight: 600 }}>
                          {stock} {m.baseUnit}
                        </td>
                        <td className="text-right text-muted">{m.minStock} {m.baseUnit}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Kolom 2: Riwayat Penjualan Kasir Hari Ini */}
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 'var(--sp-4)' }}>
            <h3>Transaksi Kasir Hari Ini</h3>
            <Link href="/pos" className="text-sm" style={{ color: 'var(--teal-700)', fontWeight: 600 }}>
              Buka POS &rarr;
            </Link>
          </div>

          {todaySales.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
              <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="16" height="14" rx="2" />
                <line x1="2" y1="8" x2="18" y2="8" />
              </svg>
              <p>Belum ada transaksi penjualan pada hari ini.</p>
            </div>
          ) : (
            <table className="data-table">
              <thead>
                <tr>
                  <th>No Invoice</th>
                  <th>Waktu</th>
                  <th className="text-right">Total Tagihan</th>
                  <th className="text-right">Dibayar</th>
                </tr>
              </thead>
              <tbody>
                {todaySales.map((sale) => (
                  <tr key={sale.id}>
                    <td>
                      <code>{sale.invoiceNumber}</code>
                    </td>
                    <td className="text-muted">
                      {new Date(sale.createdAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                    </td>
                    <td className="text-right" style={{ fontWeight: 600, color: 'var(--teal-800)' }}>
                      {formatRupiah(sale.totalAmount)}
                    </td>
                    <td className="text-right text-muted">
                      {formatRupiah(sale.amountPaid)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
