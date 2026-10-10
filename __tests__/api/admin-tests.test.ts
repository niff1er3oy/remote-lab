/** @jest-environment node */
import { GET } from '@/app/api/admin/tests/route';
import { knownAccount, resetAuth } from '../helpers/server/auth';
import { ADMIN, signInAs, signOut, STUDENT } from '../helpers/server/session';

jest.mock('@/lib/firebase-admin', () => ({
  adminAuth: jest.requireActual<typeof import('../helpers/server/auth')>('../helpers/server/auth').auth,
}));
jest.mock('@/lib/session', () => ({ getSessionUser: jest.fn() }));
jest.mock('next/headers', () => ({ cookies: jest.fn() }));

const ask = async () => {
  const res = await GET();
  return { status: res.status, body: await res.json() };
};

beforeEach(() => {
  resetAuth();
  knownAccount(ADMIN.uid, 'Admin One', 'admin@example.com');
});

describe('GET /api/admin/tests — the unit tests, for admins', () => {
  it('answers 403 to someone who is not signed in, with nothing about the tests', async () => {
    signOut();
    const { status, body } = await ask();
    expect(status).toBe(403);
    expect(body).toEqual({ ok: false, error: 'สำหรับผู้ดูแลระบบเท่านั้น' });
  });

  it('answers 403 to a student, with nothing about the tests', async () => {
    signInAs(STUDENT);
    const { status, body } = await ask();
    expect(status).toBe(403);
    expect(body).not.toHaveProperty('report');
  });

  it('gives an admin the last recorded run: its totals and every test by category', async () => {
    signInAs(ADMIN);
    const { status, body } = await ask();
    expect(status).toBe(200);
    const { report } = body;
    expect(Number.isNaN(Date.parse(report.ranAt))).toBe(false);
    expect(report.total).toBeGreaterThan(0);
    expect(report.passed + report.failed).toBeLessThanOrEqual(report.total);

    type File = { name: string; layer: string; note: string; tests: Array<{ section: string; title: string; status: string; ms: number | null }> };
    const files: File[] = report.categories.flatMap((c: { files: File[] }) => c.files);
    // Every file is in one category only, and every test is accounted for.
    expect(new Set(files.map(f => f.name)).size).toBe(files.length);
    expect(files).toHaveLength(report.files);
    expect(files.reduce((n, f) => n + f.tests.length, 0)).toBe(report.total);
    for (const category of report.categories) {
      expect(category.label).not.toBe('');
      expect(category.files.length).toBeGreaterThan(0);
    }
    for (const test of files.flatMap(f => f.tests)) {
      expect(test.title).not.toBe('');
      expect(['passed', 'failed', 'skipped']).toContain(test.status);
    }
  });

  it('files each test under what it is about', async () => {
    signInAs(ADMIN);
    const { report } = (await ask()).body;
    const where = (name: string) => report.categories.find((c: { files: Array<{ name: string }> }) => c.files.some(f => f.name === name))?.label;
    expect(where('physics.test.ts')).toBe('ฟิสิกส์และแบบจำลองสนาม');
    expect(where('sensor.test.ts')).toBe('เซนเซอร์และบันทึกการทดลอง');
    expect(where('api/hardware.test.ts')).toBe('อุปกรณ์และห้องแลป');
    expect(where('api/bookings.test.ts')).toBe('การจองและแดชบอร์ด');
    expect(where('api/admin.test.ts')).toBe('ผู้ดูแลระบบ');
  });
});
