// Creates what the app needs in Firestore before it can be used, on a new
// Firebase project or an emptied database. Firestore has no schema and no
// "create table": a collection exists once it holds a document. So this
// writes the two documents the app reads but never creates by itself, and
// prints the shape of the collections the app fills as it runs.
//
//   node scripts/setup-firestore.mjs            show what would be written, write nothing
//   node scripts/setup-firestore.mjs --apply    write it
//
// It connects with the same service account the web app uses, from .env
// (FIREBASE_ADMIN_PROJECT_ID, FIREBASE_ADMIN_CLIENT_EMAIL,
// FIREBASE_ADMIN_PRIVATE_KEY). It is safe to run again: a document that is
// already there keeps every value it has, and only fields it lacks are added.
//
// The indexes the app's queries need are in firestore.indexes.json and the
// access rules in firestore.rules; both are put in place with the Firebase CLI:
//
//   npx firebase-tools deploy --only firestore --project <project id>
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// ── What the app reads and never creates ─────────────────────────────────────

/** Documents to create, by path. Fields already stored are left as they are. */
export const SEED = {
  // The experiment catalog. The document's ID is the lab's code; the booking
  // calendar lists the labs that are active, by code.
  'labs/LAB8': {
    code: 'LAB8',
    name_th: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต',
    name_en: 'Magnetic Field and the Biot-Savart Law',
    description_th: 'วัดสนามแม่เหล็กที่กึ่งกลางขดลวดเดี่ยว 1, 2 และ 3 รอบ และตามแนวแกนของโซลีนอยด์ แล้วเทียบกับค่าจากกฎของไบโอต-ซาวัต',
    duration_minutes: 120,
    is_active: true,
  },
  // What an admin changes from the admin page. The app works without this
  // document (it falls back to the same values, see lib/instruments.ts); it is
  // created here so that the settings can be seen and edited from the start.
  'settings/rig': {
    // The current each instrument's circuit is set to, in amperes, by the script that starts it.
    currents: { 'coil_1.py': 5, 'coil_2.py': 5, 'coil_3.py': 5, 'sole.py': 0.3 },
    // The scripts of the instruments closed to students. None to begin with.
    disabled_instruments: [],
  },
};

// ── What the app creates as it runs (nothing is written for these) ───────────

export const RUNTIME_COLLECTIONS = {
  'bookings/{auto id}': {
    made_by: 'POST /api/bookings (a student books a round), POST /api/admin/blocks (an admin closes a stretch of time)',
    fields: {
      user_id: 'string: Firebase Auth uid of the owner',
      lab_id: 'string: the lab document ID, e.g. "LAB8"',
      start_time: 'timestamp',
      end_time: 'timestamp',
      status: 'string: pending | confirmed | in_progress | completed | cancelled',
      created_at: 'timestamp',
      'blocked?': 'boolean: true for a stretch an admin closed to booking',
      'note?': 'string: the admin\'s reason for a blocked stretch',
      'has_record?': 'boolean: a lab_records document exists for this round',
      'cancelled_by? / ended_by?': 'string: uid of the admin who cancelled or ended it',
      'notified_can_enter_at? / notified_starting_soon_at?': 'timestamp: reminder already sent',
    },
  },
  'sessions/{booking id}': {
    made_by: 'PATCH /api/bookings/[id] { action: "start" }, when the student enters the lab room',
    fields: {
      user_id: 'string', lab_id: 'string', booking_id: 'string',
      start_time: 'timestamp', 'end_time?': 'timestamp', 'duration_seconds?': 'number',
      status: 'string: active | completed',
    },
  },
  'lab_records/{booking id}': {
    made_by: 'POST /api/lab/record, during and at the end of a visit to the lab room',
    fields: {
      user_id: 'string', booking_id: 'string', lab_id: 'string',
      events: 'array of { at: number (ms), kind: string, instrument?, ok?, zCm?, I?, bTheory?, bMeasured?, detail? }, at most 3000 (lib/lab-activity.ts)',
      saved_at: 'timestamp',
    },
  },
  'notifications/{auto id}': {
    made_by: 'the booking and admin routes (booked, cancelled, can enter, starting soon, ended by an admin)',
    fields: {
      user_id: 'string', title: 'string', message: 'string',
      type: 'string: info | success | warning',
      'action_url?': 'string', is_read: 'boolean', created_at: 'timestamp',
    },
  },
};

