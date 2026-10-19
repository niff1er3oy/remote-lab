import { calcBCoil, calcBSolenoid, COIL_R, SOLENOID } from '@/lib/physics';
import type { LabReading } from '@/lib/lab-activity';
import { coilPart, MU0_HANDOUT, niceTicks, smoothPath, SOLENOID_END_CM, solenoidPart } from '@/lib/lab-graphs';

const MU0 = 4 * Math.PI * 1e-7;

const coil = (n: number, bMeasured: number | null, I = 5): LabReading =>
  ({ instrument: `ขดลวดเดี่ยว ${n} รอบ`, zCm: null, I, bTheory: calcBCoil(n, I, COIL_R), bMeasured });
const probe = (zCm: number, bMeasured: number | null, I = 0.3): LabReading =>
  ({ instrument: 'โซลีนอยด์ 100 รอบ', zCm, I, bTheory: calcBSolenoid(SOLENOID.N, I, SOLENOID.L, SOLENOID.R, zCm / 100), bMeasured });

describe('coilPart — B against the number of turns', () => {
  it('gives back μ0 itself from values that are exactly the theory', () => {
    const part = coilPart([coil(1, calcBCoil(1, 5, COIL_R)), coil(2, calcBCoil(2, 5, COIL_R)), coil(3, calcBCoil(3, 5, COIL_R))]);
    expect(part.mu0).toBeCloseTo(MU0, 15);
    expect(part.slope).toBeCloseTo(calcBCoil(1, 5, COIL_R), 12);
    // 4π×10⁻⁷ against the handout's 1.2566×10⁻⁶.
    expect(part.errorPercent).toBeCloseTo(((MU0 - MU0_HANDOUT) / MU0_HANDOUT) * 100, 10);
  });

  it('fits the line through the origin by least squares', () => {
    // slope = Σ nB / Σ n² = (0.23 + 2×0.47 + 3×0.70) / 14
    const part = coilPart([coil(1, 0.23), coil(2, 0.47), coil(3, 0.70)]);
    expect(part.slope).toBeCloseTo((0.23 + 0.94 + 2.1) / 14, 12);
    // μ0 = slope × 2R / I, with B in mT.
    expect(part.mu0).toBeCloseTo(((0.23 + 0.94 + 2.1) / 14) * 1e-3 * 2 * COIL_R / 5, 15);
    expect(part.errorPercent).toBeCloseTo((part.mu0! / MU0_HANDOUT - 1) * 100, 10);
  });

  it('works out μ0 from each point\'s own current when they differ', () => {
    const part = coilPart([coil(1, calcBCoil(1, 4, COIL_R), 4), coil(2, calcBCoil(2, 5, COIL_R), 5)]);
    expect(part.oneCurrent).toBe(false);
    expect(part.mu0).toBeCloseTo(MU0, 15);
  });

  it('puts the coils in order of turns, and leaves out a reading without a sensor value', () => {
    const part = coilPart([coil(3, 0.7), coil(1, 0.23), coil(2, null)]);
    expect(part.points.map((p) => p.n)).toEqual([1, 3]);
    expect(part.unmeasured).toEqual([2]);
  });

  it('takes no solenoid positions, and has no line with no coil measured', () => {
    const part = coilPart([probe(0, 0.4), coil(1, null)]);
    expect(part.points).toEqual([]);
    expect([part.slope, part.mu0, part.errorPercent]).toEqual([null, null, null]);
  });
});

