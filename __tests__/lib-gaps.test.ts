/** @jest-environment node */
import { EventEmitter } from 'events';
import net from 'net';
import { checkCameras, checkSensor } from '@/lib/lab-status';
import { disabledInstruments, setDisabledInstruments } from '@/lib/rig-settings';
import { breakDb, read, resetDb, seed } from './helpers/server/firestore';
import { freezeTime, restoreTime } from './helpers/server/time';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('./helpers/server/firestore')>('./helpers/server/firestore').db,
}));
jest.mock('net', () => ({ __esModule: true, default: { connect: jest.fn() } }));

const NOW = '2026-10-08T03:00:00.000Z';

beforeEach(() => {
  freezeTime(NOW);
  resetDb();
});

afterEach(() => restoreTime());

describe('disabledInstruments', () => {
  it('is empty when no admin has ever closed anything', async () => {
    expect(await disabledInstruments()).toEqual([]);
  });

  it('is empty when the settings document holds other settings only', async () => {
    seed('settings', 'rig', { updated_by: 'admin-1' });
    expect(await disabledInstruments()).toEqual([]);
  });

  it('returns the closed instruments in the rig\'s order', async () => {
    seed('settings', 'rig', { disabled_instruments: ['sole.py', 'coil_1.py'] });
    expect(await disabledInstruments()).toEqual(['coil_1.py', 'sole.py']);
  });

  it('drops anything in the document that is not an instrument, so a hand-edited value cannot close a break script', async () => {
    seed('settings', 'rig', { disabled_instruments: ['coil_b.py', 'relay.py', 'coil_2.py', 'coil_2.py', 5, null] });
    expect(await disabledInstruments()).toEqual(['coil_2.py']);
  });

  it.each([['coil_1.py'], [{ 'coil_1.py': true }], [true]])('treats a list stored as %j as nothing closed', async (stored) => {
    seed('settings', 'rig', { disabled_instruments: stored });
    expect(await disabledInstruments()).toEqual([]);
  });

  it('rejects when Firestore cannot be read, so a caller cannot mistake an outage for "nothing closed"', async () => {
    breakDb();
    await expect(disabledInstruments()).rejects.toThrow('UNAVAILABLE');
  });
});

describe('setDisabledInstruments', () => {
  it('stores the list with who set it and when', async () => {
    await setDisabledInstruments(['coil_1.py', 'coil_3.py'], 'admin-1');
    expect(read('settings', 'rig')).toEqual({ disabled_instruments: ['coil_1.py', 'coil_3.py'], updated_by: 'admin-1', updated_at: NOW });
  });

  it('stores only real instruments, once each, in the rig\'s order', async () => {
    await setDisabledInstruments(['sole.py', 'relay.py', 'coil_2.py', 'sole.py'], 'admin-1');
    expect(read('settings', 'rig')?.disabled_instruments).toEqual(['coil_2.py', 'sole.py']);
  });

  it('replaces the earlier list and its author', async () => {
    await setDisabledInstruments(['coil_1.py'], 'admin-1');
    await setDisabledInstruments([], 'admin-2');
    expect(read('settings', 'rig')).toMatchObject({ disabled_instruments: [], updated_by: 'admin-2' });
    expect(await disabledInstruments()).toEqual([]);
  });

  it('rejects when Firestore cannot be written', async () => {
    breakDb();
    await expect(setDisabledInstruments(['coil_1.py'], 'admin-1')).rejects.toThrow('UNAVAILABLE');
    expect(read('settings', 'rig')).toBeUndefined();
  });
});

describe('checkCameras — without camera credentials set', () => {
  it('asks as "admin" with no password', async () => {
    const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>(async () => new Response('ok', { status: 200 }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const saved = { user: process.env.CAM_USER, password: process.env.CAM_PASSWORD };
    try {
      delete process.env.CAM_USER;
      delete process.env.CAM_PASSWORD;
      expect(await checkCameras()).toEqual(['cam1', 'cam2', 'cam3'].map((key) => ({ key, state: 'online' })));
      expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: `Basic ${Buffer.from('admin:').toString('base64')}` });
    } finally {
      process.env.CAM_USER = saved.user;
      process.env.CAM_PASSWORD = saved.password;
    }
  });
});

describe('checkSensor — a secure sensor address without a port', () => {
  it.each([
    ['wss://sensor.example/ws/sensor', { host: 'sensor.example', port: 443 }],
    ['https://sensor.example', { host: 'sensor.example', port: 443 }],
    ['  ws://10.0.0.7:8888  ', { host: '10.0.0.7', port: 8888 }],
  ])('asks %j at its own host and port', async (url, address) => {
    const socket = Object.assign(new EventEmitter(), { destroy: jest.fn(), setTimeout: jest.fn() });
    setImmediate(() => socket.emit('connect'));
    jest.mocked(net.connect).mockReturnValue(socket as unknown as net.Socket);
    process.env.SENSOR_URL = url;
    try {
      expect(await checkSensor()).toBe('online');
      expect(net.connect).toHaveBeenLastCalledWith(address);
    } finally {
      process.env.SENSOR_URL = '';
    }
  });
});