// Users are not in Firestore: a user is a Firebase Auth record, created by
// their first Google sign-in. Admins are the emails in ADMIN_EMAILS (.env).

// ── Planning and writing ─────────────────────────────────────────────────────

/**
 * What has to be written for `db` to hold SEED: for each document, the fields
 * it lacks. A document that has them all is left out.
 */
export async function plan(db, seed = SEED) {
  const steps = [];
  for (const [docPath, wanted] of Object.entries(seed)) {
    const snap = await db.doc(docPath).get();
    const stored = snap.exists ? snap.data() ?? {} : {};
    const missing = Object.fromEntries(Object.entries(wanted).filter(([field]) => !(field in stored)));
    if (Object.keys(missing).length) steps.push({ path: docPath, exists: snap.exists, fields: missing });
  }
  return steps;
}

/** Writes the steps of a plan. Each is a merge: nothing already stored is replaced. */
export async function apply(db, steps) {
  for (const step of steps) await db.doc(step.path).set(step.fields, { merge: true });
}

// ── Running it ───────────────────────────────────────────────────────────────

// Reads KEY=value lines of a .env file into process.env, leaving alone what is
// already set. Next.js does this for the app; a plain script has to do it itself.
function loadEnv(file) {
  if (!fs.existsSync(file)) return;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/.exec(line);
    if (!match || line.trimStart().startsWith('#')) continue;
    const [, key, raw] = match;
    if (process.env[key] !== undefined) continue;
    const quoted = /^(['"])(.*)\1$/.exec(raw);
    process.env[key] = quoted ? quoted[2] : raw;
  }
}

async function connect() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  loadEnv(path.join(root, '.env.local'));
  loadEnv(path.join(root, '.env'));
  const missing = ['FIREBASE_ADMIN_PROJECT_ID', 'FIREBASE_ADMIN_CLIENT_EMAIL', 'FIREBASE_ADMIN_PRIVATE_KEY'].filter(k => !process.env[k]);
  if (missing.length) throw new Error(`not set in .env: ${missing.join(', ')}`);

  const { initializeApp, cert } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const app = initializeApp({
    credential: cert({
      projectId: process.env.FIREBASE_ADMIN_PROJECT_ID,
      clientEmail: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_ADMIN_PRIVATE_KEY.replace(/\\n/g, '\n'),
    }),
  });
  return { db: getFirestore(app), projectId: process.env.FIREBASE_ADMIN_PROJECT_ID };
}

async function main() {
  const write = process.argv.includes('--apply');
  const { db, projectId } = await connect();
  console.log(`Firestore of project ${projectId}`);

  const steps = await plan(db);
  if (!steps.length) console.log('Nothing to write: every document the app needs is already there.');
  for (const step of steps) {
    console.log(`\n${step.exists ? 'add to' : 'create'} ${step.path}`);
    for (const [field, value] of Object.entries(step.fields)) console.log(`  ${field}: ${JSON.stringify(value)}`);
  }

  if (steps.length && write) {
    await apply(db, steps);
    console.log(`\nWritten: ${steps.length} document(s).`);
  } else if (steps.length) {
    console.log('\nNothing was written. Run again with --apply to write this.');
  }

  console.log('\nCollections the app creates by itself as it is used:');
  for (const [name, { made_by, fields }] of Object.entries(RUNTIME_COLLECTIONS)) {
    console.log(`\n  ${name}\n    made by: ${made_by}`);
    for (const [field, kind] of Object.entries(fields)) console.log(`    ${field}: ${kind}`);
  }
  console.log('\nIndexes and rules: npx firebase-tools deploy --only firestore --project ' + projectId);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`setup-firestore: ${err.message}`);
    process.exit(1);
  });
}
