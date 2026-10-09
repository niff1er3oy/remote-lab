import { calcBCoil, calcBSolenoid, cmText, PROBE_MAX, PROBE_MIN, PROBE_POSITIONS, PROBE_STEP_M, probeZ, SOLENOID as RIG_SOLENOID } from '@/lib/physics';

// A 16 cm solenoid with the rig's winding and current, worked by hand below.
// (The rig's own solenoid is 8 cm long; it has its own tests further down.)
// Results are in mT.
const MU0 = 4 * Math.PI * 1e-7;
const COIL = { I: 5, R: 0.013 };
const SOLENOID = { N: 75, I: 1, L: 0.16, R: 0.013 };

describe('calcBCoil — field at the centre of a single coil', () => {
  it('gives B₀ = μ₀nI/2R for one turn', () => {
    // 4π×10⁻⁷ × 1 × 5 / (2 × 0.013) = 2.4166×10⁻⁴ T
    expect(calcBCoil(1, COIL.I, COIL.R)).toBeCloseTo(0.24166, 4);
  });

  it('grows in proportion to the number of turns', () => {
    const one = calcBCoil(1, COIL.I, COIL.R);
    expect(calcBCoil(2, COIL.I, COIL.R)).toBeCloseTo(2 * one, 10);
    expect(calcBCoil(3, COIL.I, COIL.R)).toBeCloseTo(3 * one, 10);
  });

  it('grows in proportion to the current and is zero without it', () => {
    expect(calcBCoil(1, 2.5, COIL.R)).toBeCloseTo(calcBCoil(1, 5, COIL.R) / 2, 10);
    expect(calcBCoil(3, 0, COIL.R)).toBe(0);
  });
});

describe('calcBSolenoid — field on the axis of the finite solenoid', () => {
  const at = (zCm: number) => calcBSolenoid(SOLENOID.N, SOLENOID.I, SOLENOID.L, SOLENOID.R, zCm / 100);

  it('matches values worked by hand from B = (μ₀NI/2L)(cos α₁ + cos α₂)', () => {
    // μ₀NI/2L = 2.94524×10⁻⁴ T; the bracket is 1.974105 at the centre,
    // 1.945216 at 4 cm, 0.996715 at 8 cm (the end of the winding) and
    // 0.015217 at 15 cm.
    expect(at(0)).toBeCloseTo(0.58142, 4);
    expect(at(4)).toBeCloseTo(0.57291, 4);
    expect(at(8)).toBeCloseTo(0.29356, 4);
    expect(at(15)).toBeCloseTo(0.00448, 4);
  });

  it('is the same on both sides of the centre', () => {
    for (const z of [1, 4, 8, 12, 15]) expect(at(-z)).toBeCloseTo(at(z), 12);
  });

  it('is strongest at the centre and falls off toward the ends', () => {
    const along = [0, 2, 4, 6, 8, 10, 15].map(at);
    for (let i = 1; i < along.length; i++) expect(along[i]).toBeLessThan(along[i - 1]);
  });

  it('is about half the centre value at the end of the winding', () => {
    expect(at(8) / at(0)).toBeCloseTo(0.505, 2);
  });

  it('approaches the long-solenoid value μ₀(N/L)I when the solenoid is long', () => {
    // Same winding density as the rig (468.75 turns per metre), 100 m long.
    const N = 46875, L = 100;
    const longSolenoid = MU0 * (N / L) * SOLENOID.I * 1e3;
    expect(calcBSolenoid(N, SOLENOID.I, L, SOLENOID.R, 0)).toBeCloseTo(longSolenoid, 6);
    // The real 16 cm solenoid is short enough to fall a little under it.
    expect(at(0)).toBeLessThan(longSolenoid);
  });
});

describe('the solenoid on the rig and its probe positions', () => {
  const at = (position: number) => calcBSolenoid(RIG_SOLENOID.N, RIG_SOLENOID.I, RIG_SOLENOID.L, RIG_SOLENOID.R, probeZ(position));

  it('is 8 cm long with 100 turns, 42 mm across, at 0.5 A', () => {
    expect(RIG_SOLENOID).toEqual({ N: 100, L: 0.08, R: 0.021, I: 0.5 });
  });

  it('has 21 positions, from -10 to 10', () => {
    expect(PROBE_POSITIONS).toEqual([-10, -9, -8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect([PROBE_MIN, PROBE_MAX]).toEqual([-10, 10]);
  });

  it('steps 1 cm at a time from the middle of the solenoid, so the ends are at 10 cm', () => {
    expect(PROBE_STEP_M).toBe(0.01);
    expect(probeZ(4)).toBeCloseTo(0.04, 12);
    expect(probeZ(10)).toBeCloseTo(0.1, 12);
    expect(probeZ(-10)).toBeCloseTo(-0.1, 12);
    expect(probeZ(0)).toBe(0);
  });

  it('gives the field worked by hand at the centre and at the last position', () => {
    // mu0*N*I/2L = 3.92699e-4 T. Centre: 2 x 4/sqrt(2.1^2 + 4^2) = 1.770796.
    expect(at(0)).toBeCloseTo(0.69539, 4);
    // Z = 4 cm, the end of the winding: 8/sqrt(2.1^2 + 8^2) + 0 = 0.967231.
    expect(at(4)).toBeCloseTo(0.37983, 4);
    expect(at(-4)).toBeCloseTo(at(4), 12);
    // Z = 10 cm: 14/sqrt(2.1^2 + 14^2) - 6/sqrt(2.1^2 + 6^2) = 0.988936 - 0.943858.
    expect(at(10)).toBeCloseTo(0.01770, 4);
    expect(at(-10)).toBeCloseTo(at(10), 12);
  });

  it('writes a length in centimetres with at most two decimals', () => {
    expect(cmText(probeZ(3))).toBe('3');
    expect(cmText(0.02875)).toBe('2.88');
    expect(cmText(probeZ(-6))).toBe('-6');
    expect(cmText(0)).toBe('0');
    expect(cmText(0.04)).toBe('4');
  });
});
