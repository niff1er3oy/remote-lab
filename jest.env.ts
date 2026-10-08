// Runs before each test file is loaded. next/jest reads .env into process.env,
// and .env holds the real credentials. No test may be able to use them, so they
// are replaced here with values that work nowhere.
Object.assign(process.env, {
  FIREBASE_ADMIN_PROJECT_ID: 'test-project',
  FIREBASE_ADMIN_CLIENT_EMAIL: 'test@test.invalid',
  FIREBASE_ADMIN_PRIVATE_KEY: 'test-private-key',
  TYPHOON_API_KEY: 'test-typhoon-key',
  cam1: 'http://camera.invalid/camera1',
  cam2: 'http://camera.invalid/camera2',
  cam3: 'http://camera.invalid/camera3',
  CAM_USER: 'test-user',
  CAM_PASSWORD: 'test-password',
  ADMIN_EMAILS: 'admin@example.com, Second.Admin@Example.com',
  RIG_SCRIPT_DIR: '/home/admin/Documents',
  RIG_PYTHON: '',
});
