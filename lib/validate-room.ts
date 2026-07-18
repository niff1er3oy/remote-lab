import { Timestamp } from 'firebase-admin/firestore';
import { adminDb } from '@/lib/firebase-admin';

const ACTIVE_STATUSES = ['confirmed', 'pending', 'in_progress'];

export interface RoomBooking {
  bookingId: string;
  roomCode: string;
  labId: string;
  userId: string;
  endTime: Date;
}

// room_code is globally unique per booking (enforced at write time in
// app/api/bookings/route.ts), so this is always a single-doc lookup —
// no composite index needed, just filter status/time window in JS.
export async function validateRoom(roomCode: string): Promise<RoomBooking | null> {
  const snap = await adminDb.collection('bookings').where('room_code', '==', roomCode).limit(1).get();
  if (snap.empty) return null;

  const doc = snap.docs[0];
  const data = doc.data();
  const now = Date.now();
  const start = (data.start_time as Timestamp).toMillis();
  const end = (data.end_time as Timestamp).toMillis();

  if (!ACTIVE_STATUSES.includes(data.status) || now < start || now > end) return null;

  return {
    bookingId: doc.id,
    roomCode: data.room_code,
    labId: data.lab_id,
    userId: data.user_id,
    endTime: new Date(end),
  };
}
