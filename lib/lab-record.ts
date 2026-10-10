import { EVENT_KINDS, type LabEvent } from '@/lib/lab-activity';

// The record of a visit as it is kept in the database (the lab_records
// collection, one document per booking) so its summary can be opened again
// from the dashboard. The record comes from the student's own browser, so it
// is checked field by field before it is stored.

/**
 * More events than any visit makes: a two-hour round is a few hundred. A
 * record continued each time the student comes back in the same round still
 * has to stay within it.
 */
export const MAX_EVENTS = 3000;

/**
 * What of a visit is sent to be kept: all of it, or, once it is longer than a
 * record may be, the first `max` events, with the visit's ending in the last
 * place when it has ended. `left` is how many events that leaves out.
 */
export function fitToSave(events: LabEvent[], max = MAX_EVENTS): { events: LabEvent[]; left: number } {
  if (events.length <= max) return { events, left: 0 };
  const last = events[events.length - 1];
  const kept = last.kind === 'end' ? [...events.slice(0, max - 1), last] : events.slice(0, max);
  return { events: kept, left: events.length - max };
}

/**
 * Runs saves one at a time. A save asked for while one is in flight waits for
 * it and then runs once, however many asked meanwhile: `send` reads the
 * record when it starts, so that one run carries everything they wanted kept.
 */
export function createSaveQueue() {
  let running: Promise<boolean> | null = null;
  let next: Promise<boolean> | null = null;
  const run = (send: () => Promise<boolean>): Promise<boolean> => {
    if (!running) {
      running = send().catch(() => false).finally(() => { running = null; });
      return running;
    }
    next ??= running.then(() => { next = null; return run(send); });
    return next;
  };
  return run;
}
const MAX_NAME = 80;
const MAX_DETAIL = 500;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** One event with only the fields an event has, or null when it is not one. */
function cleanEvent(raw: unknown): LabEvent | null {
  if (!raw || typeof raw !== 'object') return null;
  const e = raw as Record<string, unknown>;
  if (!finite(e.at) || typeof e.kind !== 'string' || !(EVENT_KINDS as string[]).includes(e.kind)) return null;

  const event: LabEvent = { at: e.at, kind: e.kind as LabEvent['kind'] };
  if (e.instrument !== undefined) {
    if (typeof e.instrument !== 'string') return null;
    event.instrument = e.instrument.slice(0, MAX_NAME);
  }
  if (e.ok !== undefined) {
    if (typeof e.ok !== 'boolean') return null;
    event.ok = e.ok;
  }
  for (const key of ['zCm', 'I', 'bTheory'] as const) {
    if (e[key] === undefined) continue;
    if (!finite(e[key])) return null;
    event[key] = e[key] as number;
  }
  if (e.bMeasured !== undefined) {
    if (e.bMeasured !== null && !finite(e.bMeasured)) return null;
    event.bMeasured = e.bMeasured as number | null;
  }
  if (e.detail !== undefined) {
    if (typeof e.detail !== 'string') return null;
    event.detail = e.detail.slice(0, MAX_DETAIL);
  }
  return event;
}

/**
 * The events of a visit, fit to store: null when what was sent is not a list
 * of events, is empty, or is longer than any visit could be.
 */
export function cleanEvents(raw: unknown): LabEvent[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_EVENTS) return null;
  const events: LabEvent[] = [];
  for (const item of raw) {
    const event = cleanEvent(item);
    if (!event) return null;
    events.push(event);
  }
  return events;
}
