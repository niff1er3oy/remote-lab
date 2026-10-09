import { rigState, runRigScript, SUPPLY_OFF, SUPPLY_ON } from '@/lib/rig';

// Who is in the lab room, and the power supply that follows from it. The
// supply comes on when a student enters the room and goes off when the room is
// empty. In between, a student in the room can switch it, and an admin can
// switch it either way from the admin page; a supply an admin switched off is
// not a student's to switch back on.
//
// The lab page says it is still open every HEARTBEAT_MS. A page that goes
// quiet for STALE_MS (closed without a goodbye, lost its network) is taken to
// have left.

export const HEARTBEAT_MS = 20_000;
// A hidden tab is allowed to run its timers only about once a minute.
export const STALE_MS = 90_000;
const SWEEP_MS = 10_000;
// How many times switching off is tried again when the rig does not answer.
const OFF_ATTEMPTS = 3;

type Presence = {
  /** uid -> when that page was last heard from. */
  seen: Map<string, number>;
  /** An admin switched the supply off: it stays off until an admin switches it on or someone walks in anew. */
  held: boolean;
  /** Tries left at switching off for the room having emptied. */
  offDue: number;
  timer?: ReturnType<typeof setInterval>;
};

// On globalThis for the same reason as the rig's record: one copy, however the
// bundler splits the route handlers.
const holder = globalThis as typeof globalThis & { __labPresence?: Presence };
const presence = (): Presence => (holder.__labPresence ??= { seen: new Map(), held: false, offDue: 0 });

/** Forgets everyone and stops the clock; for tests. */
export function resetPresence(): void {
  if (holder.__labPresence?.timer) clearInterval(holder.__labPresence.timer);
  holder.__labPresence = undefined;
}

export const isInRoom = (uid: string) => presence().seen.has(uid);
export const occupants = () => presence().seen.size;

function watch(p: Presence) {
  if (p.timer) return;
  p.timer = setInterval(() => { void sweep(); }, SWEEP_MS);
  p.timer.unref?.();
}

async function switchOn(): Promise<boolean> {
  if (rigState().supply === true) return true;
  try {
    await runRigScript([SUPPLY_ON]);
    return true;
  } catch (err) {
    console.error('[lab-presence] could not switch the supply on', err);
    return false;
  }
}

// Leaves nothing live: the circuit that is still on is cut first, then the
// supply. Scripts for things already off are not run again.
async function switchOff(): Promise<boolean> {
  const { circuit, supply } = rigState();
  let ok = true;
  if (circuit) {
    try {
      await runRigScript([circuit === 'sole.py' ? 'sole_b.py' : 'coil_b.py']);
    } catch (err) {
      console.error('[lab-presence] could not cut the circuit left on', err);
      ok = false;
    }
  }
  if (supply !== false) {
    try {
      await runRigScript([SUPPLY_OFF]);
    } catch (err) {
      console.error('[lab-presence] could not switch the supply off', err);
      ok = false;
    }
  }
  return ok;
}

async function offIfEmpty(p: Presence): Promise<void> {
  if (p.offDue <= 0 || p.seen.size > 0 || rigState().busy) return;
  p.offDue--;
  if (await switchOff()) p.offDue = 0;
}

/**
 * A student walked into the room: the supply comes on. `fresh` is false for a
 * page that was already open and is only being heard from again (after a
 * restart, or a long silence); that does not undo an admin's switching off.
 * Resolves to whether the supply is on.
 */
export async function enterRoom(uid: string, fresh = true): Promise<boolean> {
  const p = presence();
  p.seen.set(uid, Date.now());
  p.offDue = 0;
  watch(p);
  if (fresh) p.held = false;
  if (p.held) return rigState().supply === true;
  return switchOn();
}

/** The page is still open. */
export function stayInRoom(uid: string): void {
  presence().seen.set(uid, Date.now());
}

/** The student left. The supply goes off when that leaves the room empty. */
export async function leaveRoom(uid: string): Promise<void> {
  const p = presence();
  if (!p.seen.delete(uid) || p.seen.size > 0) return;
  p.offDue = OFF_ATTEMPTS;
  await offIfEmpty(p);
}

/** Drops whoever has gone quiet, and switches off when that empties the room. */
export async function sweep(): Promise<void> {
  const p = presence();
  const before = p.seen.size;
  const now = Date.now();
  for (const [uid, at] of p.seen) if (now - at > STALE_MS) p.seen.delete(uid);
  if (before > 0 && p.seen.size === 0) p.offDue = OFF_ATTEMPTS;
  await offIfEmpty(p);
}

export const isHeld = () => presence().held;

/**
 * A student in the room switches the supply. 'held' when an admin has switched
 * it off and it is not the student's to switch on; 'failed' when the relay did
 * not answer.
 */
export async function studentSwitch(uid: string, on: boolean): Promise<'done' | 'held' | 'failed'> {
  const p = presence();
  p.seen.set(uid, Date.now());
  p.offDue = 0;
  watch(p);
  if (on && p.held) return 'held';
  try {
    await runRigScript([on ? SUPPLY_ON : SUPPLY_OFF]);
    return 'done';
  } catch (err) {
    console.error(`[lab-presence] could not switch the supply ${on ? 'on' : 'off'}`, err);
    return 'failed';
  }
}

/** An admin switched the supply by hand; the room's own switching steps aside. */
export function adminSwitched(on: boolean): void {
  const p = presence();
  p.held = !on;
  p.offDue = 0;
}
