import { aboveBackground, backgroundSize, calibrated, CALIBRATION, createAverager, createVectorAverager, fieldAbove, fieldFromSensor, fieldSize, vectorFromSensor, READINGS_PER_MEASUREMENT, SAMPLES_PER_READING, SENSOR_AXIS, trimmedMean } from '@/lib/sensor';

describe('fieldFromSensor — one message from the magnetometer', () => {
  it('turns the three components in microtesla into the calibrated size of the field in millitesla', () => {
    // sqrt(300^2 + 400^2 + 1200^2) = 1300 uT = 1.3 mT
    expect(fieldFromSensor({ bx: 300, by: 400, bz: 1200 })).toBeCloseTo(calibrated(1.3), 12);
  });

  it('reads the message as the service sends it, as JSON text', () => {
    expect(fieldFromSensor('{"bx": 0, "by": 0, "bz": 1000}')).toBeCloseTo(calibrated(1), 12);
  });

  it('uses the size of the field unless told to use one component', () => {
    expect(SENSOR_AXIS).toBe('magnitude');
  });

  it('gives one component, with its sign, when asked for it', () => {
    const reading = { bx: 12.34, by: -560, bz: 1120 };
    expect(fieldFromSensor(reading, 'bx')).toBeCloseTo(0.01234, 12);
    expect(fieldFromSensor(reading, 'by')).toBeCloseTo(-0.56, 12);
    expect(fieldFromSensor(reading, 'bz')).toBeCloseTo(1.12, 12);
  });

  it('reads a field of zero as a reading, not as no reading', () => {
    expect(fieldFromSensor({ bx: 0, by: 0, bz: 0 })).toBe(calibrated(0));
    expect(fieldFromSensor({ bx: 0, by: 0, bz: 0 }, 'bz')).toBe(0);
  });

  it('calibrates with the line fitted on the rig', () => {
    expect(CALIBRATION).toEqual({ gain: 1.1076, offset: 0.0692 });
    expect(calibrated(0.5)).toBeCloseTo(0.623, 12);
  });

  it('still reads the earlier form, one value already in millitesla', () => {
    expect(fieldFromSensor({ value: 0.42 })).toBe(0.42);
    expect(fieldFromSensor('{"value": 0}')).toBe(0);
  });

  it.each([
    ['text that is not JSON', 'bx=1'],
    ['a component missing', { bx: 1, by: 2 }],
    ['a component that is text', { bx: '1', by: 2, bz: 3 }],
    ['a component that is not finite', { bx: 1, by: 2, bz: Infinity }],
    ['a null component', { bx: null, by: 2, bz: 3 }],
    ['an empty object', {}],
    ['a list', [1, 2, 3]],
    ['nothing', null],
    ['a bare number', 5],
  ])('gives no reading for %s', (_label, message) => {
    expect(fieldFromSensor(message)).toBeNull();
  });
});

describe('createAverager — twenty values make one reading', () => {
  afterEach(() => jest.useRealTimers());

  it('takes twenty values for a reading', () => {
    expect(SAMPLES_PER_READING).toBe(20);
  });

  it('gives nothing until the block is full, then the mean of the block', () => {
    const averager = createAverager();
    for (let i = 1; i <= 19; i++) expect(averager.add(i)).toBeNull();
    // 1 + 2 + ... + 20 = 210; 210 / 20 = 10.5
    expect(averager.add(20)).toBeCloseTo(10.5, 12);
  });

  it('starts the next reading from nothing', () => {
    const averager = createAverager(4);
    [100, 100, 100].forEach((v) => averager.add(v));
    expect(averager.add(100)).toBe(100);
    [1, 2, 3].forEach((v) => expect(averager.add(v)).toBeNull());
    expect(averager.add(4)).toBe(2.5);
  });

  it('a fresh reading leaves out what was collected before it was asked for', async () => {
    const averager = createAverager(4);
    // Taken while the probe was still moving.
    [9, 9, 9].forEach((v) => averager.add(v));
    const reading = averager.fresh(1000);
    [1, 2, 3, 4].forEach((v) => averager.add(v));
    expect(await reading).toBe(2.5);
  });

  it('a fresh reading is null when the sensor does not send enough in time', async () => {
    jest.useFakeTimers();
    const averager = createAverager(4);
    const reading = averager.fresh(4000);
    [1, 2, 3].forEach((v) => averager.add(v));
    jest.advanceTimersByTime(4000);
    expect(await reading).toBeNull();
    // The late value completes an ordinary reading and disturbs nothing.
    expect(averager.add(4)).toBe(2.5);
  });

  it('answers everyone waiting for a fresh reading', async () => {
    const averager = createAverager(2);
    const first = averager.fresh(1000);
    averager.add(5);
    const second = averager.fresh(1000);
    averager.add(1);
    averager.add(3);
    expect(await Promise.all([first, second])).toEqual([2, 2]);
  });
});

