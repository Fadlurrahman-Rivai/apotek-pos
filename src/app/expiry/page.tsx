'use client';

import { useState, useEffect } from 'react';
import {
  getMedicines,
  getBatches,
  updateBatch,
  addMutation,
  initDB,
} from '@/database/db';
import {
  Medicine,
  StockBatch,
  BatchStatus,
  MutationType,
} from '@/database/schema';
import {
  formatDate,
  daysUntilExpiry,
  getExpiryStatus,
  generateId,
} from '@/lib/formatters';

export default function ExpiryPage() {
  const [medicines, setMedicines] = useState<Medicine[]>([]);
  const [batches, setBatches] = useState<StockBatch[]>([]);
  const [filter, setFilter] = useState<'ALL' | 'EXPIRED' | 'CRITICAL' | 'WARNING' | 'SAFE'>('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  useEffect(() => {
    initDB();
    refreshData();
  }, []);

  const refreshData = () => {
    setMedicines(getMedicines());
    setBatches(getBatches());
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  // Karantina / Retur Batch
  const handleQuarantine = (batch: StockBatch) => {
    const med = medicines.find((m) => m.id === batch.medicineId);
    if (!confirm(`Karantina batch ${batch.batchNumber} (${med?.name}) untuk proses retur supplier?`)) {
      return;
    }

    updateBatch(batch.id, { status: BatchStatus.RETURNED });

    // Catat mutasi
    addMutation({
      id: generateId(),
      medicineId: batch.medicineId,
      batchId: batch.id,
      mutationType: MutationType.KOREKSI_RUSAK,
      qtyChange: -batch.totalBaseQty,
      unitUsed: `${batch.totalBaseQty} ${med?.baseUnit || 'Unit'}`,
      referenceNumber: `RETUR-${batch.batchNumber}`,
      notes: `Karantina / Retur obat kedaluwarsa ke ${batch.supplierName}`,
      createdAt: new Date().toISOString(),
    });

    showNotification('success', `Batch ${batch.batchNumber} berhasil dikarantina/diretur.`);
    refreshData();
  };

  // Kalkulasi metrik
  // Batch tanpa stok (sudah habis terjual) tidak dihitung sebagai peringatan
  const stockedBatches = batches.filter((b) => b.totalBaseQty > 0);

  const expiredCount = stockedBatches.filter(
    (b) => b.status === BatchStatus.EXPIRED || (b.status === BatchStatus.ACTIVE && daysUntilExpiry(b.expiryDate) <= 0)
  ).length;

  const criticalCount = stockedBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate);
    return b.status === BatchStatus.ACTIVE && d > 0 && d <= 30;
  }).length;

  const warningCount = stockedBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate);
    return b.status === BatchStatus.ACTIVE && d > 30 && d <= 90;
  }).length;

  const safeCount = stockedBatches.filter((b) => {
    const d = daysUntilExpiry(b.expiryDate);
    return b.status === BatchStatus.ACTIVE && d > 90;
  }).length;

  // Filter daftar batch
  const filteredBatches = batches.filter((b) => {
    const days = daysUntilExpiry(b.expiryDate);
    const status = getExpiryStatus(b.expiryDate);

    if (filter !== 'ALL' && b.totalBaseQty <= 0) return false;
    if (filter === 'EXPIRED') return b.status !== BatchStatus.RETURNED && (b.status === BatchStatus.EXPIRED || days <= 0);
    if (filter === 'CRITICAL') return b.status === BatchStatus.ACTIVE && status === 'CRITICAL';
    if (filter === 'WARNING') return b.status === BatchStatus.ACTIVE && status === 'WARNING';
    if (filter === 'SAFE') return b.status === BatchStatus.ACTIVE && status === 'SAFE';
    return true;
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
          <h1>Pengingat Kedaluwarsa (EXP Reminder)</h1>
          <p>
            Pantau tanggal kedaluwarsa obat berdasarkan batch dengan sistem klasifikasi warna FEFO (First Expired, First
            Out).
          </p>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="summary-grid">
        <div className="summary-card" style={{ borderLeft: '4px solid var(--red-600)' }}>
          <div className="summary-card-icon red">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="8" />
              <line x1="10" y1="6" x2="10" y2="10" />
              <line x1="10" y1="14" x2="10.01" y2="14" strokeWidth="3" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value" style={{ color: 'var(--red-600)' }}>
              {expiredCount}
            </div>
            <div className="summary-card-label">Sudah Kedaluwarsa (Blokir Jual)</div>
          </div>
        </div>

        <div className="summary-card" style={{ borderLeft: '4px solid #f97316' }}>
          <div className="summary-card-icon amber" style={{ background: '#fff7ed', color: '#c2410c' }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 2L1 18h18L10 2z" />
              <line x1="10" y1="8" x2="10" y2="12" />
              <line x1="10" y1="15" x2="10.01" y2="15" strokeWidth="2.5" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value" style={{ color: '#c2410c' }}>
              {criticalCount}
            </div>
            <div className="summary-card-label">Kritis (&le; 30 Hari Lagi)</div>
          </div>
        </div>

        <div className="summary-card" style={{ borderLeft: '4px solid var(--amber-500)' }}>
          <div className="summary-card-icon amber">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="10" cy="10" r="7.5" />
              <line x1="10" y1="6" x2="10" y2="10" />
              <line x1="10" y1="10" x2="13" y2="12" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value" style={{ color: 'var(--amber-600)' }}>
              {warningCount}
            </div>
            <div className="summary-card-label">Peringatan (31 - 90 Hari)</div>
          </div>
        </div>

        <div className="summary-card" style={{ borderLeft: '4px solid var(--green-600)' }}>
          <div className="summary-card-icon" style={{ background: 'var(--green-100)', color: 'var(--green-600)' }}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 10l4 4 8-8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value" style={{ color: 'var(--green-600)' }}>
              {safeCount}
            </div>
            <div className="summary-card-label">Aman (&gt; 90 Hari)</div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="filter-tabs">
        <button className={`filter-tab ${filter === 'ALL' ? 'active' : ''}`} onClick={() => setFilter('ALL')}>
          Semua Batch ({batches.length})
        </button>
        <button className={`filter-tab ${filter === 'EXPIRED' ? 'active' : ''}`} onClick={() => setFilter('EXPIRED')}>
          Sudah Expired ({expiredCount})
        </button>
        <button className={`filter-tab ${filter === 'CRITICAL' ? 'active' : ''}`} onClick={() => setFilter('CRITICAL')}>
          Kritis &le; 30 Hari ({criticalCount})
        </button>
        <button className={`filter-tab ${filter === 'WARNING' ? 'active' : ''}`} onClick={() => setFilter('WARNING')}>
          Peringatan 31-90 Hari ({warningCount})
        </button>
        <button className={`filter-tab ${filter === 'SAFE' ? 'active' : ''}`} onClick={() => setFilter('SAFE')}>
          Aman ({safeCount})
        </button>
      </div>

      {/* Table Batch */}
      <div className="card" style={{ padding: 0, overflowX: 'auto' }}>
        <table className="data-table">
          <thead>
            <tr>
              <th>Nomor Batch</th>
              <th>Nama Obat</th>
              <th>Tanggal Kedaluwarsa</th>
              <th>Sisa Hari</th>
              <th className="text-right">Sisa Stok Fisik</th>
              <th>Supplier / PBF</th>
              <th>Status Kelayakan</th>
              <th className="text-center">Tindakan</th>
            </tr>
          </thead>
          <tbody>
            {filteredBatches.map((b) => {
              const med = medicines.find((m) => m.id === b.medicineId);
              const days = daysUntilExpiry(b.expiryDate);
              const isExpired = b.status === BatchStatus.EXPIRED || days <= 0;
              const isReturned = b.status === BatchStatus.RETURNED;

              let badge = <span className="badge badge-safe">Aman</span>;
              if (isReturned) {
                badge = <span className="badge badge-neutral">Telah Diretur</span>;
              } else if (isExpired) {
                badge = <span className="badge badge-expired">Expired</span>;
              } else if (days <= 30) {
                badge = <span className="badge badge-critical">Kritis (&le; 30 Hari)</span>;
              } else if (days <= 90) {
                badge = <span className="badge badge-warning">Peringatan (30-90 Hari)</span>;
              }

              return (
                <tr key={b.id}>
                  <td>
                    <code>{b.batchNumber}</code>
                  </td>
                  <td>
                    <strong>{med?.name || 'Obat'}</strong>
                    <span className="text-xs text-muted" style={{ display: 'block' }}>
                      {med?.category}
                    </span>
                  </td>
                  <td>{formatDate(b.expiryDate)}</td>
                  <td style={{ fontWeight: 600 }}>
                    {isExpired ? (
                      <span style={{ color: 'var(--red-600)' }}>Lewat {-days} hari</span>
                    ) : (
                      <span>{days} hari lagi</span>
                    )}
                  </td>
                  <td className="text-right" style={{ fontWeight: 700 }}>
                    {b.totalBaseQty} <span className="text-xs text-muted">{med?.baseUnit}</span>
                  </td>
                  <td className="text-sm">{b.supplierName}</td>
                  <td>{badge}</td>
                  <td className="text-center">
                    {isExpired && !isReturned && (
                      <button
                        className="btn btn-danger btn-sm"
                        onClick={() => handleQuarantine(b)}
                        title="Karantina dan keluarkan dari inventaris penjualan"
                      >
                        Karantina / Retur
                      </button>
                    )}
                    {isReturned && <span className="text-xs text-muted">Selesai</span>}
                    {!isExpired && !isReturned && (
                      <span className="text-xs text-muted">Siap Jual (FEFO)</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filteredBatches.length === 0 && (
          <div className="empty-state">
            <p>Tidak ada batch obat pada kategori filter ini.</p>
          </div>
        )}
      </div>
    </div>
  );
}
