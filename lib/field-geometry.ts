import { COIL_LEVEL_STRIDE, COIL_MODEL, SOLENOID_MODEL, type FieldModel, type ModelLine } from '@/lib/field-model';

// Reads the lab room's field model (lib/field-model.ts: the exact field lines
// of the rig's coil and solenoid, in one half-plane through the axis) into
// what its two views draw. The field is the same in every plane through the
// axis, so the half-plane is all the 2D section needs, and the 3D view turns
// it about the axis.

export type FieldKind = 'coil' | 'solenoid';
/** A point of a field line: z along the axis and rho from it, in cm; b is |B| there over the field at the centre. */
export type Sample = { z: number; rho: number; b: number };
/** Half-extents of a region round the middle of the winding, cm. */
export type Extent = { z: number; rho: number };

export const modelFor = (kind: FieldKind): FieldModel => (kind === 'coil' ? COIL_MODEL : SOLENOID_MODEL);

// What each view shows of a model. `prefer` is the region the section likes to
// show and `need` the least it may show: the winding, and for the solenoid the
// whole travel of the probe. `perCm` sets how many times the 3D view repeats a
// line round the axis, and is picked so that the whole numbers it rounds to
// share the field among the lines as evenly as they can (see copiesRound);
// `arrow` is the length drawn for the centre's field.
// Arrowheads go on every `markEvery`-th level only: on every line they would
// run into each other where the lines are close. For the coil those are the
// lines of the one-turn drawing, so the arrowheads stay put as turns are added.
export const VIEW: Record<FieldKind, { prefer: Extent; need: Extent; perCm: number; arrow: number; bar: number; markEvery: number }> = {
  coil: { prefer: { z: 4.6, rho: 2.4 }, need: { z: 2.2, rho: 1.8 }, perCm: 9.5, arrow: 1.1, bar: 1, markEvery: COIL_LEVEL_STRIDE[1] },
  solenoid: { prefer: { z: 13, rho: 5.2 }, need: { z: 10.8, rho: 2.7 }, perCm: 3.15, arrow: 2.6, bar: 5, markEvery: 2 },
};

/** Whether the line at `level` carries arrowheads. The axis carries its own. */
export const isMarked = (kind: FieldKind, level: number) => level > 0 && level % VIEW[kind].markEvery === 0;

/**
 * The lines of a drawing, the axis first. A line's level is the field summed
 * outward along the mid-plane from the axis, in equal steps, so across the
 * mid-plane inside the winding the lines crowd where the field is strong (and
 * only there: further round a line the gaps follow other things too). The
 * solenoid has one drawing. The coil's step is the same whatever its turns, so
 * twice the turns shows twice the lines, as it has twice the field.
 */
export function linesFor(kind: FieldKind, turns: number): ModelLine[] {
  if (kind === 'solenoid') return SOLENOID_MODEL.lines;
  const stride = COIL_LEVEL_STRIDE[turns as 1 | 2 | 3] ?? COIL_LEVEL_STRIDE[1];
  return COIL_MODEL.lines.filter(line => line.level % stride === 0);
}

export function samples(line: ModelLine): Sample[] {
  const out: Sample[] = [];
  for (let i = 0; i + 2 < line.points.length; i += 3) out.push({ z: line.points[i], rho: line.points[i + 1], b: line.points[i + 2] });
  return out;
}

// ── Shading ───────────────────────────────────────────────────────────────────

/**
 * How bright to draw a field of `b` in a drawing whose strongest field is
 * `top`: 0 for none, 1 for the strongest. Not linear, or everything a few
 * centimetres out would be too dim to see; but it only ever rises with the
 * field, so within one drawing the brighter of two lines is in the stronger
 * field. It says nothing between drawings: each is shaded against its own
 * strongest field, and the 3-turn coil is no brighter than the 1-turn one.
 */
export const brightness = (b: number, top = 1) =>
  (Number.isNaN(b) || !(top > 0) ? 0 : Math.min(1, Math.max(0, b / top)) ** 0.6);

/** The section draws a line in stretches of one shade each; this many shades. */
export const SHADES = 8;
export const shadeOf = (b: number, top = 1) => Math.min(SHADES - 1, Math.floor(brightness(b, top) * SHADES));

const strongestIn = new Map<FieldKind, number>();
/**
 * The strongest field on any line of a model, over the field at its centre:
 * what its drawings are shaded against. For the coil that is next to the wire,
 * over twice the centre's field; for the solenoid it is hardly more than the
 * centre's.
 */