describe('aboveBackground — a reading with the room\'s own field taken off', () => {
  it('is the calibrated reading less the calibrated background', () => {
    // The coil on: 0.292 mT. The room alone, read on entering: 0.050 mT.
    expect(aboveBackground(0.292, 0.05)).toBeCloseTo(0.242, 12);
  });

  it('takes the two calibrated values as they are, so the calibration\'s offset cancels', () => {
    // Raw sizes of 0.25 and 0.04 mT: the gain times (0.25 - 0.04).
    expect(aboveBackground(calibrated(0.25), calibrated(0.04))).toBeCloseTo(CALIBRATION.gain * 0.21, 12);
  });

  it('is nothing when the sensor reads what it read on entering', () => {
    expect(aboveBackground(calibrated(0.05), calibrated(0.05))).toBe(0);
  });

  it('can come out a little below zero, and is left that way', () => {
    expect(aboveBackground(0.048, 0.05)).toBeCloseTo(-0.002, 12);
  });

  it('leaves the reading as it is when the background could not be read', () => {
    expect(aboveBackground(0.292, null)).toBe(0.292);
  });

  it('works on what a message from the sensor carries', () => {
    const background = fieldFromSensor({ bx: 30, by: 40, bz: 0 }) as number; // 0.05 mT raw
    const coilOn = fieldFromSensor({ bx: 180, by: 240, bz: 0 }) as number; // 0.30 mT raw
    expect(aboveBackground(coilOn, background)).toBeCloseTo(CALIBRATION.gain * 0.25, 12);
  });
});

describe('createAverager — starting over', () => {
  it('drops what was collected toward the next reading', () => {
    const averager = createAverager(4);
    // Taken before the background was known: these still have it in them.
    [9, 9, 9].forEach((v) => averager.add(v));
    averager.reset();
    [1, 2, 3].forEach((v) => expect(averager.add(v)).toBeNull());
    expect(averager.add(4)).toBe(2.5);
  });

  it('does not disturb someone waiting for a fresh reading', async () => {
    const averager = createAverager(2);
    const reading = averager.fresh(1000);
    averager.add(100);
    averager.reset();
    averager.add(1);
    averager.add(3);
    expect(await reading).toBe(2);
  });
});

describe('vectorFromSensor — the three components of one message', () => {
  it('gives them in millitesla', () => {
    expect(vectorFromSensor({ bx: 300, by: -400, bz: 1200 })).toEqual({ x: 0.3, y: -0.4, z: 1.2 });
    expect(vectorFromSensor('{"bx": 12.5, "by": 0, "bz": -30}')).toEqual({ x: 0.0125, y: 0, z: -0.03 });
  });

  it('takes the earlier one-value form of the feed to lie along one axis', () => {
    expect(vectorFromSensor({ value: 0.42 })).toEqual({ x: 0.42, y: 0, z: 0 });
  });

  it.each([[null], [undefined], ['not json'], [7], [{}], [{ bx: 1, by: 2 }], [{ bx: '1', by: 2, bz: 3 }], [{ bx: NaN, by: 0, bz: 0 }]])('is nothing for %p', (message) => {
    expect(vectorFromSensor(message)).toBeNull();
  });

  it('has a size', () => {
    expect(fieldSize({ x: 0.3, y: 0.4, z: 1.2 })).toBeCloseTo(1.3, 12);
  });
});

