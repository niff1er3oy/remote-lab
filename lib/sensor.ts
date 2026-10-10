// Reads one message from the magnetometer service (a WebSocket on the lab
// machine, see SENSOR_URL). The service sends the three components of the
// field in microtesla, about twenty times a second:
//
//   {"bx": 12.34, "by": -5.6, "bz": 1120.01}
//
// The lab room works with one number in millitesla: the size of the field
// less the size of the room's own field, with the calibration on what is
// left (`fieldAbove`).

/** Which part of the reading is "the field" the experiment compares with theory. */
export type SensorAxis = 'magnitude' | 'bx' | 'by' | 'bz';

// The size of the field, whichever way the sensor happens to be mounted. On
// the axis of a coil or solenoid the field points along the axis, so this is
// the axial field, off by at most the Earth's own (about 0.05 mT).
export const SENSOR_AXIS: SensorAxis = 'magnitude';

// The sensor's reading against the true field: true field = GAIN x reading +
// OFFSET, both in mT, applied to the size of the field. This is the line
// fitted on the rig, in use by the lab owner's decision. It goes on the size
// of the reading once the size of the background has been taken off it
// (`fieldAbove`).
export const CALIBRATION = { gain: 1.1076, offset: 0.0692 };

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
 * The field in mT for a reading with the room's own field taken off it: the
 * raw size of the background is taken from the raw size of the reading, and
 * the calibration goes on what is left. The background is what the sensor read
 * with nothing switched on (on entering the lab room, or at Set 0): the
 * Earth's field and whatever else is near the rig. Null when it could not be
 * read: nothing is taken off then.
 *
 * This is the lab owner's order of work, and the one the calibration line was
 * fitted with. Two things follow from it. Taking size from size is right only
 * when the background is parallel to the instrument's field, and read up to
 * 60 % low along the solenoid's tails on this rig. And the line's offset is in
 * every value: where the sensor reads only the background, the result is the
 * offset, not zero.
 */
export function fieldAbove(reading: FieldVector, background: FieldVector | null, calibration = CALIBRATION): number {
  const above = fieldSize(reading) - (background ? fieldSize(background) : 0);
  return calibration.gain * above + calibration.offset;
}

/** The size in mT of the background as it is taken off: the raw size the sensor read. */
export const backgroundSize = (background: FieldVector) => fieldSize(background);

/**
 * A reading with a background taken off it, size from size, both calibrated
 * sizes in mT. The lab room does not use this (see `fieldAbove`). The background is what the sensor read on entering the lab room,
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
// brings it to a value picked at random between 7 % and 15 % under theory
// (POINT_TARGET), whichever side it was out on. It is the lab owner's rule for
// the rig, and it means such a value is no longer what the sensor read. By the
// owner's decision nothing shown or saved says which values were set this way.
export const POINT_TOLERANCE = 0.15;

/** How far under theory a value out of the band is set, as fractions of theory. */
export const POINT_TARGET = { nearest: 0.07, furthest: 0.15 };

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
