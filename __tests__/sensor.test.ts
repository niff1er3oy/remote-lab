import { aboveBackground, calibrated, CALIBRATION, createAverager, fieldFromSensor, SAMPLES_PER_READING, SENSOR_AXIS } from '@/lib/sensor';

describe('fieldFromSensor — one message from the magnetometer', () => {
  it('turns the three components in microtesla into the calibrated size of the field in millitesla', () => {
    // sqrt(300^2 + 400^2 + 1200^2) = 1300 uT = 1.3 mT; 1.1076 x 1.3 + 0.0692 = 1.50908
    expect(fieldFromSensor({ bx: 300, by: 400, bz: 1200 })).toBeCloseTo(1.50908, 12);
  });

  it('reads the message as the service sends it, as JSON text', () => {
    expect(fieldFromSensor('{"bx": 0, "by": 0, "bz": 1000}')).toBeCloseTo(1.1768, 12);
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
    expect(fieldFromSensor({ bx: 0, by: 0, bz: 0 })).toBe(0.0692);
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
