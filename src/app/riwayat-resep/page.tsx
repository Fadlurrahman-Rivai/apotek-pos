'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import {
  initDB,
  getPrescriptionRecords,
  importPrescriptionRecords,
  deletePrescriptionRecord,
} from '@/database/db';
import { PrescriptionRecord, PrescriptionRecordItem } from '@/database/schema';
import { formatDate, formatDateInput, formatRupiah, generateId, today } from '@/lib/formatters';

export default function RiwayatResepPage() {
  const [records, setRecords] = useState<PrescriptionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [doctorFilter, setDoctorFilter] = useState<string>('ALL');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Detail & Print Modal
  const [selectedRecord, setSelectedRecord] = useState<PrescriptionRecord | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [modalTab, setModalTab] = useState<'KWITANSI' | 'ETIKET'>('KWITANSI');

  // Delete Modal
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [recordToDelete, setRecordToDelete] = useState<PrescriptionRecord | null>(null);

  // Import Modal
  const [showImportModal, setShowImportModal] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [importFileName, setImportFileName] = useState('');
  const [detectedHeaders, setDetectedHeaders] = useState<string[]>([]);
  const [parsedRawRows, setParsedRawRows] = useState<Record<string, any>[]>([]);
  const [syncToMutations, setSyncToMutations] = useState(true);

  // Column Mapping state
  const [mapping, setMapping] = useState({
    prescriptionNo: '',
    date: '',
    patientName: '',
    patientAge: '',
    doctorName: '',
    diagnosis: '',
    action: '',
    medicineName: '',
    quantity: '',
    unit: '',
    signa: '',
    examinationFee: '',
  });

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    initDB();
    refreshData();
  }, []);

  const refreshData = () => {
    setLoading(true);
    try {
      const data = getPrescriptionRecords();
      setRecords(data);
    } catch (err) {
      console.error('Error fetching prescription records:', err);
    } finally {
      setLoading(false);
    }
  };

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3500);
  };

  // List of unique doctors for filtering
  const doctorList = useMemo(() => {
    const set = new Set<string>();
    records.forEach((r) => {
      if (r.doctorName && r.doctorName.trim() && r.doctorName !== '-') {
        set.add(r.doctorName.trim());
      }
    });
    return Array.from(set);
  }, [records]);

  // Filtered Records
  const filteredRecords = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    const now = new Date();

    return records.filter((rec) => {
      // 1. Text Search
      if (q) {
        const matchNo = rec.prescriptionNo?.toLowerCase().includes(q);
        const matchPatient = rec.patientName?.toLowerCase().includes(q);
        const matchDoctor = rec.doctorName?.toLowerCase().includes(q);
        const matchDiag = rec.diagnosis?.toLowerCase().includes(q);
        const matchAct = rec.action?.toLowerCase().includes(q);
        const matchItem = rec.items?.some((it) =>
          it.medicineName?.toLowerCase().includes(q) || it.signa?.toLowerCase().includes(q)
        );
        if (!matchNo && !matchPatient && !matchDoctor && !matchDiag && !matchAct && !matchItem) {
          return false;
        }
      }

      // 2. Doctor Filter
      if (doctorFilter !== 'ALL' && rec.doctorName !== doctorFilter) {
        return false;
      }

      // 3. Date Filter
      if (dateFilter !== 'ALL' && rec.date) {
        const itemDate = new Date(rec.date);
        if (dateFilter === 'TODAY') {
          // Bandingkan tanggal lokal (bukan UTC) agar tidak bergeser di zona waktu Indonesia
          if (formatDateInput(rec.date) !== today()) return false;
        } else if (dateFilter === 'WEEK') {
          const sevenDaysAgo = new Date();
          sevenDaysAgo.setDate(now.getDate() - 7);
          if (itemDate < sevenDaysAgo) return false;
        } else if (dateFilter === 'MONTH') {
          const thirtyDaysAgo = new Date();
          thirtyDaysAgo.setDate(now.getDate() - 30);
          if (itemDate < thirtyDaysAgo) return false;
        }
      }

      return true;
    });
  }, [records, searchQuery, dateFilter, doctorFilter]);

  // Statistics
  const stats = useMemo(() => {
    const totalPrescriptions = records.length;
    const uniquePatients = new Set(records.map((r) => r.patientName?.toLowerCase().trim())).size;
    let totalItems = 0;
    let totalFees = 0;

    records.forEach((r) => {
      totalFees += Number(r.examinationFee || r.totalCost || 0);
      r.items?.forEach((it) => {
        totalItems += Number(it.quantity || 1);
      });
    });

    return { totalPrescriptions, uniquePatients, totalItems, totalFees };
  }, [records]);

  // ----------------------------------------------------
  // TEMPLATE & EXPORT EXCEL
  // ----------------------------------------------------
  const handleDownloadTemplate = () => {
    const templateRows = [
      {
        No_Resep: 'RXP-2026-001',
        Tanggal: new Date().toISOString().split('T')[0],
        Nama_Pasien: 'Ny. Siti Rahmawati',
        Usia_Pasien: '35 Tahun',
        Nama_Dokter: 'dr. Budi Santoso Sp.PD',
        Diagnosa: 'ISPA & Faringitis Akut',
        Tindakan: 'Pemberian Terapi Antibiotik & Ekspektoran',
        Nama_Obat: 'Amoxicillin 500mg',
        Jumlah: 15,
        Satuan: 'Biji',
        Aturan_Pakai: '3x1 tablet sesudah makan (habiskan)',
        Biaya_Pemeriksaan: 50000,
      },
      {
        No_Resep: 'RXP-2026-001',
        Tanggal: new Date().toISOString().split('T')[0],
        Nama_Pasien: 'Ny. Siti Rahmawati',
        Usia_Pasien: '35 Tahun',
        Nama_Dokter: 'dr. Budi Santoso Sp.PD',
        Diagnosa: 'ISPA & Faringitis Akut',
        Tindakan: 'Pemberian Terapi Antibiotik & Ekspektoran',
        Nama_Obat: 'Paracetamol 500mg',
        Jumlah: 10,
        Satuan: 'Biji',
        Aturan_Pakai: '3x1 bila demam/nyeri',
        Biaya_Pemeriksaan: 50000,
      },
      {
        No_Resep: 'RXP-2026-002',
        Tanggal: new Date().toISOString().split('T')[0],
        Nama_Pasien: 'Tn. Hendra Gunawan',
        Usia_Pasien: '48 Tahun',
        Nama_Dokter: 'dr. Sarah Amanda Sp.JP',
        Diagnosa: 'Hipertensi Primer Stage 1',
        Tindakan: 'Kontrol Tekanan Darah & Konseling Diet Rendah Garam',
        Nama_Obat: 'Amlodipine 5mg',
        Jumlah: 30,
        Satuan: 'Biji',
        Aturan_Pakai: '1x1 malam hari secara teratur',
        Biaya_Pemeriksaan: 75000,
      },
      {
        No_Resep: 'RXP-2026-003',
        Tanggal: new Date().toISOString().split('T')[0],
        Nama_Pasien: 'An. Kevin Pratama',
        Usia_Pasien: '6 Tahun',
        Nama_Dokter: 'dr. Maya Kartika Sp.A',
        Diagnosa: 'Dermatitis Alergi',
        Tindakan: 'Edukasi Kebersihan Kulit & Salep Topikal',
        Nama_Obat: 'Hydrocortisone Salep 1%',
        Jumlah: 1,
        Satuan: 'Tube',
        Aturan_Pakai: 'Oles tipis 2x sehari pada area gatal (Obat Luar)',
        Biaya_Pemeriksaan: 60000,
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateRows);
    worksheet['!cols'] = [
      { wch: 15 }, // No_Resep
      { wch: 12 }, // Tanggal
      { wch: 22 }, // Nama_Pasien
      { wch: 14 }, // Usia_Pasien
      { wch: 24 }, // Nama_Dokter
      { wch: 26 }, // Diagnosa
      { wch: 32 }, // Tindakan
      { wch: 25 }, // Nama_Obat
      { wch: 10 }, // Jumlah
      { wch: 10 }, // Satuan
      { wch: 35 }, // Aturan_Pakai
      { wch: 18 }, // Biaya_Pemeriksaan
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Template Riwayat Resep');
    XLSX.writeFile(workbook, 'template_import_riwayat_resep.xlsx');
    showNotification('success', 'Template Excel riwayat resep berhasil diunduh.');
  };

  const handleExportExcel = () => {
    if (filteredRecords.length === 0) {
      showNotification('error', 'Tidak ada data riwayat resep untuk diekspor.');
      return;
    }

    const flatRows: Record<string, any>[] = [];
    filteredRecords.forEach((rec, recIdx) => {
      if (rec.items && rec.items.length > 0) {
        rec.items.forEach((item, itemIdx) => {
          flatRows.push({
            'No': recIdx + 1,
            'No Resep': rec.prescriptionNo,
            'Tanggal': rec.date ? formatDate(rec.date) : '-',
            'Nama Pasien': rec.patientName,
            'Usia': rec.patientAge || '-',
            'Dokter': rec.doctorName || '-',
            'Diagnosa': rec.diagnosis || '-',
            'Tindakan': rec.action || '-',
            'Item Obat': item.medicineName,
            'Jumlah': item.quantity,
            'Satuan': item.unit,
            'Aturan Pakai': item.signa || '-',
            'Biaya Pemeriksaan': itemIdx === 0 ? rec.examinationFee : 0,
            'Sumber': rec.source === 'IMPORTED' ? 'Impor Excel' : 'Resep Langsung',
          });
        });
      } else {
        flatRows.push({
          'No': recIdx + 1,
          'No Resep': rec.prescriptionNo,
          'Tanggal': rec.date ? formatDate(rec.date) : '-',
          'Nama Pasien': rec.patientName,
          'Usia': rec.patientAge || '-',
          'Dokter': rec.doctorName || '-',
          'Diagnosa': rec.diagnosis || '-',
          'Tindakan': rec.action || '-',
          'Item Obat': '-',
          'Jumlah': 0,
          'Satuan': '-',
          'Aturan Pakai': '-',
          'Biaya Pemeriksaan': rec.examinationFee,
          'Sumber': rec.source === 'IMPORTED' ? 'Impor Excel' : 'Resep Langsung',
        });
      }
    });

    const worksheet = XLSX.utils.json_to_sheet(flatRows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Riwayat Resep');
    XLSX.writeFile(
      workbook,
      `riwayat_pengeluaran_resep_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    showNotification('success', `Berhasil mengekspor ${flatRows.length} baris riwayat resep ke Excel.`);
  };

  // ----------------------------------------------------
  // IMPORT FILE HANDLING & PARSING
  // ----------------------------------------------------
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setImportFileName(file.name);
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
        const sheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[sheetName];

        const rawHeaderData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!rawHeaderData || rawHeaderData.length === 0) {
          showNotification('error', 'File Excel kosong.');
          setIsProcessingFile(false);
          return;
        }

        const headers = (rawHeaderData[0] || []).map((h) => String(h ?? '').trim()).filter(Boolean);
        if (headers.length === 0) {
          showNotification('error', 'Tidak dapat mendeteksi header kolom file ini.');
          setIsProcessingFile(false);
          return;
        }

        const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);
        if (rawRows.length === 0) {
          showNotification('error', 'Tidak ada baris data di dalam file.');
          setIsProcessingFile(false);
          return;
        }

        // Auto-detect columns
        const findCol = (pattern: RegExp) => headers.find((h) => pattern.test(h)) || '';
        const detectedMapping = {
          prescriptionNo: findCol(/no.*resep|recipe.*no|id.*resep|no.*faktur|no.*reg|nomor/i),
          date: findCol(/tanggal|tgl.*resep|tgl|date/i),
          patientName: findCol(/nama.*pasien|pasien|patient/i),
          patientAge: findCol(/usia|umur|age/i),
          doctorName: findCol(/nama.*dokter|dokter|doctor|dr/i),
          diagnosis: findCol(/diagnosa|diagnosis|keluhan/i),
          action: findCol(/tindakan|action|pelayanan/i),
          medicineName: findCol(/nama.*obat|obat|medicine|item|nama.*barang/i),
          quantity: findCol(/jumlah|qty|kuantitas|banyak/i),
          unit: findCol(/satuan|unit/i),
          signa: findCol(/signa|aturan.*pakai|aturan|dosis/i),
          examinationFee: findCol(/biaya|fee|tarif|total/i),
        };

        setDetectedHeaders(headers);
        setMapping(detectedMapping);
        setParsedRawRows(rawRows);
        setIsProcessingFile(false);
        setShowImportModal(true);
      } catch (err: any) {
        console.error('Excel parse error:', err);
        showNotification('error', `Gagal membaca file: ${err.message || 'Format tidak didukung'}`);
        setIsProcessingFile(false);
      }
    };

    reader.onerror = () => {
      showNotification('error', 'Gagal membaca file dari disk.');
      setIsProcessingFile(false);
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // Convert raw rows with mapping into PrescriptionRecord[] preview
  const previewPrescriptions = useMemo(() => {
    if (parsedRawRows.length === 0) return [];

    const grouped: Record<string, PrescriptionRecord> = {};

    parsedRawRows.forEach((row, idx) => {
      const rxRaw = mapping.prescriptionNo ? String(row[mapping.prescriptionNo] ?? '').trim() : '';
      const patientRaw = mapping.patientName ? String(row[mapping.patientName] ?? '').trim() : 'Pasien Impor';
      const dateRaw = mapping.date ? row[mapping.date] : new Date().toISOString();

      let dateISO = new Date().toISOString();
      if (dateRaw) {
        if (dateRaw instanceof Date && !isNaN(dateRaw.getTime())) {
          dateISO = dateRaw.toISOString();
        } else {
          const parsedD = new Date(dateRaw);
          if (!isNaN(parsedD.getTime())) dateISO = parsedD.toISOString();
        }
      }

      // Group key: prescriptionNo, or patientName + date
      const key = rxRaw || `IMP-${patientRaw.replace(/\s+/g, '_')}-${dateISO.slice(0, 10)}-${Math.floor(idx / 3)}`;

      const medName = mapping.medicineName ? String(row[mapping.medicineName] ?? '').trim() : 'Obat Resep';
      const qtyNum = mapping.quantity ? parseFloat(row[mapping.quantity]) || 1 : 1;
      const unitStr = mapping.unit ? String(row[mapping.unit] ?? '').trim() || 'Biji' : 'Biji';
      const signaStr = mapping.signa ? String(row[mapping.signa] ?? '').trim() || 'Sesuai petunjuk dokter' : 'Sesuai petunjuk dokter';
      const feeNum = mapping.examinationFee ? parseFloat(String(row[mapping.examinationFee]).replace(/[^\d.-]/g, '')) || 0 : 0;

      const item: PrescriptionRecordItem = {
        medicineName: medName,
        quantity: Math.abs(qtyNum),
        unit: unitStr,
        signa: signaStr,
        labelType: /sirup|tetes|salep/i.test(unitStr) ? 'LUAR' : 'DALAM',
      };

      if (!grouped[key]) {
        grouped[key] = {
          id: generateId(),
          prescriptionNo: rxRaw || `RXP-${Date.now().toString().slice(-6)}-${idx + 1}`,
          patientName: patientRaw,
          patientAge: mapping.patientAge ? String(row[mapping.patientAge] ?? '').trim() : '',
          doctorName: mapping.doctorName ? String(row[mapping.doctorName] ?? '').trim() : 'dr. Praktek Umum',
          diagnosis: mapping.diagnosis ? String(row[mapping.diagnosis] ?? '').trim() : '',
          action: mapping.action ? String(row[mapping.action] ?? '').trim() : '',
          examinationFee: feeNum,
          totalCost: feeNum,
          date: dateISO,
          items: [item],
          source: 'IMPORTED',
        };
      } else {
        grouped[key].items.push(item);
        if (feeNum > 0 && grouped[key].examinationFee === 0) {
          grouped[key].examinationFee = feeNum;
          grouped[key].totalCost = feeNum;
        }
      }
    });

    return Object.values(grouped);
  }, [parsedRawRows, mapping]);

  const handleConfirmImport = () => {
    if (previewPrescriptions.length === 0) {
      showNotification('error', 'Tidak ada data valid yang dapat diimpor.');
      return;
    }

    try {
      importPrescriptionRecords(previewPrescriptions, syncToMutations);
      refreshData();
      setShowImportModal(false);
      showNotification(
        'success',
        `Berhasil mengimpor ${previewPrescriptions.length} resep dokter (${parsedRawRows.length} baris item)!`
      );
    } catch (err: any) {
      console.error('Import error:', err);
      showNotification('error', `Gagal menyimpan data impor: ${err.message || 'Kesalahan sistem'}`);
    }
  };

  // ----------------------------------------------------
  // DELETE RECORD
  // ----------------------------------------------------
  const handleOpenDelete = (rec: PrescriptionRecord) => {
    setRecordToDelete(rec);
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (!recordToDelete) return;
    try {
      deletePrescriptionRecord(recordToDelete.prescriptionNo || recordToDelete.id);
      refreshData();
      setShowDeleteModal(false);
      setRecordToDelete(null);
      showNotification('success', `Riwayat resep ${recordToDelete.prescriptionNo} berhasil dihapus.`);
    } catch (err: any) {
      showNotification('error', 'Gagal menghapus riwayat resep.');
    }
  };

  // ----------------------------------------------------
  // DETAIL & PRINT
  // ----------------------------------------------------
  const handleOpenDetail = (rec: PrescriptionRecord, tab: 'KWITANSI' | 'ETIKET' = 'KWITANSI') => {
    setSelectedRecord(rec);
    setModalTab(tab);
    setShowDetailModal(true);
  };

  const handlePrint = () => {
    window.print();
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

      {/* Hidden File Input */}
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".xlsx,.xls,.csv"
        style={{ display: 'none' }}
      />

      {/* Page Header */}
      <div className="page-header">
        <div className="page-header-info">
          <h1>Riwayat &amp; Impor Pengeluaran Resep</h1>
          <p>
            Kelola arsip lengkap pelayanan resep dokter, rincian obat per pasien, cetak ulang kwitansi/etiket farmasi, serta
            impor data resep dari berkas Excel/CSV.
          </p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadTemplate}
            title="Unduh format file Excel untuk impor resep"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            <span>Unduh Template</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            disabled={isProcessingFile}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="17 8 12 3 7 8" />
              <line x1="12" y1="3" x2="12" y2="15" />
            </svg>
            <span>{isProcessingFile ? 'Membaca File...' : 'Impor Excel/CSV'}</span>
          </button>

          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleExportExcel}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
              <line x1="3" y1="9" x2="21" y2="9" />
              <line x1="3" y1="15" x2="21" y2="15" />
              <line x1="15" y1="3" x2="15" y2="21" />
            </svg>
            <span>Ekspor Excel</span>
          </button>

          <Link
            href="/prescription"
            className="btn btn-primary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            <span>Input Resep Baru</span>
          </Link>
        </div>
      </div>

      {/* KPI Stats Cards */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
          gap: 'var(--sp-4)',
          marginBottom: 'var(--sp-5)',
        }}
      >
        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(15, 118, 110, 0.12)',
              color: 'var(--teal-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="4" y="2" width="16" height="20" rx="2" />
              <line x1="8" y1="6" x2="16" y2="6" />
              <line x1="8" y1="10" x2="16" y2="10" />
              <line x1="8" y1="14" x2="12" y2="14" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>Total Resep Tercatat</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.totalPrescriptions} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Faktur</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(14, 165, 233, 0.12)',
              color: '#0284c7',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
              <circle cx="9" cy="7" r="4" />
              <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
              <path d="M16 3.13a4 4 0 0 1 0 7.75" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>Total Pasien Unik</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.uniquePatients} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Orang</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(245, 158, 11, 0.12)',
              color: '#d97706',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10.5 20.5l10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" />
              <path d="m8.5 8.5 7 7" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>Total Obat Resep</div>
            <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {stats.totalItems} <span style={{ fontSize: '0.85rem', fontWeight: 500 }}>Item</span>
            </div>
          </div>
        </div>

        <div className="card" style={{ display: 'flex', alignItems: 'center', gap: '14px', padding: '16px 20px' }}>
          <div
            style={{
              width: '46px',
              height: '46px',
              borderRadius: '10px',
              background: 'rgba(34, 197, 94, 0.12)',
              color: '#16a34a',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <div>
            <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', fontWeight: 600 }}>Total Nilai Pemeriksaan</div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--text-primary)' }}>
              {formatRupiah(stats.totalFees)}
            </div>
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="card" style={{ marginBottom: 'var(--sp-4)', padding: '16px' }}>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between' }}>
          {/* Input Search */}
          <div style={{ flex: '1 1 300px', position: 'relative' }}>
            <span
              style={{
                position: 'absolute',
                left: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--slate-400)',
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
            </span>
            <input
              type="text"
              className="form-input"
              placeholder="Cari No. Resep, Pasien, Dokter, Diagnosa, atau Obat..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{ paddingLeft: '38px', width: '100%' }}
            />
          </div>

          {/* Date Filter Buttons */}
          <div style={{ display: 'flex', gap: '4px', background: 'var(--slate-100)', padding: '3px', borderRadius: '8px' }}>
            <button
              type="button"
              className={`btn btn-xs ${dateFilter === 'ALL' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDateFilter('ALL')}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              Semua Waktu
            </button>
            <button
              type="button"
              className={`btn btn-xs ${dateFilter === 'TODAY' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDateFilter('TODAY')}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              Hari Ini
            </button>
            <button
              type="button"
              className={`btn btn-xs ${dateFilter === 'WEEK' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDateFilter('WEEK')}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              7 Hari
            </button>
            <button
              type="button"
              className={`btn btn-xs ${dateFilter === 'MONTH' ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setDateFilter('MONTH')}
              style={{ fontSize: '0.8rem', padding: '4px 10px' }}
            >
              30 Hari
            </button>
          </div>

          {/* Doctor Filter Dropdown */}
          {doctorList.length > 0 && (
            <div style={{ minWidth: '180px' }}>
              <select
                className="form-input"
                value={doctorFilter}
                onChange={(e) => setDoctorFilter(e.target.value)}
                style={{ fontSize: '0.85rem', padding: '6px 10px' }}
              >
                <option value="ALL">Semua Dokter ({doctorList.length})</option>
                {doctorList.map((doc) => (
                  <option key={doc} value={doc}>
                    {doc}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Main Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--slate-500)' }}>
            Memuat data riwayat resep...
          </div>
        ) : filteredRecords.length === 0 ? (
          <div style={{ padding: '48px 20px', textAlign: 'center' }}>
            <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>📋</div>
            <h3 style={{ margin: '0 0 6px 0', color: 'var(--text-primary)' }}>Belum Ada Data Riwayat Resep</h3>
            <p style={{ margin: '0 0 16px 0', color: 'var(--slate-500)', fontSize: '0.88rem' }}>
              {searchQuery || dateFilter !== 'ALL' || doctorFilter !== 'ALL'
                ? 'Tidak ada data resep yang sesuai dengan filter pencarian Anda.'
                : 'Mulai dengan mengimpor file Excel riwayat lama atau input resep baru dari menu pelayanan resep.'}
            </p>
            <div style={{ display: 'flex', gap: '8px', justifyContent: 'center' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => fileInputRef.current?.click()}
              >
                📥 Impor Riwayat Resep
              </button>
              <Link href="/prescription" className="btn btn-primary">
                ➕ Input Resep Sekarang
              </Link>
            </div>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table">
              <thead>
                <tr>
                  <th style={{ width: '45px', textAlign: 'center' }}>#</th>
                  <th>No. Resep / Tanggal</th>
                  <th>Data Pasien</th>
                  <th>Dokter &amp; Diagnosa</th>
                  <th>Daftar Obat Resep</th>
                  <th style={{ textAlign: 'right' }}>Biaya Pemeriksaan</th>
                  <th style={{ textAlign: 'center', width: '150px' }}>Aksi</th>
                </tr>
              </thead>
              <tbody>
                {filteredRecords.map((rec, idx) => (
                  <tr key={rec.id || rec.prescriptionNo || idx}>
                    <td style={{ textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.85rem' }}>
                      {idx + 1}
                    </td>

                    {/* No. Resep & Tanggal */}
                    <td>
                      <div style={{ fontWeight: 700, color: 'var(--teal-600)', fontSize: '0.9rem' }}>
                        {rec.prescriptionNo}
                      </div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate-400)', marginTop: '2px' }}>
                        {rec.date ? formatDate(rec.date) : '-'}
                      </div>
                      {rec.source === 'IMPORTED' && (
                        <span
                          className="badge"
                          style={{
                            background: 'rgba(99, 102, 241, 0.12)',
                            color: '#6366f1',
                            fontSize: '0.68rem',
                            marginTop: '4px',
                            display: 'inline-block',
                          }}
                        >
                          Impor Excel
                        </span>
                      )}
                    </td>

                    {/* Data Pasien */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{rec.patientName}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                        {rec.patientAge ? `Usia: ${rec.patientAge}` : '-'}
                      </div>
                    </td>

                    {/* Dokter & Diagnosa */}
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-primary)', fontSize: '0.86rem' }}>
                        {rec.doctorName || 'dr. Praktek'}
                      </div>
                      {rec.diagnosis && (
                        <div style={{ fontSize: '0.78rem', color: 'var(--teal-700)', marginTop: '2px' }}>
                          🩺 {rec.diagnosis}
                        </div>
                      )}
                      {rec.action && (
                        <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '1px' }}>
                          ⚡ {rec.action}
                        </div>
                      )}
                    </td>

                    {/* Daftar Obat */}
                    <td>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px', maxWidth: '280px' }}>
                        {rec.items && rec.items.length > 0 ? (
                          rec.items.map((it, itIdx) => (
                            <div
                              key={itIdx}
                              style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                background: 'var(--slate-50)',
                                border: '1px solid var(--slate-200)',
                                padding: '3px 8px',
                                borderRadius: '4px',
                                fontSize: '0.78rem',
                              }}
                            >
                              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                                {it.medicineName}
                              </span>
                              <span style={{ color: 'var(--teal-700)', fontWeight: 600, marginLeft: '6px' }}>
                                {it.quantity} {it.unit}
                              </span>
                            </div>
                          ))
                        ) : (
                          <span style={{ color: 'var(--slate-400)', fontSize: '0.8rem' }}>-</span>
                        )}
                      </div>
                    </td>

                    {/* Biaya Pemeriksaan */}
                    <td style={{ textAlign: 'right', fontWeight: 700, color: 'var(--text-primary)' }}>
                      {formatRupiah(rec.examinationFee || rec.totalCost || 0)}
                    </td>

                    {/* Aksi */}
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: '6px', justifyContent: 'center' }}>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() => handleOpenDetail(rec, 'KWITANSI')}
                          title="Lihat Kwitansi Pembayaran"
                          style={{ padding: '4px 7px' }}
                        >
                          📄 Kwitansi
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-secondary"
                          onClick={() => handleOpenDetail(rec, 'ETIKET')}
                          title="Cetak Etiket Obat"
                          style={{ padding: '4px 7px' }}
                        >
                          🏷️ Etiket
                        </button>
                        <button
                          type="button"
                          className="btn btn-xs btn-ghost"
                          onClick={() => handleOpenDelete(rec)}
                          title="Hapus Arsip Riwayat Resep"
                          style={{ padding: '4px 6px', color: 'var(--rose-600)' }}
                        >
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ==================================================== */}
      {/* MODAL DETAIL / CETAK KWITANSI & ETIKET               */}
      {/* ==================================================== */}
      {showDetailModal && selectedRecord && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide" id="printable-prescription-modal" style={{ maxWidth: '780px' }}>
            <div className="modal-header no-print">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <h2 style={{ margin: 0 }}>Arsip Resep: {selectedRecord.prescriptionNo}</h2>
                <div style={{ display: 'flex', gap: '4px', background: 'var(--slate-100)', padding: '3px', borderRadius: '8px' }}>
                  <button
                    type="button"
                    className={`btn btn-xs ${modalTab === 'KWITANSI' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setModalTab('KWITANSI')}
                    style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  >
                    📄 Kwitansi
                  </button>
                  <button
                    type="button"
                    className={`btn btn-xs ${modalTab === 'ETIKET' ? 'btn-primary' : 'btn-ghost'}`}
                    onClick={() => setModalTab('ETIKET')}
                    style={{ fontSize: '0.78rem', padding: '3px 10px' }}
                  >
                    🏷️ Etiket ({selectedRecord.items?.length || 0})
                  </button>
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowDetailModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body">
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
                        <span style={{ color: '#64748b' }}>Nomor Resep: </span>
                        <strong>{selectedRecord.prescriptionNo}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Tanggal: </span>
                        <strong>{selectedRecord.date ? formatDate(selectedRecord.date) : '-'}</strong>
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Pasien: </span>
                        <strong>{selectedRecord.patientName}</strong> {selectedRecord.patientAge ? `(${selectedRecord.patientAge})` : ''}
                      </div>
                      <div>
                        <span style={{ color: '#64748b' }}>Dokter: </span>
                        <strong>{selectedRecord.doctorName || 'dr. Praktek'}</strong>
                      </div>
                      {selectedRecord.diagnosis && (
                        <div>
                          <span style={{ color: '#64748b' }}>Diagnosa: </span>
                          <strong>{selectedRecord.diagnosis}</strong>
                        </div>
                      )}
                      {selectedRecord.action && (
                        <div>
                          <span style={{ color: '#64748b' }}>Tindakan: </span>
                          <strong>{selectedRecord.action}</strong>
                        </div>
                      )}
                    </div>

                    {/* Daftar Obat */}
                    <div style={{ marginBottom: '16px' }}>
                      <div style={{ fontWeight: 700, fontSize: '0.85rem', marginBottom: '8px', color: '#334155' }}>
                        Rincian Obat yang Diberikan:
                      </div>
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                        <thead>
                          <tr style={{ background: '#f1f5f9', textAlign: 'left', borderBottom: '1px solid #cbd5e1' }}>
                            <th style={{ padding: '6px 8px' }}>No</th>
                            <th style={{ padding: '6px 8px' }}>Nama Obat</th>
                            <th style={{ padding: '6px 8px' }}>Jumlah</th>
                            <th style={{ padding: '6px 8px' }}>Aturan Pakai (Signa)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {selectedRecord.items?.map((item, idx) => (
                            <tr key={idx} style={{ borderBottom: '1px solid #e2e8f0' }}>
                              <td style={{ padding: '6px 8px', color: '#64748b' }}>{idx + 1}</td>
                              <td style={{ padding: '6px 8px', fontWeight: 600 }}>{item.medicineName}</td>
                              <td style={{ padding: '6px 8px' }}>{item.quantity} {item.unit}</td>
                              <td style={{ padding: '6px 8px', color: '#0f766e', fontWeight: 500 }}>{item.signa || '-'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>

                    {/* Total Biaya */}
                    <div style={{ borderTop: '2px dashed #cbd5e1', paddingTop: '12px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 600, color: '#334155' }}>
                        Biaya Pemeriksaan &amp; Pelayanan:
                      </div>
                      <div style={{ fontSize: '1.25rem', fontWeight: 800, color: '#0f766e' }}>
                        {formatRupiah(selectedRecord.examinationFee || selectedRecord.totalCost || 0)}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {modalTab === 'ETIKET' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '14px' }}>
                  {selectedRecord.items?.map((item, idx) => {
                    const isWhite = item.labelType !== 'LUAR';
                    return (
                      <div
                        key={idx}
                        style={{
                          border: isWhite ? '2px solid #0f766e' : '2px solid #0284c7',
                          borderRadius: '8px',
                          padding: '14px',
                          background: isWhite ? '#ffffff' : '#f0f9ff',
                          color: '#0f172a',
                          boxShadow: '0 2px 6px rgba(0,0,0,0.05)',
                        }}
                      >
                        <div style={{ textAlign: 'center', borderBottom: isWhite ? '1px solid #0f766e' : '1px solid #0284c7', paddingBottom: '6px', marginBottom: '8px' }}>
                          <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isWhite ? '#0f766e' : '#0284c7' }}>
                            APOTEK SEHAT SENTOSA
                          </div>
                          <div style={{ fontSize: '0.68rem', color: '#475569' }}>
                            Apt. Fadhil S.Farm &bull; Telp: (0411) 889900
                          </div>
                        </div>

                        <div style={{ fontSize: '0.78rem', display: 'flex', justifyContent: 'space-between', marginBottom: '6px' }}>
                          <span>No: <strong>{selectedRecord.prescriptionNo}</strong></span>
                          <span>Tgl: {selectedRecord.date ? formatDate(selectedRecord.date) : '-'}</span>
                        </div>

                        <div style={{ fontSize: '0.82rem', marginBottom: '6px' }}>
                          Pasien: <strong>{selectedRecord.patientName}</strong> {selectedRecord.patientAge ? `(${selectedRecord.patientAge})` : ''}
                        </div>

                        <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0f172a', marginBottom: '4px' }}>
                          💊 {item.medicineName} ({item.quantity} {item.unit})
                        </div>

                        <div
                          style={{
                            background: isWhite ? '#f0fdf4' : '#e0f2fe',
                            border: isWhite ? '1px dashed #22c55e' : '1px dashed #0284c7',
                            padding: '6px 10px',
                            borderRadius: '4px',
                            fontWeight: 700,
                            fontSize: '0.88rem',
                            color: isWhite ? '#15803d' : '#0369a1',
                            textAlign: 'center',
                            margin: '8px 0',
                          }}
                        >
                          {item.signa || '3x Sehari 1 Tablet'}
                        </div>

                        <div style={{ fontSize: '0.7rem', textAlign: 'center', color: '#64748b' }}>
                          {isWhite ? 'OBAT DALAM (DIMINUM)' : 'OBAT LUAR (TIDAK DITELAN)'}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="modal-footer no-print">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDetailModal(false)}
              >
                Tutup
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handlePrint}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <polyline points="6 9 6 2 18 2 18 9" />
                  <path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <rect x="6" y="14" width="12" height="8" />
                </svg>
                <span>Cetak {modalTab === 'KWITANSI' ? 'Kwitansi' : 'Etiket'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL IMPORT EXCEL / CSV DENGAN COLUMN MAPPING       */}
      {/* ==================================================== */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content modal-wide" style={{ maxWidth: '920px', maxHeight: '90vh' }}>
            <div className="modal-header">
              <div>
                <h2 style={{ margin: 0 }}>Impor Data Riwayat Pengeluaran Resep</h2>
                <div style={{ fontSize: '0.8rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                  Berkas: <strong>{importFileName}</strong> &bull; Terdeteksi <strong>{parsedRawRows.length}</strong> baris data
                </div>
              </div>
              <button className="modal-close" onClick={() => setShowImportModal(false)}>
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ maxHeight: 'calc(90vh - 160px)', overflowY: 'auto' }}>
              {/* Box Pemetaan Kolom */}
              <div className="card" style={{ background: 'var(--slate-50)', marginBottom: 'var(--sp-4)', padding: '16px' }}>
                <h4 style={{ margin: '0 0 10px 0', fontSize: '0.92rem', color: 'var(--teal-700)' }}>
                  ⚙️ Pemetaan Kolom Data Excel ke Sistem Apotek
                </h4>
                <p style={{ margin: '0 0 14px 0', fontSize: '0.8rem', color: 'var(--slate-500)' }}>
                  Sistem otomatis mendeteksi kolom dari file Anda. Anda dapat menyesuaikan pemetaan jika judul kolom berbeda.
                </p>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '12px',
                  }}
                >
                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>No. Resep / ID</label>
                    <select
                      className="form-input"
                      value={mapping.prescriptionNo}
                      onChange={(e) => setMapping({ ...mapping, prescriptionNo: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Buat Otomatis --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Nama Pasien *</label>
                    <select
                      className="form-input"
                      value={mapping.patientName}
                      onChange={(e) => setMapping({ ...mapping, patientName: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Usia Pasien</label>
                    <select
                      className="form-input"
                      value={mapping.patientAge}
                      onChange={(e) => setMapping({ ...mapping, patientAge: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Nama Dokter</label>
                    <select
                      className="form-input"
                      value={mapping.doctorName}
                      onChange={(e) => setMapping({ ...mapping, doctorName: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Nama Obat *</label>
                    <select
                      className="form-input"
                      value={mapping.medicineName}
                      onChange={(e) => setMapping({ ...mapping, medicineName: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Jumlah / Qty</label>
                    <select
                      className="form-input"
                      value={mapping.quantity}
                      onChange={(e) => setMapping({ ...mapping, quantity: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Standar (1) --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Satuan (Biji/Strip/Botol)</label>
                    <select
                      className="form-input"
                      value={mapping.unit}
                      onChange={(e) => setMapping({ ...mapping, unit: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Standar (Biji) --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Aturan Pakai (Signa)</label>
                    <select
                      className="form-input"
                      value={mapping.signa}
                      onChange={(e) => setMapping({ ...mapping, signa: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Diagnosa</label>
                    <select
                      className="form-input"
                      value={mapping.diagnosis}
                      onChange={(e) => setMapping({ ...mapping, diagnosis: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Biaya Pemeriksaan</label>
                    <select
                      className="form-input"
                      value={mapping.examinationFee}
                      onChange={(e) => setMapping({ ...mapping, examinationFee: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Tidak Ada (Rp 0) --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-group">
                    <label className="form-label" style={{ fontSize: '0.78rem' }}>Tanggal Resep</label>
                    <select
                      className="form-input"
                      value={mapping.date}
                      onChange={(e) => setMapping({ ...mapping, date: e.target.value })}
                      style={{ fontSize: '0.82rem', padding: '5px 8px' }}
                    >
                      <option value="">-- Hari Ini --</option>
                      {detectedHeaders.map((h) => (
                        <option key={h} value={h}>{h}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Opsi Sinkronisasi */}
              <div style={{ marginBottom: '14px', background: 'var(--slate-50)', padding: '10px 14px', borderRadius: '6px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem' }}>
                  <input
                    type="checkbox"
                    checked={syncToMutations}
                    onChange={(e) => setSyncToMutations(e.target.checked)}
                  />
                  <span>
                    <strong>Sinkronkan ke Log Mutasi Apotek (PENGELUARAN_RESEP)</strong>
                    <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--slate-500)' }}>
                      Mencatat data impor ini ke riwayat mutasi stok apotek agar audit log konsisten dengan halaman resep dan analitik.
                    </span>
                  </span>
                </label>
              </div>

              {/* Preview Hasil Parsing */}
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <h4 style={{ margin: 0, fontSize: '0.9rem' }}>
                    👁️ Pratinjau Pengelompokan Resep ({previewPrescriptions.length} Resep Terbentuk)
                  </h4>
                  <span style={{ fontSize: '0.78rem', color: 'var(--slate-500)' }}>
                    Menampilkan 5 resep pertama
                  </span>
                </div>

                <div className="table-responsive" style={{ maxHeight: '240px', overflowY: 'auto', border: '1px solid var(--slate-200)', borderRadius: '6px' }}>
                  <table className="table" style={{ fontSize: '0.8rem' }}>
                    <thead>
                      <tr>
                        <th>No. Resep</th>
                        <th>Pasien</th>
                        <th>Dokter &amp; Diagnosa</th>
                        <th>Obat Terdaftar</th>
                        <th style={{ textAlign: 'right' }}>Biaya</th>
                      </tr>
                    </thead>
                    <tbody>
                      {previewPrescriptions.slice(0, 5).map((p, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 600, color: 'var(--teal-600)' }}>{p.prescriptionNo}</td>
                          <td>
                            <strong>{p.patientName}</strong> {p.patientAge ? `(${p.patientAge})` : ''}
                          </td>
                          <td>
                            <div>{p.doctorName || '-'}</div>
                            {p.diagnosis && <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>{p.diagnosis}</div>}
                          </td>
                          <td>
                            {p.items?.map((it, i) => (
                              <div key={i} style={{ fontSize: '0.75rem' }}>
                                &bull; {it.medicineName} ({it.quantity} {it.unit})
                              </div>
                            ))}
                          </td>
                          <td style={{ textAlign: 'right', fontWeight: 600 }}>
                            {formatRupiah(p.examinationFee)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowImportModal(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleConfirmImport}
                disabled={previewPrescriptions.length === 0}
              >
                Simpan &amp; Impor {previewPrescriptions.length} Resep ({parsedRawRows.length} Baris Item)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL HAPUS RIWAYAT RESEP                           */}
      {/* ==================================================== */}
      {showDeleteModal && recordToDelete && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '440px' }}>
            <div className="modal-header">
              <h3 style={{ margin: 0, color: 'var(--rose-600)' }}>Konfirmasi Hapus Riwayat</h3>
              <button className="modal-close" onClick={() => setShowDeleteModal(false)}>
                &times;
              </button>
            </div>
            <div className="modal-body">
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--text-secondary)' }}>
                Apakah Anda yakin ingin menghapus arsip resep <strong>{recordToDelete.prescriptionNo}</strong> milik pasien{' '}
                <strong>{recordToDelete.patientName}</strong>?
              </p>
            </div>
            <div className="modal-footer">
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setShowDeleteModal(false)}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={handleConfirmDelete}
              >
                Hapus Resep
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
