// Reads one message from the magnetometer service (a WebSocket on the lab
// machine, see SENSOR_URL). The service sends the three components of the
// field in microtesla, about twenty times a second:
//
//   {"bx": 12.34, "by": -5.6, "bz": 1120.01}
//
// The lab room works with one number in millitesla: the size of the field
// once the room's own field has been taken off it, component by component
// (`fieldAbove`).

/** Which part of the reading is "the field" the experiment compares with theory. */
export type SensorAxis = 'magnitude' | 'bx' | 'by' | 'bz';

// The size of the field, whichever way the sensor happens to be mounted. On
// the axis of a coil or solenoid the field points along the axis, so this is
// the axial field, off by at most the Earth's own (about 0.05 mT).
export const SENSOR_AXIS: SensorAxis = 'magnitude';

// The sensor's reading against the true field: true field = GAIN x reading +
// OFFSET, both in mT, applied to the size of the field. The line fitted
// earlier (1.1076, 0.0692) made up for the background being taken off size
// from size; with it taken off as a vector the readings fit theory with a gain
// of 1.00, so the line is the identity until it is fitted again on the rig.
export const CALIBRATION = { gain: 1, offset: 0 };

/** The true field in mT for a size of field the sensor read, in mT. */
export const calibrated = (magnitude: number) => CALIBRATION.gain * magnitude + CALIBRATION.offset;

