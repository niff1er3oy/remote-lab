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
