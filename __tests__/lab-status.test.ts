/** @jest-environment node */
import { EventEmitter } from 'events';
import net from 'net';
import { GET as status } from '@/app/api/admin/status/route';
import { checkCameras, checkSensor } from '@/lib/lab-status';
import { resetRigState, rigState } from '@/lib/rig';
import { ADMIN, signInAs, signOut, STUDENT } from './helpers/server/session';

jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('net', () => ({ __esModule: true, default: { connect: jest.fn() } }));

const fetchMock = jest.fn<Promise<Response>, [string, RequestInit]>();

// A socket that does what the test says, a moment after it is opened.
function socketThat(does: 'connect' | 'error' | 'timeout') {
  const socket = Object.assign(new EventEmitter(), {
    destroy: jest.fn(),
    setTimeout: jest.fn((_ms: number, onTimeout: () => void) => { if (does === 'timeout') setImmediate(onTimeout); }),
  });
  if (does !== 'timeout') setImmediate(() => socket.emit(does, new Error('ECONNREFUSED')));
  jest.mocked(net.connect).mockReturnValue(socket as unknown as net.Socket);
  return socket;
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async () => new Response('ok', { status: 200 }));
  globalThis.fetch = fetchMock as unknown as typeof fetch;
  socketThat('connect');
  resetRigState();
  signInAs(ADMIN);
});

describe('checkCameras', () => {
  it('asks each camera\'s own address, with the camera\'s credentials', async () => {
    await checkCameras();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      'http://camera.invalid/camera1', 'http://camera.invalid/camera2', 'http://camera.invalid/camera3',
    ]);
    expect(fetchMock.mock.calls[0][1].headers).toEqual({ Authorization: 'Basic dGVzdC11c2VyOnRlc3QtcGFzc3dvcmQ=' });
  });

  it('calls a camera online when it answers, offline when it refuses or cannot be reached', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('ok', { status: 200 }))
      .mockResolvedValueOnce(new Response('no such path', { status: 404 }))
      .mockRejectedValueOnce(new Error('connect ECONNREFUSED'));
    expect(await checkCameras()).toEqual([
      { key: 'cam1', state: 'online' }, { key: 'cam2', state: 'offline' }, { key: 'cam3', state: 'offline' },
    ]);
  });

  it('says a camera is not set up when it has no address, and asks nothing of it', async () => {
    const saved = process.env.cam2;
    try {
      delete process.env.cam2;
      expect((await checkCameras())[1]).toEqual({ key: 'cam2', state: 'unset' });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    } finally {
      process.env.cam2 = saved;
    }
  });
});

describe('checkSensor', () => {
  it('is online when the sensor service accepts a connection', async () => {
    const socket = socketThat('connect');
    expect(await checkSensor()).toBe('online');
    expect(net.connect).toHaveBeenCalledWith({ host: '127.0.0.1', port: 8888 });
    expect(socket.destroy).toHaveBeenCalled();
  });

  it.each([
    ['ws://192.168.1.50:9000/ws/sensor', { host: '192.168.1.50', port: 9000 }],
    ['http://sensor.local', { host: 'sensor.local', port: 80 }],
  ])('asks the address in SENSOR_URL: %s', async (url, address) => {
    process.env.SENSOR_URL = url;
    try {
      await checkSensor();
      expect(net.connect).toHaveBeenLastCalledWith(address);
    } finally {
      process.env.SENSOR_URL = '';
    }
  });

  it.each(['error', 'timeout'] as const)('is offline on %s', async (how) => {
    socketThat(how);
    expect(await checkSensor()).toBe('offline');
  });
});

describe('GET /api/admin/status', () => {
  it('reports the rig, the cameras and the sensor to an admin', async () => {
    socketThat('error');
    const res = await status();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      checked_at: expect.any(String),
      rig: rigState(),
      cameras: [{ key: 'cam1', state: 'online' }, { key: 'cam2', state: 'online' }, { key: 'cam3', state: 'online' }],
      sensor: 'offline',
    });
  });

  it('gives away neither the camera addresses nor their credentials', async () => {
    const text = JSON.stringify(await (await status()).json());
    expect(text).not.toMatch(/camera\.invalid|test-password|dGVzdC11c2Vy/);
  });

  it.each([
    ['a student', () => signInAs(STUDENT)],
    ['a signed-out visitor', () => signOut()],
  ])('answers 403 to %s without checking anything', async (_who, become) => {
    become();
    expect((await status()).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
