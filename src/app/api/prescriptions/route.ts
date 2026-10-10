import { NextResponse } from 'next/server';
import { readServerDB, writeServerDB } from '@/lib/server-store';
import { MutationType } from '@/database/schema';

// GET: Ambil pengeluaran resep
export async function GET() {
  const db = readServerDB();
  const prescriptions = db.mutations.filter(
    (m) => m.mutationType === MutationType.PENGELUARAN_RESEP
  );
  return NextResponse.json({ success: true, data: prescriptions });
}

// POST: Pengeluaran resep baru
export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { medicineId, batchId, baseQty, unitUsed, referenceNumber, notes, diagnosis, action, paidAmount } = body;

    const db = readServerDB();

    // Kurangi stok batch
    if (batchId) {
      const bIdx = db.batches.findIndex((b) => b.id === batchId);
      if (bIdx > -1) {
        db.batches[bIdx].totalBaseQty = Math.max(0, db.batches[bIdx].totalBaseQty - baseQty);
      }
    }

    const mutation = {
      id: 'mut-' + Date.now().toString(36),
      medicineId,
      batchId: batchId || null,
      mutationType: MutationType.PENGELUARAN_RESEP,
      qtyChange: -baseQty,
      unitUsed,
      referenceNumber: referenceNumber || `RXP-${Date.now().toString().slice(-6)}`,
      notes: notes || 'Pengeluaran resep dokter',
      diagnosis: diagnosis || undefined,
      action: action || undefined,
      paidAmount: paidAmount !== undefined ? Number(paidAmount) : undefined,
      createdAt: new Date().toISOString(),
    };

    db.mutations.push(mutation);
    writeServerDB(db);

    return NextResponse.json({ success: true, data: mutation }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ success: false, error: 'Gagal memproses pengeluaran resep' }, { status: 400 });
  }
}
