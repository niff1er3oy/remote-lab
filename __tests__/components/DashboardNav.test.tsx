import { fireEvent, render, screen } from '@testing-library/react';
import DashboardNav from '@/app/components/DashboardNav';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';

jest.mock('next/navigation', () => ({ useRouter: jest.fn() }));

const navigation = jest.requireMock<{ useRouter: jest.Mock }>('next/navigation');
const router = { replace: jest.fn(), push: jest.fn() };

const alice = { name: 'alice Example', email: 'alice@example.com', role: 'student' };

const menuButton = () => screen.getByRole('button', { name: /alice Example/ });
const logoutButton = () => screen.getByRole('button', { name: 'ออกจากระบบ' });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  navigation.useRouter.mockReturnValue(router);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('DashboardNav', () => {
  it('links the logo to the landing page', () => {
    render(<DashboardNav user={alice} />);
    expect(screen.getByRole('link', { name: /PaNa/ })).toHaveAttribute('href', '/');
    expect(screen.getByRole('img', { name: 'PaNa LabS' })).toBeInTheDocument();
  });

  it('shows the user\'s name with their initial in capitals', () => {
    render(<DashboardNav user={alice} />);
    expect(menuButton()).toHaveTextContent(/^Aalice Example$/);
  });

  it('keeps the menu closed until the user\'s name is clicked', () => {
    render(<DashboardNav user={alice} />);
    expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'แดชบอร์ด' })).not.toBeInTheDocument();

    fireEvent.click(menuButton());

    expect(logoutButton()).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'แดชบอร์ด' })).toHaveAttribute('href', '/dashboard');
  });

  it('closes the menu when the name is clicked again', () => {
    render(<DashboardNav user={alice} />);

    fireEvent.click(menuButton());
    fireEvent.click(menuButton());

    expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
  });

  it('closes the menu when the page behind it is clicked', () => {
    render(<DashboardNav user={alice} />);
    fireEvent.click(menuButton());

    // The click-away layer has no role or text.
    fireEvent.click(document.querySelector('.fixed.inset-0') as HTMLElement);

    expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
  });

  it('closes the menu when the dashboard link is followed', () => {
    render(<DashboardNav user={alice} />);
    fireEvent.click(menuButton());

    fireEvent.click(screen.getByRole('link', { name: 'แดชบอร์ด' }));

    expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
  });

  it.each([
    ['student', 'นักศึกษา'],
    ['researcher', 'นักวิจัย'],
    ['instructor', 'อาจารย์'],
    ['other', 'ผู้ใช้ทั่วไป'],
  ])('names the %s role in Thai', (role, label) => {
    render(<DashboardNav user={{ ...alice, role }} />);
    fireEvent.click(menuButton());
    expect(screen.getByText(label)).toBeInTheDocument();
  });

  it('shows a role it has no Thai name for as it is', () => {
    render(<DashboardNav user={{ ...alice, role: 'admin' }} />);
    fireEvent.click(menuButton());
    expect(screen.getByText('admin')).toBeInTheDocument();
  });

  it('renders for a user with an empty name', () => {
    render(<DashboardNav user={{ ...alice, name: '' }} />);
    expect(screen.getByRole('link', { name: /PaNa/ })).toBeInTheDocument();
  });

  describe('the admin link', () => {
    const adminLink = () => screen.queryByRole('link', { name: 'ผู้ดูแลระบบ' });

    it('is in the menu of an administrator and leads to the admin page', () => {
      render(<DashboardNav user={{ ...alice, is_admin: true }} />);
      expect(adminLink()).not.toBeInTheDocument();

      fireEvent.click(menuButton());

      expect(adminLink()).toHaveAttribute('href', '/admin');
    });

    it.each([
      ['is not an administrator', { ...alice, is_admin: false }],
      ['carries no administrator flag', alice],
    ])('is not in the menu of a user who %s', (_label, user) => {
      render(<DashboardNav user={user} />);
      fireEvent.click(menuButton());

      expect(adminLink()).not.toBeInTheDocument();
      expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/', '/dashboard']);
    });

    it('does not depend on the role: an instructor without the flag gets no link, a student with it does', () => {
      const { unmount } = render(<DashboardNav user={{ ...alice, role: 'instructor' }} />);
      fireEvent.click(menuButton());
      expect(adminLink()).not.toBeInTheDocument();
      unmount();

      render(<DashboardNav user={{ ...alice, role: 'student', is_admin: true }} />);
      fireEvent.click(menuButton());
      expect(adminLink()).toBeInTheDocument();
    });

    it('sits between the dashboard link and the sign-out button', () => {
      render(<DashboardNav user={{ ...alice, is_admin: true }} />);
      fireEvent.click(menuButton());

      expect(screen.getAllByRole('link').map(link => link.getAttribute('href'))).toEqual(['/', '/dashboard', '/admin']);
      expect(adminLink()!.compareDocumentPosition(logoutButton()) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    });

    it('closes the menu when it is followed', () => {
      render(<DashboardNav user={{ ...alice, is_admin: true }} />);
      fireEvent.click(menuButton());

      fireEvent.click(adminLink()!);

      expect(adminLink()).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'ออกจากระบบ' })).not.toBeInTheDocument();
    });

    it('leaves signing out working for an administrator', async () => {
      const net = mockFetch(() => ({ body: { ok: true } }));
      render(<DashboardNav user={{ ...alice, is_admin: true }} />);
      fireEvent.click(menuButton());

      fireEvent.click(logoutButton());
      await advance();

      expect(net.requests()).toEqual(['POST /api/auth/logout']);
      expect(router.replace).toHaveBeenCalledWith('/login');
    });
  });

  it('signs out on the server and then goes to the login page', async () => {
    const net = mockFetch(() => ({ body: { ok: true } }));
    render(<DashboardNav user={alice} />);
    fireEvent.click(menuButton());

    fireEvent.click(logoutButton());
    await advance();

    expect(net.calls).toEqual([{ method: 'POST', url: '/api/auth/logout', body: undefined }]);
    expect(router.replace).toHaveBeenCalledTimes(1);
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('waits for the server to answer before leaving the page', async () => {
    let answer!: (reply: Reply) => void;
    mockFetch(() => new Promise<Reply>(resolve => { answer = resolve; }));
    render(<DashboardNav user={alice} />);
    fireEvent.click(menuButton());

    fireEvent.click(logoutButton());
    await advance();
    expect(router.replace).not.toHaveBeenCalled();

    answer({ body: { ok: true } });
    await advance();
    expect(router.replace).toHaveBeenCalledWith('/login');
  });
});
