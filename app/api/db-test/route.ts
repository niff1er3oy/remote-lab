import { NextResponse } from 'next/server';
import { adminDb } from '@/lib/firebase-admin';

export async function GET() {
  try {
    const snap = await adminDb.collection('labs').limit(5).get();
    const labs = snap.docs.map(d => ({ code: d.data().code, name_th: d.data().name_th }));
    return NextResponse.json({ ok: true, labs });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