export function strongest(kind: FieldKind): number {
  let top = strongestIn.get(kind);
  if (top === undefined) {
    top = 0;
    for (const line of modelFor(kind).lines) for (let i = 2; i < line.points.length; i += 3) top = Math.max(top, line.points[i]);
    strongestIn.set(kind, top);
  }
  return top;
}

/**
 * Cuts a line into stretches of one shade. Each stretch starts on the point
 * the one before ended on, so the line stays whole; `start` is how far along
 * the line it begins, in cm, for a dash pattern that runs on from one stretch
 * into the next.
 */
export function shadedRuns(pts: Sample[], closed: boolean, top = 1): Array<{ shade: number; start: number; pts: Sample[] }> {
  const runs: Array<{ shade: number; start: number; pts: Sample[] }> = [];
  const segments = closed ? pts.length : pts.length - 1;
  let along = 0;
  for (let i = 0; i < segments; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const shade = shadeOf((a.b + b.b) / 2, top);
    const last = runs[runs.length - 1];
    if (last && last.shade === shade) last.pts.push(b);
    else runs.push({ shade, start: along, pts: [a, b] });
    along += Math.hypot(b.z - a.z, b.rho - a.rho);
  }
  return runs;
}

// ── Direction ─────────────────────────────────────────────────────────────────

/** Where an arrowhead goes: the point, the field's direction there as an angle in the (z, rho) plane, and the field's size. */
export type Mark = { z: number; rho: number; angle: number; b: number };

/**
 * A line's crossings of the mid-plane z = 0, where its arrowheads go: once
 * inside the winding for every line, and again outside it for a line that
 * closes. The axis has none here; it lies along the mid-plane's normal and
 * carries its arrowheads elsewhere.
 */
export function midPlaneMarks(pts: Sample[], closed: boolean): Mark[] {
  const marks: Mark[] = [];
  const n = pts.length;
  const segments = closed ? n : n - 1;
  for (let i = 0; i < segments; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % n];
    if (a.z === 0) {
      // A point on the mid-plane itself: the direction is taken across it.
      const before = closed ? pts[(i - 1 + n) % n] : pts[Math.max(0, i - 1)];
      if (a.rho > 0) marks.push({ z: 0, rho: a.rho, angle: Math.atan2(b.rho - before.rho, b.z - before.z), b: a.b });
    } else if (a.z * b.z < 0) {
      const t = a.z / (a.z - b.z);
      const rho = a.rho + t * (b.rho - a.rho);
      if (rho > 0) marks.push({ z: 0, rho, angle: Math.atan2(b.rho - a.rho, b.z - a.z), b: a.b + t * (b.b - a.b) });
    }
  }
  return marks;
}

/** The field's size along the axis at `z`, over the centre's, read off the model's own axis line. */
export function axisField(kind: FieldKind, z: number): number {
  const axis = samples(modelFor(kind).lines[0]);
  if (axis.length === 0) return 0;
  if (z <= axis[0].z) return axis[0].b;
  for (let i = 1; i < axis.length; i++) {
    if (z <= axis[i].z) {
      const t = (z - axis[i - 1].z) / (axis[i].z - axis[i - 1].z);
      return axis[i - 1].b + t * (axis[i].b - axis[i - 1].b);
    }
  }
  return axis[axis.length - 1].b;
}

// ── Three dimensions ──────────────────────────────────────────────────────────

/**
 * How many times the 3D view repeats a line round the axis. A line that starts
 * further from the axis stands for a wider ring of the mid-plane, so it is
 * repeated in proportion to that distance: each line in space then carries
 * about the same share of the field, and the lines per unit area roughly
 * follow the field's strength, off the mid-plane as well as on it. Only
 * roughly, because the count is a whole number: with the values of `perCm` in
 * VIEW the solenoid's lines carry the same share within 1 %, the coil's within
 * about a sixth either way (the lines nearest the axis are the uneven ones).
 * Two things are not in that count: the axis, drawn as one line though it
 * stands for only the small disc inside the first line, and the last
 * millimetres next to the coil's wire, where the field is strongest and no
 * line is drawn at all (the field of a thin wire has no upper limit).
 */
export function copiesRound(rho0: number, perCm: number): number {
  if (!(rho0 > 0)) return 1;
  return Math.max(1, Math.round(perCm * rho0));
}