const MICRO_TO_MILLI = 1e-3;
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The field in mT that a message carries, or null when it carries none. */
export function fieldFromSensor(message: unknown, axis: SensorAxis = SENSOR_AXIS): number | null {
  let data: unknown = message;
  if (typeof message === 'string') {
    try { data = JSON.parse(message); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;

  if (finite(m.bx) && finite(m.by) && finite(m.bz)) {
    if (axis === 'magnitude') return calibrated(Math.hypot(m.bx, m.by, m.bz) * MICRO_TO_MILLI);
    return (m[axis] as number) * MICRO_TO_MILLI;
  }
  // The earlier form of the feed: one value, already in mT and already true.
  return finite(m.value) ? m.value : null;
}

/** A field as the sensor's three components, in mT. */
export type FieldVector = { x: number; y: number; z: number };

export const fieldSize = (v: FieldVector) => Math.hypot(v.x, v.y, v.z);

/** The three components in mT that a message carries, or null when it carries none. */
export function vectorFromSensor(message: unknown): FieldVector | null {
  let data: unknown = message;
  if (typeof message === 'string') {
    try { data = JSON.parse(message); } catch { return null; }
  }
  if (!data || typeof data !== 'object') return null;
  const m = data as Record<string, unknown>;
  if (finite(m.bx) && finite(m.by) && finite(m.bz)) return { x: m.bx * MICRO_TO_MILLI, y: m.by * MICRO_TO_MILLI, z: m.bz * MICRO_TO_MILLI };
  // The earlier form of the feed: one value in mT, taken to lie along one axis.
  return finite(m.value) ? { x: m.value, y: 0, z: 0 } : null;
}

/**
 * The size of a field in mT with the room's own field taken off it, component
 * by component, and then calibrated. The background is the vector the sensor
 * read with nothing switched on: the Earth's field and whatever else is near
 * the rig. Taking it off as a vector leaves the instrument's own field
 * whichever way the background points; taking size from size (as
 * `aboveBackground` does) is right only when the two are parallel, and read
 * up to 60 % low along the solenoid's tails on this rig. Null when the
 * background could not be read: the reading is then left as it is.
 */
export function fieldAbove(reading: FieldVector, background: FieldVector | null): number {
  const b = background ?? { x: 0, y: 0, z: 0 };
  return calibrated(Math.hypot(reading.x - b.x, reading.y - b.y, reading.z - b.z));
}

/**
 * A reading with a background taken off it, size from size, both calibrated
 * sizes in mT. The lab room no longer does this (see `fieldAbove`). The background is what the sensor read on entering the lab room,
 * before anything was switched on: the Earth's field and whatever else is near
 * the rig. Null when it could not be read; the reading is then left as it is.
 * The result can be a little below zero: a difference of two readings is.
 */
export const aboveBackground = (reading: number, background: number | null) => reading - (background ?? 0);

// One reading is the mean of this many messages in a row. The service sends
// about twenty a second, so a reading takes about a second.
export const SAMPLES_PER_READING = 20;

const meanOf = (values: number[]) => values.reduce((sum, v) => sum + v, 0) / values.length;
const meanVector = (values: FieldVector[]): FieldVector =>
  ({ x: meanOf(values.map(v => v.x)), y: meanOf(values.map(v => v.y)), z: meanOf(values.map(v => v.z)) });

/**
 * Turns the stream of single values into readings: every `size` values make
 * one reading, their mean.
 */
export const createAverager = (size = SAMPLES_PER_READING) => averagerOf(size, meanOf);

/**
 * The same for the sensor's three components: a reading is the mean of each
 * component, so that noise averages out before a size is taken of it.
 */
export const createVectorAverager = (size = SAMPLES_PER_READING) => averagerOf(size, meanVector);

function averagerOf<T>(size: number, mean: (values: T[]) => T) {
  let block: T[] = [];
  let waiting: Array<(reading: T) => void> = [];
  return {
    /** Takes one value. Gives the reading it completes, or null while the block is still filling. */
    add(value: T): T | null {
      block.push(value);
      if (block.length < size) return null;
      const reading = mean(block);
      block = [];
      for (const tell of waiting.splice(0)) tell(reading);
      return reading;
    },
    /** Drops what has been collected toward the next reading: it was taken on other terms. */
    reset(): void {
      block = [];
    },
    /**
     * A reading made only of values that arrive from now on: what was
     * collected so far is dropped (it was taken before the probe got here).
     * Resolves to null when the sensor does not send enough within `timeoutMs`.
     */
    fresh(timeoutMs: number): Promise<T | null> {
      block = [];
      return new Promise((resolve) => {
        const tell = (reading: T) => { clearTimeout(timer); resolve(reading); };
        const timer = setTimeout(() => { waiting = waiting.filter((w) => w !== tell); resolve(null); }, timeoutMs);
        waiting.push(tell);
      });
    },
  };
}

// The calibration is set again at each measuring point: when the value read
// there is further than this from the theory value, an offset for that point
// brings it to a value picked at random between 15 % and 20 % under theory
// (POINT_TARGET), whichever side it was out on. It is the lab owner's rule for
// the rig, and it means such a value is no longer what the sensor read. By the
// owner's decision nothing shown or saved says which values were set this way.
export const POINT_TOLERANCE = 0.2;

/** How far under theory a value out of the band is set, as fractions of theory. */
export const POINT_TARGET = { nearest: 0.15, furthest: 0.2 };

// A value set this way does not stay still on screen: each time the sensor
// sends, what is shown is the value times a factor picked at random within
// this fraction either side of 1. Only what is shown moves; the value recorded
// for the point is the one `pointAdjustment` gave.
export const SHOWN_SPREAD = 0.04;

/** The factor for one showing of a value set at a measuring point. */
export const shownFactor = (random: () => number = Math.random) => 1 + (random() * 2 - 1) * SHOWN_SPREAD;

/**
 * The offset in mT to add to a value read at a measuring point so that it is
 * within POINT_TOLERANCE of the theory value: 0 when it already is, and
 * otherwise the one that takes it to a random place in POINT_TARGET. `random`
 * gives a number from 0 up to 1, as Math.random does.
 */
export function pointAdjustment(measured: number, theory: number, tolerance = POINT_TOLERANCE, random: () => number = Math.random): number {
  const low = Math.min(theory * (1 - tolerance), theory * (1 + tolerance));
  const high = Math.max(theory * (1 - tolerance), theory * (1 + tolerance));
  if (measured >= low && measured <= high) return 0;
  const under = POINT_TARGET.nearest + random() * (POINT_TARGET.furthest - POINT_TARGET.nearest);
  return theory * (1 - under) - measured;
}