describe('fieldAbove — the background taken off size from size, then calibrated', () => {
  const { gain, offset } = CALIBRATION;

  it('takes the raw size of the background from the raw size of the reading and calibrates what is left', () => {
    // Sizes of 0.5 and 0.05 mT: 1.1076 x 0.45 + 0.0692.
    expect(fieldAbove({ x: 0.3, y: 0.4, z: 0 }, { x: 0.03, y: 0.04, z: 0 })).toBeCloseTo(gain * 0.45 + offset, 12);
    expect(fieldAbove({ x: 0.3, y: 0.4, z: 0 }, { x: 0.03, y: 0.04, z: 0 })).toBeCloseTo(0.56762, 12);
  });

  it('goes by size alone, whichever way the two point', () => {
    expect(fieldAbove({ x: 0.5, y: 0, z: 0 }, { x: 0, y: 0, z: -0.05 })).toBeCloseTo(gain * 0.45 + offset, 12);
  });

  it('reads the offset of the line, not zero, where there is only the background', () => {
    const background = { x: 0.03, y: 0.04, z: 0 };
    expect(fieldAbove(background, background)).toBeCloseTo(offset, 12);
  });

  it('can go under the offset: a reading smaller than the background', () => {
    expect(fieldAbove({ x: 0.02, y: 0, z: 0 }, { x: 0.05, y: 0, z: 0 })).toBeCloseTo(gain * -0.03 + offset, 12);
  });

  it('only calibrates the reading when no background could be read', () => {
    expect(fieldAbove({ x: 0.3, y: 0.4, z: 0 }, null)).toBeCloseTo(calibrated(0.5), 12);
  });

  it('takes another line when given one', () => {
    expect(fieldAbove({ x: 0.5, y: 0, z: 0 }, { x: 0.1, y: 0, z: 0 }, { gain: 2, offset: 0.1 })).toBeCloseTo(0.9, 12);
  });

  it('is low along the tails of the solenoid when the background is not along the axis', () => {
    // A background of 0.0325 mT at 125 degrees to the axis, and 0.0384 mT of the solenoid's along it.
    const background = { x: 0.0325 * Math.cos((125 * Math.PI) / 180), y: 0.0325 * Math.sin((125 * Math.PI) / 180), z: 0 };
    const sizeFromSize = fieldSize({ x: background.x + 0.0384, y: background.y, z: 0 }) - fieldSize(background);
    expect((sizeFromSize - 0.0384) / 0.0384).toBeLessThan(-0.5);
  });

  it('shows the background as its raw size with the calibration on it', () => {
    // 1.1076 x 0.05 + 0.0692
    expect(backgroundSize({ x: 0.03, y: 0.04, z: 0 })).toBeCloseTo(0.12458, 12);
  });
});

describe('trimmedMean — a run of readings with the smallest and the largest left out', () => {
  it('measures with twenty readings', () => {
    expect(READINGS_PER_MEASUREMENT).toBe(20);
  });

  it('leaves out the reading with the smallest field and the one with the largest, and averages the rest', () => {
    const run = [1, 5, 2, 3, 100].map(x => ({ x, y: 0, z: 0 }));
    expect(trimmedMean(run).x).toBeCloseTo(10 / 3, 12);
  });

  it('goes by the size of the field, not by one component', () => {
    // Sizes 5, 6, 1 and 2: the 1 and the 6 go.
    const run = [{ x: 3, y: 4, z: 0 }, { x: -6, y: 0, z: 0 }, { x: 1, y: 0, z: 0 }, { x: 0, y: 2, z: 0 }];
    expect(trimmedMean(run)).toEqual({ x: 1.5, y: 3, z: 0 });
  });

  it('leaves out only one of each when several are of the same size', () => {
    const run = [2, 2, 2, 8, 8].map(x => ({ x, y: 0, z: 0 }));
    expect(trimmedMean(run).x).toBeCloseTo(4, 12);
  });

  it('leaves out two even when every reading is of the same size', () => {
    const run = [{ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }, { x: -1, y: 0, z: 0 }];
    expect(trimmedMean(run)).toEqual({ x: 0, y: 1, z: 0 });
  });

  it('of twenty readings is the mean of the eighteen in between', () => {
    const run = Array.from({ length: READINGS_PER_MEASUREMENT }, (_, i) => ({ x: i + 1, y: 0, z: 0 }));
    // 2 + 3 + ... + 19 = 189; 189 / 18 = 10.5
    expect(trimmedMean(run).x).toBeCloseTo(10.5, 12);
  });

  it('is the plain mean of fewer than three, and a single reading as it is', () => {
    expect(trimmedMean([{ x: 1, y: 0, z: 0 }, { x: 3, y: 0, z: 0 }])).toEqual({ x: 2, y: 0, z: 0 });
    expect(trimmedMean([{ x: 1, y: 2, z: 3 }])).toEqual({ x: 1, y: 2, z: 3 });
  });
});

