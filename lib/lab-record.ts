import { EVENT_KINDS, type LabEvent } from '@/lib/lab-activity';

// The record of a visit as it is kept in the database (the lab_records
// collection, one document per booking) so its summary can be opened again
// from the dashboard. The record comes from the student's own browser, so it
// is checked field by field before it is stored.

/** More events than any visit makes: a two-hour round is a few hundred. */
export const MAX_EVENTS = 3000;
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
