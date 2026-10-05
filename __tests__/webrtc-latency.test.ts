import { readLatency } from '@/lib/webrtc-latency';

// Stats reports are built by hand in the shapes the browsers produce;
// readLatency only needs forEach and get, which a Map provides.
type Stat = Record<string, unknown> & { id: string };
const report = (stats: Stat[]) => new Map(stats.map(s => [s.id, s]));

// Chrome: the transport names the candidate pair in use.
const chrome = (jitterBufferDelay: number, emitted: number, totalDecodeTime: number, framesDecoded: number, roundTrip: number) => report([
  { id: 'T', type: 'transport', selectedCandidatePairId: 'CP1' },
  { id: 'CP0', type: 'candidate-pair', nominated: false, state: 'waiting', currentRoundTripTime: 9 },
  { id: 'CP1', type: 'candidate-pair', nominated: true, state: 'succeeded', currentRoundTripTime: roundTrip },
  { id: 'A', type: 'inbound-rtp', kind: 'audio', jitterBufferDelay: 999, jitterBufferEmittedCount: 1 },
  { id: 'V', type: 'inbound-rtp', kind: 'video', jitterBufferDelay, jitterBufferEmittedCount: emitted, totalDecodeTime, framesDecoded },
]);

describe('readLatency', () => {
  it('uses the averages since the stream began for the first reading', () => {
    const { reading } = readLatency(chrome(3.0, 60, 0.24, 60, 0.040), null);
    // 3.0 s over 60 frames, 0.24 s of decoding over 60 frames, half of 40 ms.
    expect(reading).toEqual({ stalled: false, buffer: 50, decode: 4, network: 20, total: 74 });
  });

  it('describes only the time since the previous reading after that', () => {
    const first = readLatency(chrome(3.0, 60, 0.24, 60, 0.040), null);
    const { reading } = readLatency(chrome(5.4, 90, 0.42, 90, 0.100), first.sample);
    // 30 new frames spent 2.4 s in the buffer and 0.18 s decoding.
    expect(reading).toMatchObject({ stalled: false, network: 50 });
    if (reading && !reading.stalled) {
      expect(reading.buffer).toBeCloseTo(80, 9);
      expect(reading.decode).toBeCloseTo(6, 9);
      expect(reading.total).toBeCloseTo(136, 9);
    }
  });

  it('reports a stall when no frame has come out since the previous reading', () => {
    const first = readLatency(chrome(5.4, 90, 0.42, 90, 0.1), null);
    expect(readLatency(chrome(5.4, 90, 0.42, 90, 0.1), first.sample).reading).toEqual({ stalled: true });
  });

  it('starts over when the counters go backwards, as after a reconnect', () => {
    const before = readLatency(chrome(5.4, 90, 0.42, 90, 0.1), null);
    const { reading } = readLatency(chrome(0.5, 10, 0.03, 10, 0.02), before.sample);
    expect(reading).toEqual({ stalled: false, buffer: 50, decode: 3, network: 10, total: 63 });
  });

  it('reads Firefox-shaped stats: a `selected` pair, `mediaType`, no decode figures', () => {
    const firefox = report([
      { id: 'CPa', type: 'candidate-pair', selected: false, state: 'succeeded', currentRoundTripTime: 5 },
      { id: 'CPb', type: 'candidate-pair', selected: true, state: 'succeeded', currentRoundTripTime: 0.03 },
      { id: 'V', type: 'inbound-rtp', mediaType: 'video', jitterBufferDelay: 1.2, jitterBufferEmittedCount: 30 },
    ]);
    expect(readLatency(firefox, null).reading).toEqual({ stalled: false, buffer: 40, decode: null, network: 15, total: 55 });
  });

  it('still reports buffer and decode time when no round trip is known yet', () => {
    const noPair = report([
      { id: 'V', type: 'inbound-rtp', kind: 'video', jitterBufferDelay: 0.6, jitterBufferEmittedCount: 10, totalDecodeTime: 0.05, framesDecoded: 10 },
    ]);
    expect(readLatency(noPair, null).reading).toEqual({ stalled: false, buffer: 60, decode: 5, network: null, total: 65 });
  });

  it('gives no reading without usable video stats', () => {
    expect(readLatency(report([{ id: 'T', type: 'transport' }]), null).reading).toBeNull();
    expect(readLatency(report([{ id: 'V', type: 'inbound-rtp', kind: 'video', framesDecoded: 5 }]), null).reading).toBeNull();
  });

  it('gives no reading, rather than a stall, before the first frame', () => {
    expect(readLatency(chrome(0, 0, 0, 0, 0.02), null).reading).toBeNull();
  });
});
