import { fireEvent, render, screen } from '@testing-library/react';
import LoginPage from '@/app/login/page';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());
jest.mock('@/lib/firebase-client', () => ({ auth: {} }));
jest.mock('firebase/auth', () => ({
  signInWithPopup: jest.fn(),
  GoogleAuthProvider: class GoogleAuthProvider {},
}));

const firebaseAuth = jest.requireMock<{ signInWithPopup: jest.Mock }>('firebase/auth');

const GENERIC = 'ไม่สามารถเชื่อมต่อได้ กรุณาลองใหม่';
const POPUP_CLOSED = 'ปิดหน้าต่างเข้าสู่ระบบก่อนดำเนินการเสร็จสิ้น';

const googleButton = () => screen.getByRole('button', { name: 'เข้าสู่ระบบด้วย Google' });

function popupSucceeds() {
  firebaseAuth.signInWithPopup.mockResolvedValue({ user: { getIdToken: async () => 'id-token' } });
}

function popupFails(code: string) {
  firebaseAuth.signInWithPopup.mockRejectedValue(Object.assign(new Error(code), { code }));
}

// jsdom cannot follow a redirect and does not let window.location be replaced;
// it reports "Not implemented: navigation" on console.error instead. That
// report is the only sign of a redirect a test can see here, and it does not
// say where to.
let consoleError: jest.SpyInstance;
const navigations = () => consoleError.mock.calls.filter(args => /not implemented: navigation/i.test(String(args[0]?.message ?? args[0])));

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  consoleError = jest.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
  jest.useRealTimers();
});

describe('LoginPage', () => {
  it('offers Google as the way to sign in', () => {
    render(<LoginPage />);

    expect(screen.getByRole('heading', { level: 1, name: 'เข้าสู่ระบบ' })).toBeInTheDocument();
    expect(googleButton()).toBeEnabled();
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('tells first-time visitors that an account is created for them', () => {
    render(<LoginPage />);
    expect(screen.getByText('เข้าใช้งานครั้งแรก ระบบจะสร้างบัญชีให้อัตโนมัติ')).toBeInTheDocument();
  });

  it('links the logo back to the landing page', () => {
    render(<LoginPage />);
    expect(screen.getByRole('link', { name: /PaNa/ })).toHaveAttribute('href', '/');
  });

  it('opens the Google popup only when the button is clicked', async () => {
    popupSucceeds();
    mockFetch(() => ({ body: { ok: true } }));
    render(<LoginPage />);
    await advance();
    expect(firebaseAuth.signInWithPopup).not.toHaveBeenCalled();

    fireEvent.click(googleButton());
    await advance();

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
  });

  it('creates the session and then leaves the page', async () => {
    popupSucceeds();
    const net = mockFetch(() => ({ body: { ok: true } }));
    render(<LoginPage />);

    fireEvent.click(googleButton());
    await advance();

    expect(net.calls).toEqual([{ method: 'POST', url: '/api/auth/session', body: { idToken: 'id-token' } }]);
    expect(navigations()).toHaveLength(1);
    expect(screen.queryByText(GENERIC)).not.toBeInTheDocument();
  });

  it('cannot be clicked twice while signing in is under way', async () => {
    let answer!: (reply: Reply) => void;
    popupSucceeds();
    const net = mockFetch(() => new Promise<Reply>(resolve => { answer = resolve; }));
    render(<LoginPage />);

    fireEvent.click(googleButton());
    await advance();
    expect(googleButton()).toBeDisabled();
    fireEvent.click(googleButton());
    await advance();

    expect(firebaseAuth.signInWithPopup).toHaveBeenCalledTimes(1);
    expect(net.calls).toHaveLength(1);
    expect(navigations()).toHaveLength(0);

    answer({ body: { ok: true } });
    await advance();
    expect(navigations()).toHaveLength(1);
  });

  it('explains that the popup was closed, stays on the page and lets the visitor try again', async () => {
    popupFails('auth/popup-closed-by-user');
    const net = mockFetch(() => ({ body: { ok: true } }));
    render(<LoginPage />);

    fireEvent.click(googleButton());
    await advance();

    expect(screen.getByText(POPUP_CLOSED)).toBeInTheDocument();
    expect(googleButton()).toBeEnabled();
    expect(net.calls).toEqual([]);
    expect(navigations()).toHaveLength(0);
  });

  it('shows a general error and stays on the page when the server refuses the session', async () => {
    popupSucceeds();
    mockFetch(() => ({ status: 401, body: { error: 'invalid token' } }));
    render(<LoginPage />);

    fireEvent.click(googleButton());
    await advance();

    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(googleButton()).toBeEnabled();
    expect(navigations()).toHaveLength(0);
  });

  it('shows a general error when the server cannot be reached', async () => {
    popupSucceeds();
    mockFetch(() => { throw new Error('offline'); });
    render(<LoginPage />);

    fireEvent.click(googleButton());
    await advance();

    expect(screen.getByText(GENERIC)).toBeInTheDocument();
    expect(navigations()).toHaveLength(0);
  });

  it('clears the previous error as soon as the visitor tries again', async () => {
    let answer!: (reply: Reply) => void;
    popupFails('auth/popup-closed-by-user');
    mockFetch(() => new Promise<Reply>(resolve => { answer = resolve; }));
    render(<LoginPage />);
    fireEvent.click(googleButton());
    await advance();
    expect(screen.getByText(POPUP_CLOSED)).toBeInTheDocument();

    popupSucceeds();
    fireEvent.click(googleButton());
    await advance();

    expect(screen.queryByText(POPUP_CLOSED)).not.toBeInTheDocument();
    answer({ body: { ok: true } });
    await advance();
  });
});
