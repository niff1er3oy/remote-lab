// How far behind a WebRTC feed is, as far as the receiving browser can tell.
//
// Three parts can be read from RTCPeerConnection.getStats():
//   network — half the round trip to the peer (the camera server)
//   buffer  — how long frames wait in the jitter buffer before they are shown
//   decode  — how long a frame takes to decode
// Their sum is the delay from the camera server to the screen. What happens
// before the server — the camera's own capture and encoding, and its link to
// the server — cannot be seen from the browser, so the true delay is higher.

type Stat = Record<string, unknown>;

/** The part of RTCStatsReport this needs; a plain Map of stats fits too. */
type StatsLike = {
  forEach(callback: (stat: Stat) => void): void;
  get(id: string): Stat | undefined;
};

/** Cumulative counters of the video track at one reading, kept to diff against the next. */
export type LatencySample = {
  jitterBufferDelay: number;
  jitterBufferEmittedCount: number;
  totalDecodeTime: number | null;
  framesDecoded: number | null;
};

/** All figures in milliseconds. `stalled` means no frame came out since the last reading. */
export type LatencyReading =
  | { stalled: true }
  | { stalled: false; total: number; network: number | null; buffer: number; decode: number | null };

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

// Call about once a second, passing back the `sample` returned the time before,
// so the figures describe the last second rather than the whole session.
export function readLatency(
  report: StatsLike,
  prev: LatencySample | null,
): { reading: LatencyReading | null; sample: LatencySample | null } {
  const found: { video?: Stat; transport?: Stat; pair?: Stat } = {};
  report.forEach(stat => {
    if (stat.type === 'inbound-rtp' && (stat.kind === 'video' || stat.mediaType === 'video')) found.video = stat;
    else if (stat.type === 'transport') found.transport = stat;
    // Firefox marks the pair in use with `selected`; others nominate it.
    else if (stat.type === 'candidate-pair' && (stat.selected === true || (stat.nominated === true && stat.state === 'succeeded'))) found.pair = stat;
  });

  const jitterBufferDelay = num(found.video?.jitterBufferDelay);
  const jitterBufferEmittedCount = num(found.video?.jitterBufferEmittedCount);
  if (jitterBufferDelay === null || jitterBufferEmittedCount === null) return { reading: null, sample: null };

  const sample: LatencySample = {
    jitterBufferDelay,
    jitterBufferEmittedCount,
    totalDecodeTime: num(found.video?.totalDecodeTime),
    framesDecoded: num(found.video?.framesDecoded),
  };

  // Counters that went backwards belong to a new stream: start over from zero.
  const base = prev && prev.jitterBufferEmittedCount <= jitterBufferEmittedCount ? prev : null;
  const emitted = jitterBufferEmittedCount - (base?.jitterBufferEmittedCount ?? 0);
  if (emitted <= 0) return { reading: base ? { stalled: true } : null, sample };

  const buffer = (1000 * (jitterBufferDelay - (base?.jitterBufferDelay ?? 0))) / emitted;

  let decode: number | null = null;
  if (sample.totalDecodeTime !== null && sample.framesDecoded !== null) {
    const frames = sample.framesDecoded - (base?.framesDecoded ?? 0);
    if (frames > 0) decode = (1000 * (sample.totalDecodeTime - (base?.totalDecodeTime ?? 0))) / frames;
  }

  const pairId = found.transport?.selectedCandidatePairId;
  const pair = (typeof pairId === 'string' ? report.get(pairId) : undefined) ?? found.pair;
  const roundTrip = num(pair?.currentRoundTripTime);
  const network = roundTrip === null ? null : (1000 * roundTrip) / 2;

  return {
    reading: { stalled: false, total: buffer + (decode ?? 0) + (network ?? 0), network, buffer, decode },
    sample,
  };
}
