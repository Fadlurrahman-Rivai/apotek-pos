'use client';

import { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import Link from 'next/link';
import { generateId, formatRupiah } from '@/lib/formatters';
import { initDB, addMedicine, addBatch, addMutation, getMedicines, clearAllData } from '@/database/db';
import { Medicine, StockBatch, MedicineCategory, BatchStatus, MutationType } from '@/database/schema';
import DatabaseConfigModal from '@/components/common/DatabaseConfigModal';
import { isSupabaseReady, cloudFetchWarehouse } from '@/lib/supabase';
import { enqueue, outboxStamp, canOverwriteLocal } from '@/lib/outbox';
import { useAuth } from '@/context/AuthContext';

// Data bawaan awal gudang (default sample)
const DEFAULT_COLUMNS = [
  'Nama Barang',
  'Kategori',
  'Stok Fisik',
  'Satuan',
  'Stok Strip',
  'Harga Modal',
  'Harga Jual',
  'Tanggal Exp',
];

const DEFAULT_ROWS: Record<string, any>[] = [];

const STORAGE_KEYS = {
  rows: 'apotek_gudang_rows',
  allCols: 'apotek_gudang_all_cols',
  selectedCols: 'apotek_gudang_selected_cols',
  fileName: 'apotek_gudang_file_name',
  importTime: 'apotek_gudang_import_time',
};

export default function GudangPage() {
  const { isAdmin } = useAuth();
  const [rows, setRows] = useState<Record<string, any>[]>([]);
  const [allColumns, setAllColumns] = useState<string[]>([]);
  const [selectedColumns, setSelectedColumns] = useState<string[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [lastImportedTime, setLastImportedTime] = useState<string>('');

  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Checkbox Selection State
  const [selectedRowIds, setSelectedRowIds] = useState<Set<string>>(new Set());

  // Modal Delete State
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{
    type: 'single' | 'bulk' | 'all';
    rowId?: string;
    rowName?: string;
  } | null>(null);

  // Modal Tambah Obat Manual State
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({
    namaBarang: '',
    kategori: 'BOX',
    satuan: 'Box',
    isiStripPerBox: 10 as number | string,
    stokFisik: 20 as number | string,
    hargaModal: 35000 as number | string,
    hargaJual: 50000 as number | string,
    hargaJualStrip: 5000 as number | string,
    tanggalExp: '',
    kondisi: 'Baik',
    syncToPos: true,
    extraFields: {} as Record<string, string>,
  });

  // Modal Buka Box (Unbox) State
  const [showUnboxModal, setShowUnboxModal] = useState(false);
  const [unboxTargetRow, setUnboxTargetRow] = useState<Record<string, any> | null>(null);
  const [unboxBoxCount, setUnboxBoxCount] = useState<number>(1);

  // Modal Import State
  const [showImportModal, setShowImportModal] = useState(false);
  const [modalFileName, setModalFileName] = useState('');
  const [modalDetectedColumns, setModalDetectedColumns] = useState<string[]>([]);
  const [modalSelectedColumns, setModalSelectedColumns] = useState<string[]>([]);
  const [modalParsedRows, setModalParsedRows] = useState<Record<string, any>[]>([]);
  const [isProcessingFile, setIsProcessingFile] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Modal Database Cloud State
  const [showDbModal, setShowDbModal] = useState(false);
  const [isDbConnected, setIsDbConnected] = useState(false);

  useEffect(() => {
    setIsDbConnected(isSupabaseReady());
    loadData();
    const handleSync = () => {
      setIsDbConnected(isSupabaseReady());
      loadData();
    };
    window.addEventListener('apotek-cloud-synced', handleSync);
    return () => window.removeEventListener('apotek-cloud-synced', handleSync);
  }, []);

  const showNotification = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), 3000);
  };

  const loadData = () => {
    if (typeof window === 'undefined') return;

    try {
      const PURGE_KEY = 'apotek_clean_slate_v1';
      if (!localStorage.getItem(PURGE_KEY)) {
        clearAllData();
        setRows([]);
        setAllColumns(DEFAULT_COLUMNS);
        setSelectedColumns(DEFAULT_COLUMNS);
        setFileName('Data Master Gudang');
        setLastImportedTime(new Date().toISOString());
        return;
      }

      const storedRows = localStorage.getItem(STORAGE_KEYS.rows);
      const storedAllCols = localStorage.getItem(STORAGE_KEYS.allCols);
      const storedSelectedCols = localStorage.getItem(STORAGE_KEYS.selectedCols);
      const storedFileName = localStorage.getItem(STORAGE_KEYS.fileName);
      const storedTime = localStorage.getItem(STORAGE_KEYS.importTime);

      if (storedRows !== null && storedAllCols !== null) {
        const parsedRows: Record<string, any>[] = JSON.parse(storedRows);
        const parsedAllCols: string[] = JSON.parse(storedAllCols);
        const parsedSelectedCols: string[] = storedSelectedCols
          ? JSON.parse(storedSelectedCols)
          : parsedAllCols;

        const rowsWithId = parsedRows.map((r, idx) => ({
          _rowId: r._rowId || `row_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          ...r,
        }));

        setRows(rowsWithId);
        setAllColumns(parsedAllCols);
        setSelectedColumns(parsedSelectedCols);
        setFileName(storedFileName || 'Data Gudang');
        setLastImportedTime(storedTime || '');
      } else {
        setRows([]);
        setAllColumns(DEFAULT_COLUMNS);
        setSelectedColumns(DEFAULT_COLUMNS);
        setFileName('Data Master Gudang');
        setLastImportedTime(new Date().toISOString());
      }

      // Jika Supabase terhubung, ambil data terbaru dari cloud database
      if (isSupabaseReady()) {
        const stamp = outboxStamp();
        cloudFetchWarehouse().then((cloudData) => {
          if (cloudData && cloudData.rows && canOverwriteLocal(stamp)) {
            setRows(cloudData.rows);
            if (cloudData.allColumns.length > 0) setAllColumns(cloudData.allColumns);
            if (cloudData.selectedColumns.length > 0) setSelectedColumns(cloudData.selectedColumns);
            if (cloudData.fileName) setFileName(cloudData.fileName);
            if (cloudData.importTime) setLastImportedTime(cloudData.importTime);

            localStorage.setItem(STORAGE_KEYS.rows, JSON.stringify(cloudData.rows));
            if (cloudData.allColumns.length > 0) localStorage.setItem(STORAGE_KEYS.allCols, JSON.stringify(cloudData.allColumns));
            if (cloudData.selectedColumns.length > 0) localStorage.setItem(STORAGE_KEYS.selectedCols, JSON.stringify(cloudData.selectedColumns));
            if (cloudData.fileName) localStorage.setItem(STORAGE_KEYS.fileName, cloudData.fileName);
            if (cloudData.importTime) localStorage.setItem(STORAGE_KEYS.importTime, cloudData.importTime);
          }
        });
      }
    } catch (e) {
      console.error('Error loading warehouse data:', e);
      setRows([]);
      setAllColumns(DEFAULT_COLUMNS);
      setSelectedColumns(DEFAULT_COLUMNS);
    }
  };

  const saveToStorage = (
    newRows: Record<string, any>[],
    allCols: string[],
    selCols: string[],
    name: string
  ) => {
    if (typeof window === 'undefined') return;
    const now = new Date().toISOString();

    const rowsWithId = newRows.map((r, idx) => ({
      _rowId: r._rowId || `row_${idx}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      ...r,
    }));

    localStorage.setItem(STORAGE_KEYS.rows, JSON.stringify(rowsWithId));
    localStorage.setItem(STORAGE_KEYS.allCols, JSON.stringify(allCols));
    localStorage.setItem(STORAGE_KEYS.selectedCols, JSON.stringify(selCols));
    localStorage.setItem(STORAGE_KEYS.fileName, name);
    localStorage.setItem(STORAGE_KEYS.importTime, now);

    setRows(rowsWithId);
    setAllColumns(allCols);
    setSelectedColumns(selCols);
    setFileName(name);
    setLastImportedTime(now);

    enqueue({ kind: 'warehouseSave', rows: rowsWithId, allCols, selCols, name });
  };

  // Toggle pilihan kolom yang tampil di halaman gudang
  const handleToggleColumn = (col: string) => {
    let nextCols: string[];
    if (selectedColumns.includes(col)) {
      if (selectedColumns.length === 1) {
        showNotification('error', 'Minimal satu kolom harus tetap dipilih!');
        return;
      }
      nextCols = selectedColumns.filter((c) => c !== col);
    } else {
      nextCols = [...selectedColumns, col];
    }
    setSelectedColumns(nextCols);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.selectedCols, JSON.stringify(nextCols));
    }
  };

  const handleSelectAllColumns = () => {
    setSelectedColumns([...allColumns]);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.selectedCols, JSON.stringify(allColumns));
    }
  };

  const handleResetToDefaultColumns = () => {
    const defaultCols = allColumns.slice(0, Math.min(10, allColumns.length));
    setSelectedColumns(defaultCols);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEYS.selectedCols, JSON.stringify(defaultCols));
    }
    showNotification('success', 'Pilihan kolom dikembalikan ke default.');
  };

  // ----------------------------------------------------
  // FITUR HAPUS DATA GUDANG (Single, Bulk, & Clear All)
  // ----------------------------------------------------
  const handleOpenDeleteSingle = (row: Record<string, any>) => {
    setDeleteTarget({
      type: 'single',
      rowId: row._rowId,
      rowName: row['Nama Barang'] || row['Nama Obat'] || 'Barang ini',
    });
    setShowDeleteModal(true);
  };

  const handleOpenBulkDelete = () => {
    if (selectedRowIds.size === 0) return;
    setDeleteTarget({
      type: 'bulk',
    });
    setShowDeleteModal(true);
  };

  const handleOpenClearAll = () => {
    if (rows.length === 0) {
      showNotification('error', 'Gudang sudah kosong.');
      return;
    }
    setDeleteTarget({
      type: 'all',
    });
    setShowDeleteModal(true);
  };

  const handleConfirmDelete = () => {
    if (!deleteTarget) return;

    if (deleteTarget.type === 'single') {
      const nextRows = rows.filter((r) => r._rowId !== deleteTarget.rowId);
      saveToStorage(nextRows, allColumns, selectedColumns, fileName);
      if (deleteTarget.rowId) {
        setSelectedRowIds((prev) => {
          const next = new Set(prev);
          next.delete(deleteTarget.rowId!);
          return next;
        });
      }
      showNotification('success', `Data "${deleteTarget.rowName}" berhasil dihapus dari gudang.`);
    } else if (deleteTarget.type === 'bulk') {
      const count = selectedRowIds.size;
      const nextRows = rows.filter((r) => !selectedRowIds.has(r._rowId));
      saveToStorage(nextRows, allColumns, selectedColumns, fileName);
      setSelectedRowIds(new Set());
      showNotification('success', `${count} data barang terpilih berhasil dihapus dari gudang.`);
    } else if (deleteTarget.type === 'all') {
      saveToStorage([], allColumns, selectedColumns, 'Gudang Kosong (Input Mandiri)');
      setSelectedRowIds(new Set());
      showNotification('success', 'Seluruh data gudang telah dikosongkan. Anda dapat mulai menginput data baru!');
    }

    setShowDeleteModal(false);
    setDeleteTarget(null);
  };

  // Checkbox Selection Handlers
  const handleToggleSelectRow = (rowId: string) => {
    setSelectedRowIds((prev) => {
      const next = new Set(prev);
      if (next.has(rowId)) {
        next.delete(rowId);
      } else {
        next.add(rowId);
      }
      return next;
    });
  };

  // Filter baris data berdasarkan pencarian
  const filteredRows = rows.filter((row) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return selectedColumns.some((col) => {
      const val = row[col];
      if (val === undefined || val === null) return false;
      return String(val).toLowerCase().includes(q);
    });
  });

  const isAllFilteredSelected =
    filteredRows.length > 0 && filteredRows.every((r) => selectedRowIds.has(r._rowId));

  const handleToggleSelectAll = () => {
    if (isAllFilteredSelected) {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.delete(r._rowId));
        return next;
      });
    } else {
      setSelectedRowIds((prev) => {
        const next = new Set(prev);
        filteredRows.forEach((r) => next.add(r._rowId));
        return next;
      });
    }
  };

  // ----------------------------------------------------
  // FITUR BUKA BOX (UNBOX KE STRIP)
  // ----------------------------------------------------
  const handleOpenUnboxModal = (row: Record<string, any>) => {
    setUnboxTargetRow(row);
    setUnboxBoxCount(1);
    setShowUnboxModal(true);
  };

  const handleConfirmUnbox = () => {
    if (!unboxTargetRow) return;

    const currentBox = Number(unboxTargetRow['Stok Fisik'] || 0);
    const stripsPerBox = Number(unboxTargetRow['Isi Strip per Box'] || 10);
    const currentStrip = Number(unboxTargetRow['Stok Strip'] || 0);

    if (unboxBoxCount > currentBox) {
      showNotification('error', `Stok tidak mencukupi! Hanya tersedia ${currentBox} Box.`);
      return;
    }

    if (unboxBoxCount <= 0) {
      showNotification('error', 'Jumlah box yang dibuka minimal 1 Box.');
      return;
    }

    const nextBox = currentBox - unboxBoxCount;
    const addedStrips = unboxBoxCount * stripsPerBox;
    const nextStrip = currentStrip + addedStrips;

    const nextRows = rows.map((r) => {
      if (r._rowId === unboxTargetRow._rowId) {
        return {
          ...r,
          'Stok Fisik': nextBox,
          'Stok Strip': nextStrip,
        };
      }
      return r;
    });

    let nextAllCols = [...allColumns];
    let nextSelCols = [...selectedColumns];
    if (!nextAllCols.includes('Stok Strip')) {
      nextAllCols.push('Stok Strip');
    }
    if (!nextSelCols.includes('Stok Strip')) {
      nextSelCols.push('Stok Strip');
    }

    saveToStorage(nextRows, nextAllCols, nextSelCols, fileName);

    // Catat mutasi jika obat ada di database apotek
    try {
      initDB();
      const medName = unboxTargetRow['Nama Barang'];
      const medList = getMedicines();
      const matchedMed = medList.find((m) => m.name.toLowerCase() === medName.toLowerCase());
      if (matchedMed) {
        addMutation({
          id: generateId(),
          medicineId: matchedMed.id,
          batchId: null,
          mutationType: MutationType.UNBOX,
          qtyChange: 0,
          unitUsed: `${unboxBoxCount} Box ➔ ${addedStrips} Strip`,
          referenceNumber: `UNBOX-${Date.now().toString().slice(-6)}`,
          notes: `Buka ${unboxBoxCount} Box menjadi ${addedStrips} Strip di Gudang`,
          createdAt: new Date().toISOString(),
        });
      }
    } catch (e) {
      console.warn('DB mutation log error:', e);
    }

    setShowUnboxModal(false);
    setUnboxTargetRow(null);
    showNotification(
      'success',
      `Berhasil membuka ${unboxBoxCount} Box ${unboxTargetRow['Nama Barang']}. Stok berkurang ${unboxBoxCount} Box dan bertambah ${addedStrips} Strip!`
    );
  };

  // ----------------------------------------------------
  // FITUR TAMBAH OBAT SECARA MANUAL (FORM SEDERHANA)
  // ----------------------------------------------------
  const handleOpenAddModal = () => {
    const defaultExp = new Date();
    defaultExp.setFullYear(defaultExp.getFullYear() + 2);
    const expStr = defaultExp.toISOString().split('T')[0];

    const standardCols = [
      'Nama Barang',
      'Kategori',
      'Stok Fisik',
      'Satuan',
      'Stok Strip',
      'Harga Modal',
      'Harga Jual',
      'Harga Jual Strip',
      'Tanggal Exp',
      'Kondisi',
    ];
    const extraCols: Record<string, string> = {};
    allColumns.forEach((c) => {
      if (!standardCols.includes(c) && c !== '_rowId' && !/kode|batch|rak|pbf|kondisi/i.test(c)) {
        extraCols[c] = '';
      }
    });

    setAddForm({
      namaBarang: '',
      kategori: 'BOX',
      satuan: 'Box',
      isiStripPerBox: 10,
      stokFisik: 20,
      hargaModal: 35000,
      hargaJual: 50000,
      hargaJualStrip: 5000,
      tanggalExp: expStr,
      kondisi: 'Baik',
      syncToPos: true,
      extraFields: extraCols,
    });
    setShowAddModal(true);
  };

  const handleSaveManualMedicine = (e: React.FormEvent) => {
    e.preventDefault();

    if (!addForm.namaBarang.trim()) {
      showNotification('error', 'Nama barang / obat wajib diisi!');
      return;
    }

    const stokNum = parseFloat(String(addForm.stokFisik));
    if (isNaN(stokNum) || stokNum < 0) {
      showNotification('error', 'Stok fisik harus berupa angka non-negatif!');
      return;
    }

    const hargaModalNum = parseFloat(String(addForm.hargaModal)) || 0;
    if (isNaN(hargaModalNum) || hargaModalNum < 0) {
      showNotification('error', 'Harga modal harus berupa angka valid (minimal 0)!');
      return;
    }

    const hargaJualNum = parseFloat(String(addForm.hargaJual));
    if (isNaN(hargaJualNum) || hargaJualNum < 0) {
      showNotification('error', 'Harga jual harus berupa angka valid!');
      return;
    }

    if (!addForm.tanggalExp) {
      showNotification('error', 'Tanggal kadaluarsa wajib diisi!');
      return;
    }

    const isBox = addForm.kategori === 'BOX' || addForm.kategori === 'TABLET';
    const satuanFinal = isBox ? 'Box' : (addForm.satuan.trim() || 'Pcs');
    const stripsPerBoxFinal = isBox ? (parseInt(String(addForm.isiStripPerBox), 10) || 10) : 0;
    // Setiap harga tidak saling terkait satu sama lain, murni berdasarkan input pengguna
    const hargaJualStripFinal = isBox
      ? (parseFloat(String(addForm.hargaJualStrip)) || 0)
      : 0;

    const newRowId = `manual_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
    const newRow: Record<string, any> = {
      _rowId: newRowId,
      'Kode Barang': `OBT-${Date.now().toString().slice(-4)}`,
      'Nama Barang': addForm.namaBarang.trim(),
      'Kategori': addForm.kategori,
      'No Batch': `BCH-${new Date().getFullYear()}-${Math.floor(10 + Math.random() * 90)}`,
      'Stok Fisik': stokNum,
      'Satuan': satuanFinal,
      'Stok Strip': 0,
      'Isi Strip per Box': stripsPerBoxFinal,
      'Harga Modal': hargaModalNum,
      'Harga Jual': hargaJualNum,
      'Harga Jual Strip': hargaJualStripFinal,
      'Tanggal Exp': addForm.tanggalExp,
      'Lokasi Rak': isBox ? 'Rak Box / Strip Utama' : 'Gudang Utama',
      'PBF Distributor': '-',
      'Kondisi': 'Baik',
      ...addForm.extraFields,
    };

    // Pastikan kolom penting ada di allColumns & selectedColumns
    const importantCols = [
      'Nama Barang',
      'Kategori',
      'Stok Fisik',
      'Satuan',
      'Stok Strip',
      'Harga Modal',
      'Harga Jual',
      'Tanggal Exp',
    ];
    let nextAllCols = [...allColumns];
    let nextSelCols = [...selectedColumns];
    importantCols.forEach((col) => {
      if (!nextAllCols.includes(col)) {
        nextAllCols.push(col);
      }
      if (!nextSelCols.includes(col)) {
        nextSelCols.push(col);
      }
    });

    const nextRows = [newRow, ...rows];
    saveToStorage(nextRows, nextAllCols, nextSelCols, fileName || 'Data Gudang');

    // Sinkronisasi ke Katalog Obat & Kasir POS jika dicentang
    if (addForm.syncToPos) {
      try {
        initDB();
        const medId = generateId();

        const newMedicine: Medicine = {
          id: medId,
          name: newRow['Nama Barang'],
          category: (newRow['Kategori'] as MedicineCategory) || MedicineCategory.BOX,
          baseUnit: isBox ? 'Biji' : satuanFinal,
          secondaryUnit: isBox ? 'Strip' : null,
          tertiaryUnit: isBox ? 'Box' : null,
          piecesPerSecondary: isBox ? 10 : null,
          secondaryPerTertiary: isBox ? stripsPerBoxFinal : null,
          buyPrice: hargaModalNum, // Menggunakan harga modal langsung dari inputan pengguna
          sellPrice: hargaJualNum,
          sellPriceSecondary: isBox ? hargaJualStripFinal : null,
          sellPriceBase: isBox ? Math.round(hargaJualStripFinal / 10) : hargaJualNum,
          minStock: isBox ? 5 : 10,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        addMedicine(newMedicine);

        const newBatch: StockBatch = {
          id: generateId(),
          medicineId: medId,
          batchNumber: newRow['No Batch'],
          expiryDate: newRow['Tanggal Exp'],
          totalBaseQty: isBox ? stokNum * stripsPerBoxFinal * 10 : stokNum,
          supplierName: 'Gudang Utama',
          receivedDate: new Date().toISOString().split('T')[0],
          status: BatchStatus.ACTIVE,
        };
        addBatch(newBatch);

        showNotification(
          'success',
          `Obat "${newRow['Nama Barang']}" berhasil ditambahkan ke gudang & disinkronkan ke Kasir POS!`
        );
      } catch (err) {
        console.error('POS sync error:', err);
        showNotification('success', `Obat "${newRow['Nama Barang']}" berhasil ditambahkan ke gudang!`);
      }
    } else {
      showNotification('success', `Obat "${newRow['Nama Barang']}" berhasil ditambahkan ke gudang!`);
    }

    setShowAddModal(false);
  };

  // Baca file Excel yang dipilih
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const file = files[0];
    setModalFileName(file.name);
    setIsProcessingFile(true);

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const binaryStr = event.target?.result;
        const workbook = XLSX.read(binaryStr, { type: 'binary', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];

        const rawHeaderData: any[][] = XLSX.utils.sheet_to_json(worksheet, { header: 1 });
        if (!rawHeaderData || rawHeaderData.length === 0) {
          showNotification('error', 'File Excel kosong.');
          setIsProcessingFile(false);
          return;
        }

        const detectedCols = (rawHeaderData[0] || [])
          .map((h) => String(h ?? '').trim())
          .filter(Boolean);

        if (detectedCols.length === 0) {
          showNotification('error', 'Tidak dapat menemukan header kolom pada file Excel ini.');
          setIsProcessingFile(false);
          return;
        }

        const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(worksheet);

        if (rawRows.length === 0) {
          showNotification('error', 'Tidak ada baris data yang ditemukan di dalam file.');
          setIsProcessingFile(false);
          return;
        }

        setModalDetectedColumns(detectedCols);
        setModalSelectedColumns([...detectedCols]);
        setModalParsedRows(rawRows);
        setIsProcessingFile(false);
        setShowImportModal(true);
      } catch (err: any) {
        console.error('Excel read error:', err);
        showNotification('error', `Gagal membaca file Excel: ${err.message || 'Format tidak didukung'}`);
        setIsProcessingFile(false);
      }
    };

    reader.onerror = () => {
      showNotification('error', 'Gagal membaca file dari disk.');
      setIsProcessingFile(false);
    };

    reader.readAsBinaryString(file);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleToggleModalColumn = (col: string) => {
    if (modalSelectedColumns.includes(col)) {
      if (modalSelectedColumns.length === 1) {
        showNotification('error', 'Minimal satu kolom harus dipilih!');
        return;
      }
      setModalSelectedColumns(modalSelectedColumns.filter((c) => c !== col));
    } else {
      setModalSelectedColumns([...modalSelectedColumns, col]);
    }
  };

  const handleModalSelectAll = () => {
    setModalSelectedColumns([...modalDetectedColumns]);
  };

  const handleModalDeselectAll = () => {
    if (modalDetectedColumns.length > 0) {
      setModalSelectedColumns([modalDetectedColumns[0]]);
    }
  };

  const handleConfirmImport = () => {
    if (modalParsedRows.length === 0) {
      showNotification('error', 'Tidak ada data untuk diimpor.');
      return;
    }

    if (modalSelectedColumns.length === 0) {
      showNotification('error', 'Pilih minimal satu kolom untuk ditampilkan.');
      return;
    }

    saveToStorage(
      modalParsedRows,
      modalDetectedColumns,
      modalSelectedColumns,
      modalFileName
    );

    setShowImportModal(false);
    showNotification(
      'success',
      `Berhasil mengimpor ${modalParsedRows.length} baris data gudang dengan ${modalSelectedColumns.length} kolom terpilih!`
    );
  };

  // Reset ke data contoh bawaan
  const handleResetToDefaultData = () => {
    if (confirm('Kembalikan data tabel gudang ke data sampel bawaan awal?')) {
      saveToStorage(DEFAULT_ROWS, DEFAULT_COLUMNS, DEFAULT_COLUMNS, 'Data Master Gudang (Default)');
      showNotification('success', 'Data gudang berhasil dikembalikan ke sampel default.');
    }
  };

  // Unduh contoh Template Excel Gudang
  const handleDownloadTemplate = () => {
    const templateData = [
      {
        'Nama Barang': 'Paracetamol 500mg',
        'Kategori': 'BOX',
        'Stok Fisik': 50,
        'Satuan': 'Box',
        'Stok Strip': 0,
        'Isi Strip per Box': 10,
        'Harga Modal': 32000,
        'Harga Jual': 45000,
        'Harga Jual Strip': 5000,
        'Tanggal Exp': '2027-12-31',
      },
      {
        'Nama Barang': 'Amoxicillin 500mg',
        'Kategori': 'BOX',
        'Stok Fisik': 30,
        'Satuan': 'Box',
        'Stok Strip': 0,
        'Isi Strip per Box': 10,
        'Harga Modal': 45000,
        'Harga Jual': 60000,
        'Harga Jual Strip': 6500,
        'Tanggal Exp': '2027-08-20',
      },
      {
        'Nama Barang': 'CTM 4mg (Chlorpheniramine)',
        'Kategori': 'BOX',
        'Stok Fisik': 100,
        'Satuan': 'Box',
        'Stok Strip': 0,
        'Isi Strip per Box': 10,
        'Harga Modal': 18000,
        'Harga Jual': 25000,
        'Harga Jual Strip': 3000,
        'Tanggal Exp': '2027-03-11',
      },
      {
        'Nama Barang': 'Sanmol Sirup 60ml',
        'Kategori': 'SIRUP',
        'Stok Fisik': 40,
        'Satuan': 'Botol',
        'Stok Strip': 0,
        'Isi Strip per Box': 0,
        'Harga Modal': 17000,
        'Harga Jual': 22000,
        'Harga Jual Strip': 0,
        'Tanggal Exp': '2027-04-15',
      },
      {
        'Nama Barang': 'Bioplacenton Gel 15g',
        'Kategori': 'SALEP',
        'Stok Fisik': 25,
        'Satuan': 'Tube',
        'Stok Strip': 0,
        'Isi Strip per Box': 0,
        'Harga Modal': 21000,
        'Harga Jual': 28000,
        'Harga Jual Strip': 0,
        'Tanggal Exp': '2027-06-15',
      },
      {
        'Nama Barang': 'Betadine Antiseptik 30ml',
        'Kategori': 'TETES',
        'Stok Fisik': 35,
        'Satuan': 'Botol',
        'Stok Strip': 0,
        'Isi Strip per Box': 0,
        'Harga Modal': 27000,
        'Harga Jual': 35000,
        'Harga Jual Strip': 0,
        'Tanggal Exp': '2028-01-10',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(templateData);
    worksheet['!cols'] = [
      { wch: 28 }, // Nama Barang
      { wch: 12 }, // Kategori
      { wch: 12 }, // Stok Fisik
      { wch: 10 }, // Satuan
      { wch: 12 }, // Stok Strip
      { wch: 16 }, // Isi Strip per Box
      { wch: 14 }, // Harga Modal
      { wch: 14 }, // Harga Jual
      { wch: 16 }, // Harga Jual Strip
      { wch: 14 }, // Tanggal Exp
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Data Gudang');
    XLSX.writeFile(workbook, 'template_data_gudang_apotek.xlsx');
    showNotification('success', 'Template Excel gudang berhasil diunduh.');
  };

  // Ekspor tampilan tabel saat ini ke file Excel
  const handleExportView = () => {
    if (filteredRows.length === 0) {
      showNotification('error', 'Tidak ada data untuk diekspor.');
      return;
    }

    const exportData = filteredRows.map((row, idx) => {
      const item: Record<string, any> = { 'No': idx + 1 };
      selectedColumns.forEach((col) => {
        item[col] = row[col] !== undefined && row[col] !== null ? row[col] : '-';
      });
      return item;
    });

    const worksheet = XLSX.utils.json_to_sheet(exportData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Gudang Apotek');
    XLSX.writeFile(
      workbook,
      `data_gudang_terpilih_${new Date().toISOString().split('T')[0]}.xlsx`
    );
    showNotification('success', 'Data gudang berhasil diekspor ke Excel.');
  };

  // Hitung total kuantitas stok fisik
  const stokCol = allColumns.find((c) => /stok fisik|stok|qty|jumlah|kuantitas/i.test(c));
  const totalStokCount = stokCol
    ? rows.reduce((sum, r) => sum + (parseFloat(r[stokCol]) || 0), 0)
    : rows.length;

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
          <h1>Manajemen Stok Gudang</h1>
          <p>
            Pusat data stok fisik gudang apotek. Obat kemasan <strong>Box</strong> dapat di-<strong>Buka Box</strong> menjadi <strong>Strip</strong> untuk etalase penjualan.
          </p>
        </div>
        <div className="page-header-actions" style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".xlsx, .xls, .csv"
            style={{ display: 'none' }}
          />

          {/* Tombol Database Cloud (1 DB) - Khusus Admin */}
          {isAdmin && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setShowDbModal(true)}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                borderColor: isDbConnected ? 'var(--teal-400)' : 'var(--amber-300)',
                background: isDbConnected ? 'var(--teal-50)' : '#fef3c7',
                color: isDbConnected ? 'var(--teal-900)' : '#92400e',
                fontWeight: 600,
              }}
              title={isDbConnected ? 'Database Cloud Supabase Terhubung - Data sama di semua perangkat' : 'Klik untuk hubungkan 1 Database Online'}
            >
              <span
                style={{
                  width: '8px',
                  height: '8px',
                  borderRadius: '50%',
                  background: isDbConnected ? '#22c55e' : '#f59e0b',
                  boxShadow: isDbConnected ? '0 0 6px rgba(34, 197, 94, 0.8)' : 'none',
                }}
              />
              <span>{isDbConnected ? '☁️ 1 Database Aktif' : '☁️ Hubungkan 1 Database'}</span>
            </button>
          )}

          {/* Tombol Tambah Obat Manual */}
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleOpenAddModal}
            title="Tambah data obat baru ke gudang secara manual"
            style={{ background: 'var(--teal-600)', color: '#ffffff' }}
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
              <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
            </svg>
            <span>+ Tambah Obat Manual</span>
          </button>

          {/* Tombol Import Excel */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() => fileInputRef.current?.click()}
            title="Upload file Excel (.xlsx / .xls)"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 16v1a2 2 0 002 2h8a2 2 0 002-2v-1M10 3v11M6 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Import Excel</span>
          </button>

          {/* Tombol Ekspor Excel */}
          <button
            type="button"
            className="btn btn-outline"
            onClick={handleExportView}
            title="Ekspor kolom terpilih ke Excel"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 16v1a2 2 0 002 2h8a2 2 0 002-2v-1M14 8l-4-4-4 4M10 4v12" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Ekspor</span>
          </button>

          {/* Tombol Unduh Template */}
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleDownloadTemplate}
            title="Download file contoh template Excel gudang"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M10 3v10M6 9l4 4 4-4M3 17h14" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Template</span>
          </button>

          {/* Tombol Kosongkan Gudang */}
          <button
            type="button"
            className="btn"
            style={{
              background: 'var(--red-50)',
              color: 'var(--red-600)',
              border: '1px solid var(--red-200)',
            }}
            onClick={handleOpenClearAll}
            title="Hapus seluruh data gudang agar bisa diinput sendiri dari awal"
          >
            <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M3 6h14M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2M5 6v10a2 2 0 002 2h6a2 2 0 002-2V6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            <span>Kosongkan Gudang</span>
          </button>
        </div>
      </div>

      {/* Summary Stat Cards */}
      <div className="summary-grid">
        <div className="summary-card">
          <div className="summary-card-icon teal">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <rect x="3" y="3" width="14" height="14" rx="2" />
              <line x1="3" y1="8" x2="17" y2="8" />
              <line x1="8" y1="8" x2="8" y2="17" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{rows.length}</div>
            <div className="summary-card-label">Total Item Obat</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon blue">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 4h14M3 8h14M3 12h14M3 16h14" strokeLinecap="round" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">
              {selectedColumns.length}{' '}
              <span style={{ fontSize: '0.9rem', color: 'var(--slate-500)', fontWeight: 500 }}>
                / {allColumns.length}
              </span>
            </div>
            <div className="summary-card-label">Kolom Ditampilkan</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon amber">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M10 2L3 6v8l7 4 7-4V6l-7-4z" />
              <path d="M3 6l7 4" />
              <path d="M17 6l-7 4" />
              <line x1="10" y1="10" x2="10" y2="18" />
            </svg>
          </div>
          <div>
            <div className="summary-card-value">{totalStokCount.toLocaleString('id-ID')}</div>
            <div className="summary-card-label">Total Kuantitas Fisik</div>
          </div>
        </div>

        <div className="summary-card">
          <div className="summary-card-icon green">
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M14 2H6a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V4a2 2 0 00-2-2z" />
              <path d="M14 2v4a2 2 0 002 2h4" />
            </svg>
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div
              className="summary-card-value"
              style={{ fontSize: '1rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}
              title={fileName}
            >
              {fileName || 'Default Gudang'}
            </div>
            <div className="summary-card-label">
              {lastImportedTime
                ? `Diperbarui ${new Date(lastImportedTime).toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'short',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}`
                : 'Sumber Data Aktif'}
            </div>
          </div>
        </div>
      </div>

      {/* PANEL UTAMA: PILIHAN KOLOM EXCEL YANG INGIN DITAMPILKAN DI GUDANG */}
      <div className="card" style={{ marginBottom: 'var(--sp-5)' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
          }}
        >
          <div>
            <h3 style={{ fontSize: '1.05rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--teal-600)" strokeWidth="2">
                <rect x="2" y="3" width="16" height="14" rx="2" />
                <line x1="2" y1="8" x2="18" y2="8" />
                <line x1="8" y1="8" x2="8" y2="17" />
                <line x1="14" y1="8" x2="14" y2="17" />
              </svg>
              <span>Pilihan Kolom Tabel Gudang</span>
            </h3>
            <p className="text-muted text-xs" style={{ marginTop: '2px' }}>
              Centang atau hilangkan centang kolom di bawah ini untuk mengatur kolom apa saja yang muncul pada tabel gudang.
            </p>
          </div>

          {/* Quick Buttons */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleSelectAllColumns}
            >
              Pilih Semua Kolom ({allColumns.length})
            </button>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleResetToDefaultColumns}
            >
              Reset Default
            </button>
            <button
              type="button"
              className="btn btn-outline btn-sm"
              onClick={handleResetToDefaultData}
              title="Reset kembali ke sampel data awal jika dibutuhkan"
            >
              Muat Sampel Awal
            </button>
          </div>
        </div>

        {/* Checkbox Chips List */}
        <div className="column-chips-container">
          {allColumns.map((col) => {
            const isChecked = selectedColumns.includes(col);
            return (
              <label
                key={col}
                className={`column-chip ${isChecked ? 'selected' : ''}`}
              >
                <input
                  type="checkbox"
                  checked={isChecked}
                  onChange={() => handleToggleColumn(col)}
                />
                <span>{col}</span>
              </label>
            );
          })}
        </div>
      </div>

      {/* FLOATING BULK ACTION BAR KETIKA ADA ITEM YANG DICENTANG */}
      {selectedRowIds.size > 0 && (
        <div
          style={{
            background: 'var(--slate-900)',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--sp-4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px',
            boxShadow: 'var(--shadow-lg)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span
              style={{
                background: 'var(--teal-500)',
                color: '#ffffff',
                padding: '3px 10px',
                borderRadius: 'var(--radius-full)',
                fontSize: '0.85rem',
                fontWeight: 700,
              }}
            >
              {selectedRowIds.size}
            </span>
            <span style={{ fontSize: '0.95rem', fontWeight: 500 }}>
              Barang gudang dipilih untuk tindakan massal
            </span>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              type="button"
              className="btn btn-sm"
              style={{
                background: 'rgba(255, 255, 255, 0.15)',
                color: '#ffffff',
                border: '1px solid rgba(255, 255, 255, 0.25)',
              }}
              onClick={() => setSelectedRowIds(new Set())}
            >
              Batalkan Pilihan
            </button>
            <button
              type="button"
              className="btn btn-sm"
              style={{ background: 'var(--red-600)', color: '#ffffff', fontWeight: 600 }}
              onClick={handleOpenBulkDelete}
            >
              <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 6h14M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2M5 6v10a2 2 0 002 2h6a2 2 0 002-2V6" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Hapus {selectedRowIds.size} Barang Terpilih</span>
            </button>
          </div>
        </div>
      )}

      {/* TABEL DATA GUDANG / EMPTY STATE */}
      {rows.length === 0 ? (
        /* EMPTY STATE */
        <div
          className="card"
          style={{
            padding: '60px 24px',
            textAlign: 'center',
            background: '#ffffff',
            borderRadius: 'var(--radius-lg)',
            border: '2px dashed var(--slate-300)',
            margin: 'var(--sp-4) 0',
          }}
        >
          <div
            style={{
              width: '76px',
              height: '76px',
              borderRadius: '50%',
              background: 'var(--teal-50)',
              color: 'var(--teal-600)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto var(--sp-4)',
            }}
          >
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>

          <h2 style={{ fontSize: '1.4rem', fontWeight: 700, color: 'var(--slate-800)', marginBottom: '8px' }}>
            Data Gudang Apotek Masih Kosong
          </h2>
          <p
            style={{
              color: 'var(--slate-500)',
              maxWidth: '540px',
              margin: '0 auto var(--sp-6)',
              fontSize: '0.95rem',
              lineHeight: 1.5,
            }}
          >
            Data gudang telah bersih! Sekarang Anda dapat menginput sendiri data obat apotek secara manual satu per satu, atau mengimpor file Excel stok gudang Anda.
          </p>

          <div style={{ display: 'flex', gap: '12px', justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleOpenAddModal}
              style={{ padding: '10px 20px', fontSize: '0.95rem', background: 'var(--teal-600)', color: '#ffffff' }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
                <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
              </svg>
              <span>+ Tambah Obat Manual</span>
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => fileInputRef.current?.click()}
              style={{ padding: '10px 20px', fontSize: '0.95rem' }}
            >
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M4 16v1a2 2 0 002 2h8a2 2 0 002-2v-1M10 3v11M6 7l4-4 4 4" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              <span>Import File Excel</span>
            </button>

            <button
              type="button"
              className="btn btn-outline"
              onClick={handleDownloadTemplate}
              style={{ padding: '10px 20px', fontSize: '0.95rem' }}
            >
              <span>Unduh Template Excel</span>
            </button>

            <button
              type="button"
              className="btn btn-ghost"
              onClick={handleResetToDefaultData}
              style={{ padding: '10px 16px', fontSize: '0.9rem', color: 'var(--slate-500)' }}
            >
              <span>Muat Sampel Bawaan</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {/* Search Bar & Table Action Header */}
          <div
            style={{
              padding: 'var(--sp-4) var(--sp-5)',
              borderBottom: '1px solid var(--slate-200)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '12px',
            }}
          >
            <div className="search-wrapper" style={{ flex: 1, maxWidth: '420px', margin: 0 }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="9" cy="9" r="6" />
                <line x1="13.5" y1="13.5" x2="18" y2="18" strokeLinecap="round" />
              </svg>
              <input
                type="text"
                className="search-input"
                placeholder="Cari obat, kategori, kondisi..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span className="text-sm text-muted">
                Menampilkan <strong>{filteredRows.length}</strong> dari <strong>{rows.length}</strong> baris data
              </span>
              {searchQuery && (
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setSearchQuery('')}
                >
                  Hapus Filter
                </button>
              )}
            </div>
          </div>

          {/* Dynamic Table with Selected Columns & Action Column */}
          {selectedColumns.length === 0 ? (
            <div className="empty-state">
              <svg width="40" height="40" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5">
                <rect x="2" y="3" width="16" height="14" rx="2" />
                <line x1="2" y1="8" x2="18" y2="8" />
              </svg>
              <h3>Tidak ada kolom yang dipilih</h3>
              <p>Silakan centang satu atau beberapa kolom pada panel di atas untuk menampilkan data.</p>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                style={{ marginTop: '12px' }}
                onClick={handleSelectAllColumns}
              >
                Pilih Semua Kolom
              </button>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    {/* Master Checkbox Header */}
                    <th style={{ width: '40px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={isAllFilteredSelected}
                        onChange={handleToggleSelectAll}
                        title="Pilih semua baris yang tampil"
                        style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--teal-600)' }}
                      />
                    </th>
                    <th style={{ width: '44px', textAlign: 'center' }}>#</th>
                    {selectedColumns.map((col) => (
                      <th key={col} style={{ whiteSpace: 'nowrap' }}>
                        {col}
                      </th>
                    ))}
                    {/* Kolom Aksi */}
                    <th style={{ width: '130px', textAlign: 'center', whiteSpace: 'nowrap' }}>
                      Aksi
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.length === 0 ? (
                    <tr>
                      <td colSpan={selectedColumns.length + 3}>
                        <div className="empty-state" style={{ padding: 'var(--sp-8)' }}>
                          <p>Tidak ada data yang cocok dengan kata kunci &quot;{searchQuery}&quot;.</p>
                        </div>
                      </td>
                    </tr>
                  ) : (
                    filteredRows.map((row, idx) => {
                      const isSelected = selectedRowIds.has(row._rowId);
                      const isBox =
                        row['Satuan'] === 'Box' ||
                        row['Kategori'] === 'BOX' ||
                        row['Kategori'] === 'TABLET' ||
                        Boolean(row['Isi Strip per Box']);
                      const currentBoxQty = Number(row['Stok Fisik'] || 0);

                      return (
                        <tr
                          key={row._rowId || idx}
                          style={{
                            background: isSelected ? 'var(--teal-50)' : undefined,
                            transition: 'background-color 0.15s',
                          }}
                        >
                          {/* Row Checkbox */}
                          <td style={{ textAlign: 'center' }}>
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleSelectRow(row._rowId)}
                              style={{ cursor: 'pointer', width: '15px', height: '15px', accentColor: 'var(--teal-600)' }}
                            />
                          </td>

                          {/* Row Number */}
                          <td style={{ textAlign: 'center', color: 'var(--slate-400)', fontSize: '0.8rem' }}>
                            {idx + 1}
                          </td>

                          {/* Dynamic Data Columns */}
                          {selectedColumns.map((col) => {
                            const rawVal = row[col];
                            const displayVal =
                              rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== ''
                                ? String(rawVal)
                                : '-';

                            const isStok = /stok fisik/i.test(col);
                            const isStokStrip = /stok strip/i.test(col);
                            const isHargaModal = /harga modal|harga beli|^modal$/i.test(col);
                            const isHargaJual = /harga jual/i.test(col);
                            const isExp = /exp|kadaluwarsa|expired/i.test(col);
                            const isKondisi = /kondisi|status/i.test(col);

                            return (
                              <td key={col} style={{ whiteSpace: 'nowrap' }}>
                                {isStok ? (
                                  <div>
                                    <span style={{ fontWeight: 700, color: 'var(--teal-800)', fontSize: '0.95rem' }}>
                                      {displayVal} {row['Satuan'] || ''}
                                    </span>
                                    {row['Satuan'] === 'Box' && Number(row['Stok Strip'] || 0) > 0 && (
                                      <div style={{ fontSize: '0.75rem', color: 'var(--slate-500)', marginTop: '2px' }}>
                                        (+{row['Stok Strip']} Strip eceran)
                                      </div>
                                    )}
                                  </div>
                                ) : isStokStrip ? (
                                  <span style={{ fontWeight: 600, color: Number(displayVal) > 0 ? 'var(--blue-700)' : 'var(--slate-400)' }}>
                                    {displayVal !== '-' ? `${displayVal} Strip` : '-'}
                                  </span>
                                ) : isHargaModal ? (
                                  <div>
                                    <span style={{ fontWeight: 600, color: 'var(--amber-700, #b45309)' }}>
                                      {rawVal !== undefined && rawVal !== null && !isNaN(Number(rawVal))
                                        ? formatRupiah(Number(rawVal))
                                        : displayVal}
                                    </span>
                                  </div>
                                ) : isHargaJual ? (
                                  <div>
                                    <span style={{ fontWeight: 600, color: 'var(--teal-700)' }}>
                                      {rawVal && !isNaN(Number(rawVal)) ? formatRupiah(Number(rawVal)) : displayVal}
                                    </span>
                                    {row['Satuan'] === 'Box' && row['Harga Jual Strip'] ? (
                                      <div style={{ fontSize: '0.72rem', color: 'var(--slate-500)' }}>
                                        Strip: {formatRupiah(Number(row['Harga Jual Strip']))}
                                      </div>
                                    ) : null}
                                  </div>
                                ) : isExp ? (
                                  <span className="badge badge-neutral" style={{ fontSize: '0.786rem' }}>
                                    📅 {displayVal}
                                  </span>
                                ) : isKondisi ? (
                                  <span
                                    className={`badge ${
                                      /baik|aman/i.test(displayVal) ? 'badge-success' : 'badge-warning'
                                    }`}
                                  >
                                    {displayVal}
                                  </span>
                                ) : (
                                  displayVal
                                )}
                              </td>
                            );
                          })}

                          {/* Tombol Aksi: Buka Box + Hapus */}
                          <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: '6px', justifyContent: 'center', alignItems: 'center' }}>
                              {/* Tombol Buka Box jika satuan Box */}
                              {isBox && (
                                <button
                                  type="button"
                                  className="btn btn-secondary btn-sm"
                                  style={{
                                    padding: '3px 8px',
                                    fontSize: '0.786rem',
                                    display: 'inline-flex',
                                    alignItems: 'center',
                                    gap: '4px',
                                    borderColor: 'var(--teal-300)',
                                    color: 'var(--teal-800)',
                                    background: 'var(--teal-50)',
                                    fontWeight: 600,
                                  }}
                                  disabled={currentBoxQty <= 0}
                                  title={currentBoxQty <= 0 ? 'Stok box habis' : 'Buka 1 Box menjadi Strip untuk etalase'}
                                  onClick={() => handleOpenUnboxModal(row)}
                                >
                                  <span>📦 Buka Box</span>
                                </button>
                              )}

                              {/* Tombol Hapus Baris */}
                              <button
                                type="button"
                                className="btn btn-ghost btn-sm"
                                style={{ color: 'var(--red-600)', padding: '5px 8px' }}
                                title="Hapus baris barang ini dari gudang"
                                onClick={() => handleOpenDeleteSingle(row)}
                              >
                                <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                                  <path d="M3 6h14M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2M5 6v10a2 2 0 002 2h6a2 2 0 002-2V6" strokeLinecap="round" strokeLinejoin="round" />
                                  <line x1="8" y1="10" x2="8" y2="14" strokeLinecap="round" />
                                  <line x1="12" y1="10" x2="12" y2="14" strokeLinecap="round" />
                                </svg>
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          )}

          {/* Footer info */}
          <div
            style={{
              padding: 'var(--sp-3) var(--sp-5)',
              background: 'var(--slate-50)',
              borderTop: '1px solid var(--slate-200)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '10px',
              fontSize: '0.786rem',
              color: 'var(--slate-500)',
            }}
          >
            <div>
              Obat kemasan Box otomatis dikemas per <strong>Box</strong>. Gunakan tombol <strong>&quot;📦 Buka Box&quot;</strong> untuk memecah 1 Box menjadi Strip.
            </div>
            <div>
              <Link href="/inventory" style={{ color: 'var(--teal-600)', fontWeight: 600 }}>
                Buka Katalog Obat Apotek &rarr;
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL BUKA BOX (UNBOX KE STRIP)                              */}
      {/* ============================================================ */}
      {showUnboxModal && unboxTargetRow && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '500px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--teal-50)',
                    color: 'var(--teal-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}
                >
                  📦
                </div>
                <div>
                  <h2 style={{ fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>
                    Buka Box Obat (Unbox ke Strip)
                  </h2>
                  <div className="text-muted text-xs">Pecah kemasan Box menjadi Strip untuk siap jual / racik</div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => {
                  setShowUnboxModal(false);
                  setUnboxTargetRow(null);
                }}
              >
                &times;
              </button>
            </div>

            <div className="modal-body" style={{ padding: '20px 24px' }}>
              {/* Info Barang */}
              <div
                style={{
                  background: 'var(--slate-50)',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius-md)',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                <div style={{ fontWeight: 700, fontSize: '1.05rem', color: 'var(--slate-900)' }}>
                  {unboxTargetRow['Nama Barang']}
                </div>
                <div style={{ display: 'flex', gap: '16px', marginTop: '6px', fontSize: '0.857rem', color: 'var(--slate-600)', flexWrap: 'wrap' }}>
                  <div>
                    Sisa Stok Box: <strong style={{ color: 'var(--teal-700)' }}>{unboxTargetRow['Stok Fisik']} Box</strong>
                  </div>
                  <div>
                    Isi: <strong>1 Box = {unboxTargetRow['Isi Strip per Box'] || 10} Strip</strong>
                  </div>
                  <div>
                    Stok Strip Saat Ini: <strong>{unboxTargetRow['Stok Strip'] || 0} Strip</strong>
                  </div>
                </div>
              </div>

              {/* Input Jumlah Box yang dibuka */}
              <div className="form-group" style={{ marginBottom: '18px' }}>
                <label className="form-label" style={{ fontWeight: 600 }}>
                  Jumlah Box yang Ingin Dibuka
                </label>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <input
                    type="number"
                    min="1"
                    max={Number(unboxTargetRow['Stok Fisik'] || 1)}
                    className="form-input"
                    style={{ fontSize: '1.1rem', fontWeight: 700, width: '110px', textAlign: 'center' }}
                    value={unboxBoxCount}
                    onChange={(e) => setUnboxBoxCount(Math.max(1, parseInt(e.target.value, 10) || 1))}
                    autoFocus
                  />
                  <span style={{ fontSize: '0.95rem', fontWeight: 600, color: 'var(--slate-700)' }}>
                    Box
                  </span>
                  <div style={{ display: 'flex', gap: '6px', marginLeft: 'auto' }}>
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setUnboxBoxCount(1)}
                    >
                      1 Box
                    </button>
                    {Number(unboxTargetRow['Stok Fisik'] || 0) >= 5 && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setUnboxBoxCount(5)}
                      >
                        5 Box
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      onClick={() => setUnboxBoxCount(Number(unboxTargetRow['Stok Fisik'] || 1))}
                    >
                      Semua
                    </button>
                  </div>
                </div>
              </div>

              {/* Live Calculation Preview */}
              {(() => {
                const currentBox = Number(unboxTargetRow['Stok Fisik'] || 0);
                const stripsPerBox = Number(unboxTargetRow['Isi Strip per Box'] || 10);
                const currentStrip = Number(unboxTargetRow['Stok Strip'] || 0);
                const addedStrips = unboxBoxCount * stripsPerBox;
                const remainingBox = currentBox - unboxBoxCount;
                const totalNewStrip = currentStrip + addedStrips;

                return (
                  <div
                    style={{
                      background: remainingBox < 0 ? 'var(--red-50)' : 'var(--teal-50)',
                      border: `1px solid ${remainingBox < 0 ? 'var(--red-200)' : 'var(--teal-200)'}`,
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 16px',
                    }}
                  >
                    <div
                      style={{
                        fontWeight: 600,
                        fontSize: '0.857rem',
                        color: remainingBox < 0 ? 'var(--red-800)' : 'var(--teal-900)',
                        marginBottom: '6px',
                      }}
                    >
                      Hasil Perubahan Stok Setelah Dibuka:
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
                      <div style={{ fontSize: '0.9rem' }}>
                        Stok Box: <strong>{currentBox}</strong> ➔{' '}
                        <strong style={{ color: remainingBox < 0 ? 'var(--red-600)' : 'var(--teal-700)' }}>
                          {remainingBox} Box
                        </strong>{' '}
                        <span style={{ color: 'var(--red-600)', fontSize: '0.8rem' }}>(-{unboxBoxCount} Box)</span>
                      </div>
                      <div style={{ fontSize: '0.9rem' }}>
                        Stok Strip: <strong>{currentStrip}</strong> ➔{' '}
                        <strong style={{ color: 'var(--teal-700)' }}>
                          {totalNewStrip} Strip
                        </strong>{' '}
                        <span style={{ color: 'var(--green-600)', fontSize: '0.8rem' }}>(+{addedStrips} Strip)</span>
                      </div>
                    </div>
                    {remainingBox < 0 && (
                      <div style={{ color: 'var(--red-600)', fontSize: '0.8rem', marginTop: '6px', fontWeight: 600 }}>
                        ⚠️ Jumlah box melebihi stok yang tersedia!
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowUnboxModal(false);
                  setUnboxTargetRow(null);
                }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn btn-primary"
                style={{ background: 'var(--teal-600)', color: '#ffffff' }}
                disabled={unboxBoxCount > Number(unboxTargetRow['Stok Fisik'] || 0) || unboxBoxCount <= 0}
                onClick={handleConfirmUnbox}
              >
                Konfirmasi Buka {unboxBoxCount} Box
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL KONFIRMASI HAPUS                                       */}
      {/* ============================================================ */}
      {showDeleteModal && deleteTarget && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '480px' }}>
            <div className="modal-header" style={{ borderBottom: 'none', paddingBottom: 0 }}>
              <div
                style={{
                  width: '46px',
                  height: '46px',
                  borderRadius: '50%',
                  background: 'var(--red-100)',
                  color: 'var(--red-600)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginBottom: '10px',
                }}
              >
                <svg width="24" height="24" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M3 6h14M8 6V4a2 2 0 012-2h0a2 2 0 012 2v2M5 6v10a2 2 0 002 2h6a2 2 0 002-2V6" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="10" y1="11" x2="10" y2="15" strokeLinecap="round" />
                  <line x1="14" y1="11" x2="14" y2="15" strokeLinecap="round" />
                </svg>
              </div>
            </div>

            <div style={{ padding: '0 var(--sp-6)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--slate-900)', marginBottom: '8px' }}>
                {deleteTarget.type === 'single'
                  ? 'Hapus Barang dari Gudang?'
                  : deleteTarget.type === 'bulk'
                  ? `Hapus ${selectedRowIds.size} Barang Terpilih?`
                  : 'Kosongkan Seluruh Data Gudang?'}
              </h2>
              <p style={{ color: 'var(--slate-600)', fontSize: '0.9rem', lineHeight: 1.5 }}>
                {deleteTarget.type === 'single' ? (
                  <>
                    Apakah Anda yakin ingin menghapus data <strong>{deleteTarget.rowName}</strong> dari gudang apotek? Tindakan ini tidak dapat dibatalkan.
                  </>
                ) : deleteTarget.type === 'bulk' ? (
                  <>
                    Apakah Anda yakin ingin menghapus <strong>{selectedRowIds.size} barang</strong> yang dipilih? Data yang terhapus tidak dapat dikembalikan.
                  </>
                ) : (
                  <>
                    <strong>PERHATIAN:</strong> Seluruh <strong>{rows.length} data barang</strong> di gudang akan dihapus secara permanen sehingga Anda dapat mulai menginput data Anda sendiri secara mandiri.
                    <br /><br />
                    <em>Catatan: Anda tetap dapat memuat kembali data sampel bawaan kapan saja melalui tombol &quot;Muat Sampel Awal&quot;.</em>
                  </>
                )}
              </p>
            </div>

            <div className="modal-footer" style={{ marginTop: '20px', display: 'flex', gap: '10px', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  setShowDeleteModal(false);
                  setDeleteTarget(null);
                }}
              >
                Batal
              </button>
              <button
                type="button"
                className="btn"
                style={{ background: 'var(--red-600)', color: '#ffffff', fontWeight: 600 }}
                onClick={handleConfirmDelete}
              >
                {deleteTarget.type === 'all'
                  ? 'Ya, Kosongkan Semua'
                  : deleteTarget.type === 'bulk'
                  ? `Ya, Hapus (${selectedRowIds.size})`
                  : 'Ya, Hapus Barang'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL INPUT TAMBAH DATA OBAT SECARA MANUAL                   */}
      {/* ============================================================ */}
      {showAddModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px', maxHeight: '90vh', overflowY: 'auto' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                <div
                  style={{
                    width: '38px',
                    height: '38px',
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--teal-50)',
                    color: 'var(--teal-600)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.2">
                    <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
                    <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
                  </svg>
                </div>
                <div>
                  <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>Tambah Data Obat ke Gudang</h2>
                  <div className="text-muted text-xs">Masukkan data obat ke dalam inventori gudang secara mandiri</div>
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowAddModal(false)}
              >
                &times;
              </button>
            </div>

            <form onSubmit={handleSaveManualMedicine}>
              <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                {/* Row 1: Nama Barang & Kategori */}
                <div className="gudang-form-row-2col">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      Nama Barang / Obat <span style={{ color: 'var(--red-500)' }}>*</span>
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Paracetamol 500mg, Sanmol Sirup"
                      value={addForm.namaBarang}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, namaBarang: e.target.value }))}
                      required
                      autoFocus
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Kategori Obat</label>
                    <select
                      className="form-input"
                      value={addForm.kategori}
                      onChange={(e) => {
                        const newCat = e.target.value;
                        const isBox = newCat === 'BOX' || newCat === 'TABLET';
                        setAddForm((prev) => ({
                          ...prev,
                          kategori: newCat,
                          satuan: isBox
                            ? 'Box'
                            : newCat === 'SIRUP'
                            ? 'Botol'
                            : newCat === 'SALEP'
                            ? 'Tube'
                            : newCat === 'TETES'
                            ? 'Botol'
                            : 'Pcs',
                        }));
                      }}
                    >
                      <option value="BOX">BOX</option>
                      <option value="SIRUP">SIRUP</option>
                      <option value="SALEP">SALEP</option>
                      <option value="KAPSUL">KAPSUL</option>
                      <option value="TETES">TETES</option>
                      <option value="INJEKSI">INJEKSI</option>
                      <option value="ALKES">ALKES</option>
                      <option value="LAINNYA">LAINNYA</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Satuan & Pengaturan Box / Strip */}
                {addForm.kategori === 'BOX' || addForm.kategori === 'TABLET' ? (
                  <div
                    style={{
                      background: 'var(--teal-50)',
                      border: '1px solid var(--teal-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 16px',
                    }}
                  >
                    <div className="gudang-form-row-equal">
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, color: 'var(--teal-900)' }}>
                          Satuan Kemasan Box
                        </label>
                        <div
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            padding: '8px 12px',
                            background: '#ffffff',
                            border: '1px solid var(--teal-400)',
                            borderRadius: 'var(--radius-sm)',
                            fontWeight: 700,
                            color: 'var(--teal-800)',
                          }}
                        >
                          <span>📦 Box</span>
                          <span style={{ fontSize: '0.786rem', color: 'var(--slate-500)', fontWeight: 400, marginLeft: 'auto' }}>
                            (Dapat di-unbox ke Strip)
                          </span>
                        </div>
                      </div>

                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" style={{ fontWeight: 600, color: 'var(--teal-900)' }}>
                          Isi Strip per Box <span style={{ color: 'var(--red-500)' }}>*</span>
                        </label>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <input
                            type="number"
                            min="1"
                            className="form-input"
                            placeholder="10"
                            value={addForm.isiStripPerBox}
                            onChange={(e) =>
                              setAddForm((prev) => ({
                                ...prev,
                                isiStripPerBox: e.target.value,
                              }))
                            }
                            required
                          />
                          <span style={{ fontSize: '0.857rem', color: 'var(--slate-600)', whiteSpace: 'nowrap' }}>
                            Strip / Box
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">Satuan Barang</label>
                    <input
                      type="text"
                      list="satuan-gudang-options-manual"
                      className="form-input"
                      placeholder="Pilih atau ketik satuan (Botol, Tube, Pcs, dll.)..."
                      value={addForm.satuan}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, satuan: e.target.value }))}
                      required
                    />
                    <datalist id="satuan-gudang-options-manual">
                      <option value="Botol" />
                      <option value="Tube" />
                      <option value="Pcs" />
                      <option value="Kapsul" />
                      <option value="Ampul" />
                      <option value="Vial" />
                      <option value="Sachet" />
                      <option value="Box" />
                    </datalist>
                  </div>
                )}

                {/* Row 3: Stok Fisik & Tanggal Kadaluarsa */}
                <div className="gudang-form-row-equal">
                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      {addForm.kategori === 'BOX' || addForm.kategori === 'TABLET'
                        ? 'Stok Fisik (Box)'
                        : 'Stok Fisik'}{' '}
                      <span style={{ color: 'var(--red-500)' }}>*</span>
                    </label>
                    <input
                      type="number"
                      min="0"
                      className="form-input"
                      placeholder={
                        addForm.kategori === 'BOX' || addForm.kategori === 'TABLET'
                          ? 'e.g. 20'
                          : 'e.g. 50'
                      }
                      value={addForm.stokFisik}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, stokFisik: e.target.value }))}
                      required
                    />
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <label className="form-label">
                      Tanggal Kadaluarsa (Exp Date) <span style={{ color: 'var(--red-500)' }}>*</span>
                    </label>
                    <input
                      type="date"
                      className="form-input"
                      value={addForm.tanggalExp}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, tanggalExp: e.target.value }))}
                      required
                    />
                  </div>
                </div>

                {/* Row 4: Pengaturan Harga Bebas & Mandiri */}
                <div
                  style={{
                    background: 'var(--slate-50)',
                    border: '1px solid var(--slate-200)',
                    borderRadius: 'var(--radius-md)',
                    padding: '14px 16px',
                  }}
                >
                  <div style={{ marginBottom: '10px' }}>
                    <span style={{ fontSize: '0.857rem', fontWeight: 700, color: 'var(--slate-700)' }}>
                      💰 Pengaturan Harga (Input Bebas &amp; Tidak Saling Terkait)
                    </span>
                  </div>

                  <div className={addForm.kategori === 'BOX' || addForm.kategori === 'TABLET' ? 'gudang-form-row-3col' : 'gudang-form-row-equal'}>
                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">
                        {addForm.kategori === 'BOX' || addForm.kategori === 'TABLET'
                          ? 'Harga Modal per Box (Rp)'
                          : 'Harga Modal (Rp)'}{' '}
                        <span style={{ color: 'var(--red-500)' }}>*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        placeholder="e.g. 35000"
                        value={addForm.hargaModal}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, hargaModal: e.target.value }))}
                        required
                      />
                    </div>

                    <div className="form-group" style={{ margin: 0 }}>
                      <label className="form-label">
                        {addForm.kategori === 'BOX' || addForm.kategori === 'TABLET'
                          ? 'Harga Jual per Box (Rp)'
                          : 'Harga Jual Barang (Rp)'}{' '}
                        <span style={{ color: 'var(--red-500)' }}>*</span>
                      </label>
                      <input
                        type="number"
                        min="0"
                        className="form-input"
                        placeholder="e.g. 50000"
                        value={addForm.hargaJual}
                        onChange={(e) => setAddForm((prev) => ({ ...prev, hargaJual: e.target.value }))}
                        required
                      />
                    </div>

                    {(addForm.kategori === 'BOX' || addForm.kategori === 'TABLET') && (
                      <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label">Harga Jual per Strip (Rp)</label>
                        <input
                          type="number"
                          min="0"
                          className="form-input"
                          placeholder="e.g. 5000"
                          value={addForm.hargaJualStrip}
                          onChange={(e) => setAddForm((prev) => ({ ...prev, hargaJualStrip: e.target.value }))}
                        />
                      </div>
                    )}
                  </div>
                </div>

                {/* Section: Sinkronisasi ke POS / Kasir */}
                <div
                  style={{
                    background: 'var(--slate-50)',
                    border: '1px solid var(--slate-200)',
                    borderRadius: 'var(--radius-md)',
                    padding: '12px 16px',
                  }}
                >
                  <label
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                      cursor: 'pointer',
                      fontWeight: 600,
                      color: 'var(--slate-800)',
                    }}
                  >
                    <input
                      type="checkbox"
                      checked={addForm.syncToPos}
                      onChange={(e) => setAddForm((prev) => ({ ...prev, syncToPos: e.target.checked }))}
                      style={{ width: '16px', height: '16px', accentColor: 'var(--teal-600)', cursor: 'pointer' }}
                    />
                    <span>Sinkronkan juga ke Katalog Obat &amp; Kasir POS</span>
                  </label>
                  <p className="text-muted text-xs" style={{ margin: '4px 0 0 26px' }}>
                    Obat akan otomatis terdaftar di Katalog Obat dan kasir dapat langsung menjualnya (tersedia pilihan jual per Box maupun per Strip).
                  </p>
                </div>

                {/* Extra fields from imported columns if any */}
                {Object.keys(addForm.extraFields).length > 0 && (
                  <div
                    style={{
                      background: 'var(--slate-50)',
                      border: '1px solid var(--slate-200)',
                      borderRadius: 'var(--radius-md)',
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ fontSize: '0.857rem', fontWeight: 600, color: 'var(--slate-700)', marginBottom: '10px' }}>
                      Kolom Tambahan dari File Excel yang Aktif:
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                      {Object.keys(addForm.extraFields).map((extraKey) => (
                        <div key={extraKey}>
                          <label className="form-label" style={{ fontSize: '0.8rem' }}>
                            {extraKey}
                          </label>
                          <input
                            type="text"
                            className="form-input"
                            placeholder={`Isi ${extraKey}...`}
                            value={addForm.extraFields[extraKey]}
                            onChange={(e) => {
                              const val = e.target.value;
                              setAddForm((prev) => ({
                                ...prev,
                                extraFields: { ...prev.extraFields, [extraKey]: val },
                              }));
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              <div className="modal-footer" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowAddModal(false)}
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="btn btn-primary"
                  style={{ background: 'var(--teal-600)', color: '#ffffff' }}
                >
                  Simpan Obat ke Gudang
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL IMPORT FILE EXCEL DENGAN PILIHAN KOLOM                 */}
      {/* ============================================================ */}
      {showImportModal && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div>
                <h2>Import File Excel ke Gudang</h2>
                <div className="text-muted text-xs" style={{ marginTop: '2px' }}>
                  File: <strong>{modalFileName}</strong> ({modalParsedRows.length} baris terdeteksi)
                </div>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowImportModal(false)}
              >
                &times;
              </button>
            </div>

            <div className="modal-body">
              <div
                style={{
                  background: 'var(--teal-50)',
                  border: '1px solid var(--teal-200)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px 16px',
                  marginBottom: '16px',
                  fontSize: '0.857rem',
                  color: 'var(--teal-800)',
                }}
              >
                <strong>💡 Pilih Kolom yang Ingin Ditampilkan:</strong>
                <p style={{ marginTop: '4px' }}>
                  Sistem menemukan <strong>{modalDetectedColumns.length} kolom</strong> pada file Excel Anda.
                  Pilih kolom mana saja yang ingin dimunculkan pada tabel gudang. Pilihan ini juga dapat Anda ubah kapan saja di halaman gudang.
                </p>
              </div>

              {/* Action Buttons in Modal */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                <span className="text-sm" style={{ fontWeight: 600 }}>
                  Daftar Kolom ({modalSelectedColumns.length}/{modalDetectedColumns.length} dipilih):
                </span>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={handleModalSelectAll}
                  >
                    Pilih Semua
                  </button>
                  <button
                    type="button"
                    className="btn btn-outline btn-sm"
                    onClick={handleModalDeselectAll}
                  >
                    Hanya Kolom Pertama
                  </button>
                </div>
              </div>

              {/* Checkboxes List in Modal */}
              <div
                style={{
                  maxHeight: '260px',
                  overflowY: 'auto',
                  border: '1px solid var(--slate-200)',
                  borderRadius: 'var(--radius-sm)',
                  padding: '12px',
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                  gap: '8px',
                  background: 'white',
                }}
              >
                {modalDetectedColumns.map((col) => {
                  const checked = modalSelectedColumns.includes(col);
                  return (
                    <label
                      key={col}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '8px',
                        padding: '6px 10px',
                        borderRadius: '6px',
                        fontSize: '0.857rem',
                        cursor: 'pointer',
                        border: checked ? '1px solid var(--teal-500)' : '1px solid var(--slate-200)',
                        background: checked ? 'var(--teal-50)' : 'var(--slate-50)',
                        color: checked ? 'var(--teal-900)' : 'var(--slate-700)',
                        fontWeight: checked ? 600 : 400,
                      }}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => handleToggleModalColumn(col)}
                        style={{ accentColor: 'var(--teal-600)' }}
                      />
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {col}
                      </span>
                    </label>
                  );
                })}
              </div>

              {/* Sample Data Preview */}
              <div style={{ marginTop: '16px' }}>
                <div className="text-xs text-muted" style={{ marginBottom: '6px' }}>
                  Preview Contoh Baris 1:
                </div>
                <div
                  style={{
                    background: 'var(--slate-100)',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '0.786rem',
                    overflowX: 'auto',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {modalSelectedColumns.map((col) => (
                    <span key={col} style={{ marginRight: '16px' }}>
                      <strong>{col}:</strong> {String(modalParsedRows[0]?.[col] ?? '-')}
                    </span>
                  ))}
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
                disabled={modalSelectedColumns.length === 0}
              >
                Terapkan &amp; Tampilkan di Gudang ({modalParsedRows.length} Baris)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Konfigurasi Database Supabase (Khusus Admin) */}
      {isAdmin && (
        <DatabaseConfigModal
          isOpen={showDbModal}
          onClose={() => {
            setShowDbModal(false);
            setIsDbConnected(isSupabaseReady());
            loadData();
          }}
        />
      )}
    </div>
  );
}
