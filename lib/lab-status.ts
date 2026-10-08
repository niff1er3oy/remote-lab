import net from 'net';

// Whether the lab's other equipment answers, asked from this server. Used by
// the admin page only.

export type Reach = 'online' | 'offline' | 'unset';

const CAMERAS = ['cam1', 'cam2', 'cam3'] as const;
const TIMEOUT_MS = 3000;

/** Asks each camera's address on the camera server. Any answer below 400 counts as online. */
export async function checkCameras(): Promise<Array<{ key: string; state: Reach }>> {
  const auth = 'Basic ' + Buffer.from(`${process.env.CAM_USER ?? 'admin'}:${process.env.CAM_PASSWORD ?? ''}`).toString('base64');
  return Promise.all(CAMERAS.map(async (key) => {
    const url = process.env[key];
    if (!url) return { key, state: 'unset' as const };
    try {
      const res = await fetch(url, { cache: 'no-store', headers: { Authorization: auth }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      await res.body?.cancel();
      return { key, state: res.status < 400 ? 'online' as const : 'offline' as const };
    } catch {
      return { key, state: 'offline' as const };
    }
  }));
}

// The sensor service that /ws/sensor is rewritten to (next.config.ts).
const SENSOR = { host: '127.0.0.1', port: 8000 };

/** Whether the sensor service accepts a connection. */
export function checkSensor(): Promise<Reach> {
  return new Promise((resolve) => {
    const socket = net.connect(SENSOR);
    const done = (state: Reach) => { socket.destroy(); resolve(state); };
    socket.setTimeout(TIMEOUT_MS, () => done('offline'));
    socket.once('connect', () => done('online'));
    socket.once('error', () => done('offline'));
  });
}
