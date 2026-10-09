import { adminDb } from '@/lib/firebase-admin';
import { cleanDisabled } from '@/lib/instruments';

// Settings of the rig that an admin changes while the app runs, kept in one
// Firestore document: settings/rig.
const doc = () => adminDb.collection('settings').doc('rig');

/** The instruments an admin has closed. Empty when nothing has ever been set. */
export async function disabledInstruments(): Promise<string[]> {
  return cleanDisabled((await doc().get()).data()?.disabled_instruments);
}

export async function setDisabledInstruments(scripts: string[], by: string): Promise<void> {
  await doc().set({ disabled_instruments: cleanDisabled(scripts), updated_by: by, updated_at: new Date().toISOString() });
}