describe('solenoidPart — B along the axis', () => {
  it('keeps the measured positions in order along the axis, and those without a value apart', () => {
    const part = solenoidPart([probe(4, 0.2), probe(-2, 0.37), probe(0, 0.41), probe(7, null), coil(1, 0.2)]);
    expect(part.points.map((p) => p.zCm)).toEqual([-2, 0, 4]);
    expect(part.unmeasured).toEqual([7]);
  });

  it('draws the theory curve from -10 to +10 cm for the current the points were taken at', () => {
    const part = solenoidPart([probe(0, 0.41, 0.45)]);
    expect(part.I).toBe(0.45);
    expect(part.curve).toHaveLength(81);
    expect(part.curve[0].zCm).toBe(-10);
    expect(part.curve[80].zCm).toBe(10);
    expect(part.curve[40].b).toBeCloseTo(calcBSolenoid(SOLENOID.N, 0.45, SOLENOID.L, SOLENOID.R, 0), 12);
    expect(part.mixedCurrents).toBe(false);
  });

  it('says so when the points were taken at more than one current, and draws for the latest', () => {
    const part = solenoidPart([probe(0, 0.41, 0.3), probe(1, 0.6, 0.45)]);
    expect(part.mixedCurrents).toBe(true);
    expect(part.I).toBe(0.45);
  });

  it('has no curve with no position taken', () => {
    expect(solenoidPart([coil(1, 0.2)])).toMatchObject({ points: [], I: null, curve: [] });
  });

  it('marks the ends of the winding at ±4 cm', () => {
    expect(SOLENOID_END_CM).toBe(4);
  });
});

describe('niceTicks — round numbers for an axis', () => {
  it.each([
    [0.44, [0, 0.2, 0.4, 0.6]],
    [0.76, [0, 0.2, 0.4, 0.6, 0.8]],
    [1.2, [0, 0.5, 1, 1.5]],
    [0.03, [0, 0.01, 0.02, 0.03]],
  ])('covers %p with about four steps', (max, ticks) => {
    expect(niceTicks(max)).toEqual(ticks);
  });

  it.each([0, -1, NaN, Infinity])('gives a usable axis for %p', (max) => {
    expect(niceTicks(max)).toEqual([0, 1]);
  });
});

describe('smoothPath — the measured values joined by a smooth line', () => {
  // Every bezier segment as [start, control 1, control 2, end] y values.
  const segments = (d: string, firstY: number) => {
    const ys = [...d.matchAll(/C\S+ (\S+) \S+ (\S+) \S+ (\S+)/g)].map((m) => [Number(m[1]), Number(m[2]), Number(m[3])]);
    let y0 = firstY;
    return ys.map(([c1, c2, y1]) => { const s = [y0, c1, c2, y1]; y0 = y1; return s; });
  };

  it('starts at the first point and ends at the last, passing through every one', () => {
    const d = smoothPath([[0, 100], [10, 40], [20, 30], [30, 90]]);
    expect(d.startsWith('M0 100 C')).toBe(true);
    expect([...d.matchAll(/ (\d+(?:\.\d+)?) (\d+(?:\.\d+)?)(?= C|$)/g)].map((m) => [Number(m[1]), Number(m[2])]))
      .toEqual([[10, 40], [20, 30], [30, 90]]);
  });

  it('never goes beyond the two points it joins: no overshoot at a peak', () => {
    const points: Array<[number, number]> = [[0, 300], [10, 200], [20, 120], [30, 118], [40, 121], [50, 210], [60, 300]];
    for (const [y0, c1, c2, y1] of segments(smoothPath(points), 300)) {
      const lo = Math.min(y0, y1) - 0.05;
      const hi = Math.max(y0, y1) + 0.05;
      expect(c1).toBeGreaterThanOrEqual(lo);
      expect(c1).toBeLessThanOrEqual(hi);
      expect(c2).toBeGreaterThanOrEqual(lo);
      expect(c2).toBeLessThanOrEqual(hi);
    }
  });

  it('is flat at a peak', () => {
    const d = smoothPath([[0, 50], [10, 10], [20, 50]]);
    // Both control points beside the top share its height.
    expect(d).toContain(' 10 C');
    expect(segments(d, 50)[0][2]).toBe(10);
    expect(segments(d, 50)[1][1]).toBe(10);
  });

  it('is a straight segment for two points, and nothing for fewer', () => {
    expect(smoothPath([[0, 0], [30, 60]])).toBe('M0 0 C10 20 20 40 30 60');
    expect(smoothPath([[0, 0]])).toBe('');
    expect(smoothPath([])).toBe('');
  });
});
