/** @jest-environment node */
import { GET } from '@/app/api/db-test/route';
import { breakDb, LAB8, resetDb, seed } from '../helpers/server/firestore';

jest.mock('@/lib/firebase-admin', () => ({
  adminDb: jest.requireActual<typeof import('../helpers/server/firestore')>('../helpers/server/firestore').db,
}));

beforeEach(resetDb);

describe('GET /api/db-test', () => {
  it('lists the code and Thai name of the labs it can read', async () => {
    seed('labs', 'LAB8', { ...LAB8, name_en: 'Magnetic field', duration_minutes: 120 });
    const res = await GET();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ok: true,
      labs: [{ code: 'LAB8', name_th: 'สนามแม่เหล็กและกฎของไบโอต-ซาวัต' }],
    });
  });

  it('answers with an empty list when there are no labs', async () => {
    expect(await (await GET()).json()).toEqual({ ok: true, labs: [] });
  });

  it('lists at most five labs', async () => {
    for (let i = 1; i <= 7; i++) seed('labs', `LAB${i}`, { code: `LAB${i}`, name_th: `การทดลองที่ ${i}`, is_active: true });
    expect((await (await GET()).json()).labs).toHaveLength(5);
  });

  it('answers 500 with ok: false when Firestore cannot be reached', async () => {
    breakDb();
    const res = await GET();
    expect(res.status).toBe(500);
    expect((await res.json()).ok).toBe(false);
  });
});
