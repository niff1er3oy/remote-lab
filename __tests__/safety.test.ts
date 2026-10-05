/** @jest-environment node */
import { adminAuth, adminDb } from '@/lib/firebase-admin';

// The guards in jest.env.ts and jest.setup.ts: a test that forgets to mock
// something must fail loudly instead of reaching the real project.
describe('the test run is cut off from real services', () => {
  it('runs with test credentials, not the ones in .env', () => {
    expect(process.env.FIREBASE_ADMIN_PROJECT_ID).toBe('test-project');
    expect(process.env.FIREBASE_ADMIN_PRIVATE_KEY).toBe('test-private-key');
    expect(process.env.TYPHOON_API_KEY).toBe('test-typhoon-key');
    expect(process.env.cam1).toBe('http://camera.invalid/camera1');
    expect(process.env.CAM_PASSWORD).toBe('test-password');
  });

  it('refuses Firestore and Firebase Auth unless the test mocks them', () => {
    expect(() => adminDb.collection('bookings')).toThrow(/without a mock/);
    expect(() => adminAuth.verifySessionCookie('anything')).toThrow(/without a mock/);
  });

  it('refuses network requests unless the test mocks fetch', async () => {
    await expect(fetch('https://example.com/')).rejects.toThrow(/without a mock/);
  });
});
