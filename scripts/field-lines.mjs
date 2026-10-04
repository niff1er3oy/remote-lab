// Generates lib/field-lines.ts, the field-line paths drawn by
// app/components/FieldDiagram.tsx.
//
//   node scripts/field-lines.mjs
//
// The lines are traced through the exact field of circular current loops
// (Biot-Savart, in closed form with elliptic integrals), using the rig's own
// geometry, so the drawings are to scale. Rerun this if the coil or solenoid
// dimensions change.

import { writeFileSync } from 'node:fs';

const R = 1.3; // cm, winding radius of both the single coil and the solenoid
const L = 16; // cm, solenoid length

// Complete elliptic integrals K(m) and E(m), m = k², by the arithmetic-geometric mean.
function ellipKE(m) {
  let a = 1;
  let b = Math.sqrt(1 - m);
  let c = Math.sqrt(m);
  let sum = 0.5 * c * c;
  let pow = 0.5;
  while (Math.abs(c) > 1e-13) {
    const an = (a + b) / 2;
    c = (a - b) / 2;
    b = Math.sqrt(a * b);
    a = an;
    pow *= 2;
    sum += pow * c * c;
  }
  const K = Math.PI / (2 * a);
  return [K, K * (1 - sum)];
}

// Field of a loop of radius a centred on the axis at z = 0, at the point
// (rho, z). Returned as [B_rho, B_z] in units of μ₀I/π.
function loopB(a, rho, z) {
  const r2 = a * a + rho * rho + z * z;
  const al2 = r2 - 2 * a * rho;
  const be = Math.sqrt(r2 + 2 * a * rho);
  const [K, E] = ellipKE(Math.max(0, 1 - al2 / (be * be)));
  const bz = ((a * a - rho * rho - z * z) * E + al2 * K) / (2 * al2 * be);
  const brho = rho < 1e-9 ? 0 : (z * (r2 * E - al2 * K)) / (2 * al2 * be * rho);
  return [brho, bz];
}

const coilB = (rho, z) => loopB(R, rho, z);

// The solenoid as a stack of loops. More loops than real turns, so the winding
// behaves like the continuous current sheet it nearly is.
const SHEET_LOOPS = 320;
function solenoidB(rho, z) {
  let brho = 0;
  let bz = 0;
  for (let i = 0; i < SHEET_LOOPS; i++) {
    const zi = -L / 2 + ((i + 0.5) * L) / SHEET_LOOPS;
    const [r, a] = loopB(R, rho, z - zi);
    brho += r;
    bz += a;
  }
  return [brho, bz];
}

// Follows the field from (rho0, z = 0) in the +z direction until the line comes
// back to the mid-plane (a closed line) or leaves the frame. The other half is
// the mirror image, so only this half is traced.
function trace(field, rho0, frame, step = 0.004) {
  const dir = (rho, z) => {
    const [br, bz] = field(rho, z);
    const n = Math.hypot(br, bz);
    return [br / n, bz / n];
  };
  let rho = rho0;
  let z = 0;
  const pts = [[z, rho]];
  for (let i = 0; i < 400000; i++) {
    const [r1, z1] = dir(rho, z);
    const [r2, z2] = dir(rho + (step / 2) * r1, z + (step / 2) * z1);
    const [r3, z3] = dir(rho + (step / 2) * r2, z + (step / 2) * z2);
    const [r4, z4] = dir(rho + step * r3, z + step * z3);
    const nextRho = rho + (step / 6) * (r1 + 2 * r2 + 2 * r3 + r4);
    const nextZ = z + (step / 6) * (z1 + 2 * z2 + 2 * z3 + z4);
    if (nextZ <= 0 && i > 10) {
      // Back at the mid-plane: land exactly on it.
      const t = z / (z - nextZ);
      pts.push([0, rho + t * (nextRho - rho)]);
      return { pts, closed: true };
    }
    rho = nextRho;
    z = nextZ;
    pts.push([z, rho]);
    if (z > frame.z || rho > frame.rho) return { pts, closed: false };
  }
  throw new Error(`line from rho0=${rho0} did not finish`);
}

