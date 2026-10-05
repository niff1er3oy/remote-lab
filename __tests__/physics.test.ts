import { calcBCoil, calcBSolenoid } from '@/lib/physics';

// The rig's own numbers (Lab 8 handout). Results are in mT.
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