/**
 * Where round the axis the copies of the `index`-th line start. Each line
 * starts a golden angle on from the one before, so the copies of neighbouring
 * lines do not pile up in one plane.
 */
export const startAngle = (index: number) => (index * Math.PI * (3 - Math.sqrt(5))) % (2 * Math.PI);

/**
 * A half-plane point turned by `angle` about the axis, as [x, y, z] with x
 * along the axis. At angle 0 it is the section's own plane, y up.
 */
export const aboutAxis = (p: { z: number; rho: number }, angle: number): [number, number, number] =>
  [p.z, p.rho * Math.cos(angle), p.rho * Math.sin(angle)];

/**
 * Where the 3D camera sits round the middle of the winding, in radians:
 * `azimuth` round the upright through it, from straight in front of the
 * section, and `elevation` above the level of the axis.
 */
export type Bearing = { azimuth: number; elevation: number };

/**
 * How far from the middle of the winding the camera must sit, looking at it
 * along `bearing`, for every one of `points` (as aboutAxis gives them) to be
 * in the picture. `tanV` and `tanH` are the tangents of half the camera's
 * angle of view, up and across. A point toward the camera pushes it back by
 * its own distance and more, which is what keeps the near end of the axis in
 * view when the model is turned end-on.
 */
export function cameraDistance(points: Array<[number, number, number]>, bearing: Bearing, tanV: number, tanH: number): number {
  const sinA = Math.sin(bearing.azimuth);
  const cosA = Math.cos(bearing.azimuth);
  const sinE = Math.sin(bearing.elevation);
  const cosE = Math.cos(bearing.elevation);
  let distance = 0;
  for (const [x, y, z] of points) {
    // The point along the camera's forward, right and up directions.
    const ahead = -(x * sinA * cosE + y * sinE + z * cosA * cosE);
    const across = x * cosA - z * sinA;
    const up = -x * sinA * sinE + y * cosE - z * cosA * sinE;
    distance = Math.max(distance, Math.abs(across) / tanH - ahead, Math.abs(up) / tanV - ahead);
  }
  return distance;
}

// ── The probe's arrows ────────────────────────────────────────────────────────

/**
 * How long to draw the arrow for a field of `b` when a field of `peak` gets
 * `full`: negative for a field the other way along the axis. Nothing for a
 * reading that is not a number, and no more than 1.3 × `full` either way, so
 * a reading far above theory stays in the picture (the numbers beside the
 * model say what it really is).
 */
export function arrowLength(b: number, peak: number, full: number): number {
  if (!Number.isFinite(b) || !(peak > 0)) return 0;
  return Math.sign(b) * Math.min(Math.abs(b) / peak, 1.3) * full;
}

/**
 * An arrow `size` cm long as a shaft and a head. The head is `fullHead` long
 * unless the arrow is shorter than that: then the head is the whole arrow, so
 * that a short arrow is still exactly as long as its field says.
 */
export function arrowParts(size: number, fullHead: number): { shaft: number; head: number } {
  const length = Math.max(0, size);
  const head = Math.min(fullHead, length);
  return { shaft: length - head, head };
}

// ── The edge of the traced region ─────────────────────────────────────────────

/**
 * For a line that leaves the traced region: 1 well inside it, falling to 0 at
 * its edge over the last `width` cm. A field line never ends; these go on
 * beyond what was traced and come back round to close. The 3D view, which can
 * see the edge, lets them fade out there instead of stopping in mid-air.
 */
export function edgeFade(p: { z: number; rho: number }, frame: Extent, width: number): number {
  const inside = Math.min(frame.z - Math.abs(p.z), frame.rho - p.rho);
  return Math.min(1, Math.max(0, inside / width));
}

// ── The section's window ──────────────────────────────────────────────────────

/**
 * The part of the section to show in a box of `width` × `height` px, as
 * half-extents in cm round the middle of the winding. It is `prefer` fitted
 * inside the box, zoomed in if that would show past the traced `frame`, and
 * zoomed out again if that hides any of `need`, which matters most.
 */
export function visibleExtent(width: number, height: number, prefer: Extent, need: Extent, frame: Extent): Extent {
  let scale = Math.min(width / (2 * prefer.z), height / (2 * prefer.rho)); // px per cm
  scale = Math.max(scale, width / (2 * frame.z), height / (2 * frame.rho));
  scale = Math.min(scale, width / (2 * need.z), height / (2 * need.rho));
  return { z: width / (2 * scale), rho: height / (2 * scale) };
}