describe('freshRun — readings in a row from now on', () => {
  afterEach(() => jest.useRealTimers());

  it('gives as many readings as asked for, each the mean of its own block, none left out between them', async () => {
    const averager = createAverager(2);
    // Taken while the probe was still moving.
    averager.add(9);
    const run = averager.freshRun(3, 1000);
    [1, 3, 5, 7, 9, 11].forEach((v) => averager.add(v));
    expect(await run).toEqual([2, 6, 10]);
  });

  it('waits for each reading in turn, not for the whole run at once', async () => {
    jest.useFakeTimers();
    const averager = createAverager(2);
    const run = averager.freshRun(2, 1000);
    jest.advanceTimersByTime(900);
    averager.add(1);
    averager.add(3);
    jest.advanceTimersByTime(900);
    averager.add(5);
    averager.add(7);
    expect(await run).toEqual([2, 6]);
  });

  it('is null when the sensor stops before the run is complete', async () => {
    jest.useFakeTimers();
    const averager = createAverager(2);
    const run = averager.freshRun(3, 4000);
    averager.add(1);
    averager.add(3);
    jest.advanceTimersByTime(4000);
    expect(await run).toBeNull();
    // The late values complete ordinary readings and disturb nothing.
    averager.add(5);
    expect(averager.add(7)).toBe(6);
  });

  it('leaves someone waiting for a single fresh reading to it', async () => {
    const averager = createAverager(2);
    const single = averager.fresh(1000);
    const run = averager.freshRun(2, 1000);
    [1, 3, 5, 7].forEach((v) => averager.add(v));
    expect(await single).toBe(2);
    expect(await run).toEqual([2, 6]);
  });

  it('with trimmedMean is what one measurement of the solenoid is', async () => {
    const averager = createVectorAverager(2);
    const run = averager.freshRun(4, 1000);
    // Four readings of sizes 0.2, 0.5, 0.3 and 0.4 mT: the 0.2 and the 0.5 go.
    [0.2, 0.2, 0.5, 0.5, 0.3, 0.3, 0.4, 0.4].forEach((x) => averager.add({ x, y: 0, z: 0 }));
    expect(trimmedMean((await run)!).x).toBeCloseTo(0.35, 12);
  });
});

describe('createVectorAverager — a reading of the three components', () => {
  it('is the mean of each component over the block', () => {
    const averager = createVectorAverager(4);
    expect(averager.add({ x: 1, y: 0, z: -2 })).toBeNull();
    averager.add({ x: 3, y: 0, z: -2 });
    averager.add({ x: 1, y: 4, z: -2 });
    expect(averager.add({ x: 3, y: 4, z: -2 })).toEqual({ x: 2, y: 2, z: -2 });
  });

  it('averages the noise out before a size is taken: opposite kicks across the axis cancel', () => {
    const averager = createVectorAverager(2);
    averager.add({ x: 0.1, y: 0.05, z: 0 });
    const reading = averager.add({ x: 0.1, y: -0.05, z: 0 });
    expect(fieldSize(reading!)).toBeCloseTo(0.1, 12);
  });

  it('takes twenty values to a reading unless told otherwise, and a fresh one starts from now', async () => {
    const averager = createVectorAverager();
    for (let i = 0; i < SAMPLES_PER_READING - 1; i++) expect(averager.add({ x: 9, y: 9, z: 9 })).toBeNull();
    const fresh = averager.fresh(1000);
    for (let i = 0; i < SAMPLES_PER_READING; i++) averager.add({ x: 1, y: 2, z: 3 });
    expect(await fresh).toEqual({ x: 1, y: 2, z: 3 });
  });
});
