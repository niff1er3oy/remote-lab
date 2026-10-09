import { calibrated, CALIBRATION, fieldFromSensor, SENSOR_AXIS } from '@/lib/sensor';

describe('fieldFromSensor — one message from the magnetometer', () => {
  it('turns the three components in microtesla into the calibrated size of the field in millitesla', () => {
    // sqrt(300^2 + 400^2 + 1200^2) = 1300 uT = 1.3 mT; 1.07353 x 1.3 + 0.00831 = 1.403899
    expect(fieldFromSensor({ bx: 300, by: 400, bz: 1200 })).toBeCloseTo(1.403899, 12);
  });

  it('reads the message as the service sends it, as JSON text', () => {
    expect(fieldFromSensor('{"bx": 0, "by": 0, "bz": 1000}')).toBeCloseTo(1.08184, 12);
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
    expect(fieldFromSensor({ bx: 0, by: 0, bz: 0 })).toBe(0.00831);
    expect(fieldFromSensor({ bx: 0, by: 0, bz: 0 }, 'bz')).toBe(0);
  });

  it('calibrates with the line fitted on the rig', () => {
    expect(CALIBRATION).toEqual({ gain: 1.07353, offset: 0.00831 });
    expect(calibrated(0.5)).toBeCloseTo(0.545075, 12);
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
