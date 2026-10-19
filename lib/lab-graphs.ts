import { calcBSolenoid, COIL_R, SOLENOID } from '@/lib/physics';
import type { LabReading } from '@/lib/lab-activity';

// What the summary's graphs are drawn from: the values a visit kept, put the
// way the worksheet asks for them. Part 1 is the field at the middle of the
// single coils against their number of turns, with a straight line through
// the origin and μ0 from its slope; part 2 is the solenoid's field along its
// axis against the theory curve.

/** μ0 as the lab handout gives it, which the worksheet's % error is taken against. */
export const MU0_HANDOUT = 1.2566e-6;

export type CoilPoint = { n: number; I: number; bTheory: number; bMeasured: number };

export type CoilPart = {
  /** Coils with a measured value, by number of turns. */
  points: CoilPoint[];
  /** Turns of the coils that were read without a value from the sensor. */
  unmeasured: number[];
  /** Whether every point was taken at the same current, so that B against n is one line. */
  oneCurrent: boolean;
  /** The line B = slope × n through the origin, fitted to the measured values (mT per turn). Null with no point. */
  slope: number | null;
  /** μ0 from the fit, in H/m, and how far it is from the handout's value, in %. Null with no point. */
  mu0: number | null;
  errorPercent: number | null;
};

const turnsOf = (instrument: string): number | null => {
  const match = /(\d+)\s*รอบ/.exec(instrument);
  return match ? Number(match[1]) : null;
};

/** Part 1 of the lab: the single coils, read at their middle (no probe position). */
export function coilPart(readings: LabReading[]): CoilPart {
  const points: CoilPoint[] = [];
  const unmeasured: number[] = [];
  for (const r of readings) {
    if (r.zCm !== null) continue;
    const n = turnsOf(r.instrument);
    if (n === null) continue;
    if (r.bMeasured === null) unmeasured.push(n);
    else points.push({ n, I: r.I, bTheory: r.bTheory, bMeasured: r.bMeasured });
  }
  points.sort((a, b) => a.n - b.n);
  unmeasured.sort((a, b) => a - b);
  const oneCurrent = points.every((p) => p.I === points[0]?.I);

  // Least squares through the origin. For the slope of B against n; and for
  // μ0, against x = nI / 2R (in mT per H/m), which holds whatever the current:
  // B0 = μ0 n I / 2R.
  const through = (xs: number[], ys: number[]) => {
    const sxx = xs.reduce((s, x) => s + x * x, 0);
    return sxx === 0 ? null : xs.reduce((s, x, i) => s + x * ys[i], 0) / sxx;
  };
  const ys = points.map((p) => p.bMeasured);
  const slope = points.length ? through(points.map((p) => p.n), ys) : null;
  const mu0 = points.length ? through(points.map((p) => (p.n * p.I / (2 * COIL_R)) * 1e3), ys) : null;
  return {
    points, unmeasured, oneCurrent, slope, mu0,
    errorPercent: mu0 === null ? null : ((mu0 - MU0_HANDOUT) / MU0_HANDOUT) * 100,
  };
}

export type SolenoidPoint = { zCm: number; bTheory: number; bMeasured: number };

export type SolenoidPart = {
  /** Probe positions with a measured value, along the axis. */
  points: SolenoidPoint[];
  /** Positions read without a value from the sensor. */
  unmeasured: number[];
  /** The current the theory curve is drawn for: the one of the latest point. Null with no reading. */
  I: number | null;
  /** Whether the points were taken at more than one current, so that one curve does not fit them all. */
  mixedCurrents: boolean;
  /** The theory curve, every quarter of a centimetre from -10 to +10 cm. */
  curve: Array<{ zCm: number; b: number }>;
};

export const Z_MIN_CM = -10;
export const Z_MAX_CM = 10;
/** Where the winding ends, in cm from its middle. */
export const SOLENOID_END_CM = (SOLENOID.L / 2) * 100;

/** Part 2 of the lab: the solenoid, read at each probe position. */
export function solenoidPart(readings: LabReading[]): SolenoidPart {
  const taken = readings.filter((r) => r.zCm !== null);
  const points: SolenoidPoint[] = [];
  const unmeasured: number[] = [];
  for (const r of taken) {
    if (r.bMeasured === null) unmeasured.push(r.zCm as number);
    else points.push({ zCm: r.zCm as number, bTheory: r.bTheory, bMeasured: r.bMeasured });
  }
  points.sort((a, b) => a.zCm - b.zCm);
  unmeasured.sort((a, b) => a - b);
  const I = taken.length ? taken[taken.length - 1].I : null;
  const curve = I === null ? [] : Array.from({ length: (Z_MAX_CM - Z_MIN_CM) * 4 + 1 }, (_, i) => {
    const zCm = Z_MIN_CM + i / 4;
    return { zCm, b: calcBSolenoid(SOLENOID.N, I, SOLENOID.L, SOLENOID.R, zCm / 100) };
  });
  return { points, unmeasured, I, mixedCurrents: taken.some((r) => r.I !== I), curve };
}

/**
 * Round numbers for an axis from 0 to at least `max`: about `count` steps of
 * 1, 2, 2.5 or 5 times a power of ten.
 */
export function niceTicks(max: number, count = 4): number[] {
  if (!(max > 0) || !Number.isFinite(max)) return [0, 1];
  const rough = max / count;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * power).find((s) => s >= rough) as number;
  const top = Math.ceil(max / step - 1e-9) * step;
  return Array.from({ length: Math.round(top / step) + 1 }, (_, i) => +(i * step).toPrecision(12));
}

/**
 * An SVG path through every point, in order of x, as a smooth curve that does
 * not overshoot: between two points it never goes above the higher or below
 * the lower (monotone cubic interpolation, Fritsch and Carlson). Points are in
 * drawing coordinates. Empty for fewer than two points.
 */
export function smoothPath(points: Array<[number, number]>): string {
  const n = points.length;
  if (n < 2) return '';
  const h = points.slice(1).map(([x], i) => x - points[i][0]);
  const slope = points.slice(1).map(([, y], i) => (y - points[i][1]) / h[i]);
  // The tangent at each point: flat at a peak or a dip, otherwise a weighted
  // mean of the slopes on either side, held small enough not to overshoot.
  const tangent = points.map((_, i) => {
    if (i === 0) return slope[0];
    if (i === n - 1) return slope[n - 2];
    const a = slope[i - 1];
    const b = slope[i];
    if (a * b <= 0) return 0;
    const wa = 2 * h[i] + h[i - 1];
    const wb = h[i] + 2 * h[i - 1];
    return (wa + wb) / (wa / a + wb / b);
  });
  const f = (v: number) => +v.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < n - 1; i++) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    const third = h[i] / 3;
    d += ` C${f(x0 + third)} ${f(y0 + third * tangent[i])} ${f(x1 - third)} ${f(y1 - third * tangent[i + 1])} ${f(x1)} ${f(y1)}`;
  }
  return d;
}