// Drops points where the line is nearly straight.
function thin(pts, scale) {
  const out = [pts[0]];
  let last = pts[0];
  let lastDir = null;
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i];
    const dist = Math.hypot(p[0] - last[0], p[1] - last[1]) * scale;
    if (dist < 1.5) continue;
    const d = Math.atan2(pts[i + 1][1] - p[1], pts[i + 1][0] - p[0]);
    const turned = lastDir === null ? Infinity : Math.abs(Math.atan2(Math.sin(d - lastDir), Math.cos(d - lastDir)));
    if (turned > 0.07 || dist > 16) {
      out.push(p);
      last = p;
      lastDir = d;
    }
  }
  out.push(pts[pts.length - 1]);
  return out;
}

// One SVG path per line, in px around the centre of the drawing, upper half
// only (y is up-negative). Closed lines run once round; open ones run from the
// left edge of the frame to the right.
function toPath({ pts, closed }, scale) {
  const half = thin(pts, scale);
  const mirrored = half.slice(1).reverse().map(([z, rho]) => [-z, rho]);
  const all = closed ? [...half, ...mirrored.slice(1)] : [...mirrored, ...half];
  const d = all.map(([z, rho], i) => `${i === 0 ? 'M' : 'L'}${(z * scale).toFixed(1)} ${(-rho * scale).toFixed(1)}`).join('');
  return closed ? `${d}Z` : d;
}

function build(field, starts, scale, view) {
  const frame = { z: view.w / 2 / scale + 0.2, rho: view.h / 2 / scale + 0.2 };
  return starts.map(f => {
    const line = trace(field, f * R, frame);
    const end = line.pts[line.pts.length - 1];
    const inner = +(f * R * scale).toFixed(1);
    const outer = line.closed ? +(end[1] * scale).toFixed(1) : null;
    return `    { inner: ${inner}, outer: ${outer}, d: '${toPath(line, scale)}' },`;
  }).join('\n');
}

const VIEW = { w: 520, h: 240 };
const COIL_SCALE = 44; // px per cm
const SOLENOID_SCALE = 20;

// Sanity check against the closed form used by lib/physics.ts: on the axis at
// the centre, B = (μ₀NI/2L)·2cos α with cos α = (L/2)/√(R² + (L/2)²).
const sheet = (solenoidB(0, 0)[1] / SHEET_LOOPS) * (2 * L) / Math.PI;
const closedForm = (2 * (L / 2)) / Math.hypot(R, L / 2);
if (Math.abs(sheet - closedForm) > 1e-3) throw new Error(`centre field is off: ${sheet} vs ${closedForm}`);

const out = `// Generated by scripts/field-lines.mjs — do not edit by hand.
//
// Magnetic field lines of the rig's single coil and its solenoid, in the plane
// through the axis. Paths are in px around the centre of a ${VIEW.w}×${VIEW.h} drawing
// and cover the upper half only; the lower half is the mirror image.

export type FieldLine = {
  /** px from the axis where the line crosses the mid-plane, inside the winding */
  inner: number;
  /** px where it crosses the mid-plane again outside, or null if it leaves the frame first */
  outer: number | null;
  d: string;
};

export const FIELD_VIEW = { w: ${VIEW.w}, h: ${VIEW.h} };

export const COIL_FIELD = {
  pxPerCm: ${COIL_SCALE},
  radius: ${+(R * COIL_SCALE).toFixed(1)},
  lines: [
${build(coilB, [0.3, 0.52, 0.7, 0.85], COIL_SCALE, VIEW)}
  ] as FieldLine[],
};

export const SOLENOID_FIELD = {
  pxPerCm: ${SOLENOID_SCALE},
  radius: ${+(R * SOLENOID_SCALE).toFixed(1)},
  halfLength: ${+((L / 2) * SOLENOID_SCALE).toFixed(1)},
  lines: [
${build(solenoidB, [0.28, 0.52, 0.72, 0.86, 0.92], SOLENOID_SCALE, VIEW)}
  ] as FieldLine[],
};
`;

writeFileSync(new URL('../lib/field-lines.ts', import.meta.url), out);
console.log('wrote lib/field-lines.ts');
