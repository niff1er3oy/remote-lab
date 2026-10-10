import { adminDb } from '@/lib/firebase-admin';
import { cleanCurrents, cleanDisabled, type Currents } from '@/lib/instruments';

// Settings of the rig that an admin changes while the app runs, kept in one
// Firestore document: settings/rig.
const doc = () => adminDb.collection('settings').doc('rig');

// Each setting is written on its own, so what is already there is kept.
async function write(patch: Record<string, unknown>, by: string): Promise<void> {
  const stored = (await doc().get()).data() ?? {};
  await doc().set({ ...stored, ...patch, updated_by: by, updated_at: new Date().toISOString() });
}

/** The instruments an admin has closed. Empty when nothing has ever been set. */
export async function disabledInstruments(): Promise<string[]> {
  return cleanDisabled((await doc().get()).data()?.disabled_instruments);
}

export async function setDisabledInstruments(scripts: string[], by: string): Promise<void> {
  await write({ disabled_instruments: cleanDisabled(scripts) }, by);
}

/** The current of every instrument: what an admin set, the default for the rest. */
export async function instrumentCurrents(): Promise<Currents> {
  return cleanCurrents((await doc().get()).data()?.currents);
}

export async function setInstrumentCurrents(currents: Currents, by: string): Promise<void> {
  await write({ currents: cleanCurrents(currents) }, by);
}

/** Both, from one read of the document. */
export async function rigSettings(): Promise<{ disabled_instruments: string[]; currents: Currents }> {
  const stored = (await doc().get()).data();
  return { disabled_instruments: cleanDisabled(stored?.disabled_instruments), currents: cleanCurrents(stored?.currents) };
}
