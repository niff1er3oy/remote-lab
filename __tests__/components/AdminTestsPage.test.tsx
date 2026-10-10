import { fireEvent, render, screen, within } from '@testing-library/react';
import AdminTestsPage from '@/app/admin/tests/page';
import type { AnimeMock } from '../helpers/client/anime';
import { advance, mockFetch, type Reply } from '../helpers/client/fetch';
import { installMatchMedia } from '../helpers/client/matchMedia';

jest.mock('animejs', () => jest.requireActual<typeof import('../helpers/client/anime')>('../helpers/client/anime').animeMock());
// The page's effect depends on the router, so every render must get the same one.
jest.mock('next/navigation', () => {
  const router = { replace: jest.fn() };
  return { useRouter: () => router };
});
jest.mock('../../app/components/DashboardNav', () => ({
  __esModule: true,
  default: ({ user }: { user: { name: string } }) => <nav>signed in as {user.name}</nav>,
}));

const anime = jest.requireMock<AnimeMock>('animejs');
const router = jest.requireMock<{ useRouter: () => { replace: jest.Mock } }>('next/navigation').useRouter();
const REDUCED = '(prefers-reduced-motion: reduce)';

const ADMIN = { name: 'Ada Admin', email: 'ada@example.com', role: 'admin', is_admin: true };
const STUDENT = { name: 'Sam Student', email: 'sam@example.com', role: 'student', is_admin: false };

const passed = (section: string, title: string, ms = 3) => ({ section, title, status: 'passed', ms });
const REPORT = {
  ranAt: '2026-10-09T03:00:00.000Z', seconds: 14.6, total: 6, passed: 5, failed: 1, files: 3,
  categories: [
    {
      label: 'ฟิสิกส์และแบบจำลองสนาม', about: 'สูตรสนามแม่เหล็ก',
      files: [{
        name: 'physics.test.ts', layer: 'ไลบรารีและตรรกะกลาง', note: 'สูตรสนามแม่เหล็กของขดลวดเดี่ยว', crashed: '',
        tests: [passed('calcBCoil', 'gives the field at the centre of one turn', 2), passed('calcBCoil', 'doubles with the turns'), passed('calcBSolenoid', 'is strongest at the middle')],
      }],
    },
    {
      label: 'อุปกรณ์และห้องแลป', about: 'การสั่งชุดทดลอง',
      files: [
        {
          name: 'api/hardware.test.ts', layer: 'API ฝั่งเซิร์ฟเวอร์', note: 'API สั่งอุปกรณ์', crashed: '',
          tests: [
            passed('POST /api/hardware', 'refuses a script that is not on the list'),
            { section: 'POST /api/hardware', title: 'cuts the circuit after the round ends', status: 'failed', ms: 41, failure: 'Expected: 200\nReceived: 403' },
          ],
        },
        { name: 'rig.test.ts', layer: 'ไลบรารีและตรรกะกลาง', note: 'ตัวรันสคริปต์อุปกรณ์', crashed: '', tests: [passed('runRigScript', 'runs without a shell')] },
      ],
    },
  ],
};

type Server = { user: typeof ADMIN | null; tests: Reply };

async function show(server: Partial<Server> = {}) {
  const state: Server = { user: ADMIN, tests: { body: { ok: true, report: REPORT } }, ...server };
  const net = mockFetch(({ url }) => {
    if (url === '/api/auth/me') return state.user ? { body: { user: state.user } } : { status: 401 };
    if (url === '/api/admin/tests') return state.tests;
    return { status: 404 };
  });
  const view = render(<AdminTestsPage />);
  await advance();
  return { net, ...view };
}

const file = (name: string) => document.querySelector(`[data-file="${name}"]`) as HTMLElement;
const titles = () => [...document.querySelectorAll('[data-tests] li')].map(li => li.textContent);

beforeEach(() => {
  jest.useFakeTimers();
  installMatchMedia();
});

afterEach(() => {
  jest.useRealTimers();
  jest.clearAllMocks();
});

describe('AdminTestsPage — who may see it', () => {
  it('sends someone who is not signed in to the login page, and asks for no tests', async () => {
    const { net } = await show({ user: null });
    expect(router.replace).toHaveBeenCalledWith('/login');
    expect(net.requests()).toEqual(['GET /api/auth/me']);
  });

  it('tells a student the page is for admins, and asks for no tests', async () => {
    const { net } = await show({ user: STUDENT });
    expect(screen.getByRole('heading', { name: 'หน้านี้สำหรับผู้ดูแลระบบ' })).toBeInTheDocument();
    expect(net.requests()).toEqual(['GET /api/auth/me']);
    expect(screen.queryByText('physics.test.ts')).not.toBeInTheDocument();
  });

  it('says so when the tests cannot be loaded, with a way back', async () => {
    await show({ tests: { status: 500, body: { ok: false, error: 'โหลดไม่ได้' } } });
    expect(screen.getByRole('alert')).toHaveTextContent('โหลดไม่ได้');
    expect(screen.getByRole('link', { name: 'กลับหน้าผู้ดูแลระบบ' })).toHaveAttribute('href', '/admin');
  });
});

describe('AdminTestsPage — the run', () => {
  it('shows the totals, when the tests were run and that some did not pass', async () => {
    await show();
    const figure = (label: string) => screen.getByText(label, { selector: 'dt' }).nextElementSibling;
    expect(figure('เทสต์ทั้งหมด')).toHaveTextContent('6');
    expect(figure('ผ่าน')).toHaveTextContent('5');
    expect(figure('ไม่ผ่าน')).toHaveTextContent('1');
    expect(figure('ไฟล์ทดสอบ')).toHaveTextContent('3');
    expect(screen.getByText(/รันล่าสุดเมื่อ 9 ตุลาคม 2569/)).toBeInTheDocument();
    expect(screen.getByText('มีรายการไม่ผ่าน')).toBeInTheDocument();
  });

  it('says every test passed when none failed', async () => {
    const clean = { ...REPORT, passed: 6, failed: 0, categories: [REPORT.categories[0]] };
    await show({ tests: { body: { ok: true, report: clean } } });
    expect(screen.getByText('ผ่านทั้งหมด')).toBeInTheDocument();
  });

  it('says the page shows a recorded run and runs nothing itself', async () => {
    await show();
    expect(screen.getByText(/ไม่ได้รันเทสต์ใหม่ตอนเปิดหน้า/)).toBeInTheDocument();
    expect(screen.getByText('npm run test:report')).toBeInTheDocument();
  });
});

describe('AdminTestsPage — by category', () => {
  it('summarises each category: its tests, its files, and how many failed', async () => {
    await show();
    const summary = screen.getByRole('region', { name: 'สรุปตามหมวดหมู่' });
    const [physics, rig] = within(summary).getAllByRole('link');
    expect(physics).toHaveTextContent('ฟิสิกส์และแบบจำลองสนาม');
    expect(physics).toHaveTextContent('3 เทสต์ · 1 ไฟล์');
    expect(physics).not.toHaveTextContent('ไม่ผ่าน');
    expect(rig).toHaveTextContent('3 เทสต์ · 2 ไฟล์ · ไม่ผ่าน 1');
    expect(within(rig).getByRole('img')).toHaveAccessibleName('ผ่าน 2 จาก 3');
    expect(rig).toHaveAttribute('href', `#${encodeURIComponent('อุปกรณ์และห้องแลป')}`);
  });

  it('lists every file under its category, with what it checks, its layer, count and time', async () => {
    await show();
    const section = screen.getByRole('region', { name: 'ฟิสิกส์และแบบจำลองสนาม' });
    expect(within(section).getByText('สูตรสนามแม่เหล็ก')).toBeInTheDocument();
    const row = file('physics.test.ts');
    expect(row).toHaveTextContent('สูตรสนามแม่เหล็กของขดลวดเดี่ยว');
    expect(row).toHaveTextContent('ไลบรารีและตรรกะกลาง');
    expect(row).toHaveTextContent('3 เทสต์ · 8 ms');
  });

  it('opens a file with a failure in it from the start, and leaves the others closed', async () => {
    await show();
    expect(within(file('api/hardware.test.ts')).getByRole('button')).toHaveAttribute('aria-expanded', 'true');
    expect(within(file('physics.test.ts')).getByRole('button')).toHaveAttribute('aria-expanded', 'false');
    expect(file('physics.test.ts').querySelector('[data-tests]')).not.toBeInTheDocument();
  });

  it('shows a failed test with why it failed', async () => {
    await show();
    const failed = within(file('api/hardware.test.ts')).getByText('cuts the circuit after the round ends').closest('li') as HTMLElement;
    expect(failed).toHaveTextContent('ไม่ผ่าน');
    expect(failed).toHaveTextContent('41 ms');
    expect(failed.querySelector('pre')).toHaveTextContent('Expected: 200 Received: 403');
  });

  it('shows a group twice when the file comes back to it, without mixing the two up', async () => {
    const back = {
      ...REPORT,
      categories: [{
        label: 'ฟิสิกส์และแบบจำลองสนาม', about: '',
        files: [{ name: 'physics.test.ts', layer: 'ไลบรารีและตรรกะกลาง', note: '', crashed: '', tests: [passed('coil', 'first'), passed('solenoid', 'second'), passed('coil', 'third')] }],
      }],
    };
    const errors = jest.spyOn(console, 'error').mockImplementation(() => {});
    await show({ tests: { body: { ok: true, report: back } } });
    fireEvent.click(within(file('physics.test.ts')).getByRole('button'));
    expect(within(file('physics.test.ts')).getAllByRole('heading', { level: 4 }).map(h => h.textContent)).toEqual(['coil', 'solenoid', 'coil']);
    expect(titles().map(text => text?.replace(/ผ่าน|\d+ ms/g, ''))).toEqual(['first', 'second', 'third']);
    // React warns on the console about two children with one key.
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it('opens a file to its tests, grouped as the file groups them, and closes it again', async () => {
    await show();
    const button = within(file('physics.test.ts')).getByRole('button');
    fireEvent.click(button);
    expect(button).toHaveAttribute('aria-expanded', 'true');
    const groups = within(file('physics.test.ts')).getAllByRole('heading', { level: 4 }).map(h => h.textContent);
    expect(groups).toEqual(['calcBCoil', 'calcBSolenoid']);
    expect(within(file('physics.test.ts')).getByText('doubles with the turns').closest('li')).toHaveTextContent('ผ่าน');
    fireEvent.click(button);
    expect(file('physics.test.ts').querySelector('[data-tests]')).not.toBeInTheDocument();
  });
});

describe('AdminTestsPage — finding a test', () => {
  it('keeps only the tests that match what is typed, laid open, and says how many', async () => {
    await show();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'shell' } });
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain('runs without a shell');
    expect(screen.getByText('แสดง 1 เทสต์')).toBeInTheDocument();
    expect(screen.queryByText('physics.test.ts')).not.toBeInTheDocument();
  });

  it('matches a file\'s name and what it checks as well as a test\'s own words', async () => {
    await show();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'API สั่งอุปกรณ์' } });
    expect(titles()).toHaveLength(2);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'PHYSICS.test' } });
    expect(titles()).toHaveLength(3);
  });

  it('says nothing was found for words no test has', async () => {
    await show();
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'zzz' } });
    expect(screen.getByText('ไม่พบเทสต์ที่ตรงกับคำค้น')).toBeInTheDocument();
    expect(screen.getByText('แสดง 0 เทสต์')).toBeInTheDocument();
  });

  it('shows only the tests that failed when asked to', async () => {
    await show();
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะที่ไม่ผ่าน' }));
    expect(titles()).toHaveLength(1);
    expect(titles()[0]).toContain('cuts the circuit after the round ends');
    expect(screen.getByRole('button', { name: 'เฉพาะที่ไม่ผ่าน' })).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(screen.getByRole('button', { name: 'ทั้งหมด' }));
    expect(screen.getByText('แสดง 6 เทสต์')).toBeInTheDocument();
  });

  it('says there are none when asked for failures and every test passed', async () => {
    const clean = { ...REPORT, passed: 3, failed: 0, total: 3, files: 1, categories: [REPORT.categories[0]] };
    await show({ tests: { body: { ok: true, report: clean } } });
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะที่ไม่ผ่าน' }));
    expect(screen.getByText('ไม่มีเทสต์ที่ไม่ผ่าน')).toBeInTheDocument();
  });
});

describe('AdminTestsPage — a file that could not be run', () => {
  const crashed = {
    ...REPORT,
    categories: [{ label: 'ผู้ช่วย AI', about: 'API ผู้ช่วยสอน', files: [{ name: 'api/chat.test.ts', layer: 'API ฝั่งเซิร์ฟเวอร์', note: '', crashed: 'SyntaxError: Unexpected token', tests: [] }] }],
  };

  it('counts as a failure, starts open and shows what stopped it', async () => {
    await show({ tests: { body: { ok: true, report: crashed } } });
    expect(file('api/chat.test.ts')).toHaveTextContent('ไม่ผ่าน 1');
    expect(within(file('api/chat.test.ts')).getByRole('alert')).toHaveTextContent('SyntaxError: Unexpected token');
    expect(screen.getByText('มีรายการไม่ผ่าน')).toBeInTheDocument();
  });

  it('stays in the list when only failures are shown', async () => {
    await show({ tests: { body: { ok: true, report: crashed } } });
    fireEvent.click(screen.getByRole('button', { name: 'เฉพาะที่ไม่ผ่าน' }));
    expect(file('api/chat.test.ts')).toBeInTheDocument();
  });
});

describe('AdminTestsPage — motion', () => {
  it('brings the page in, counts the totals up and fills the bars', async () => {
    await show();
    const props = anime.animate.mock.calls.map(call => Object.keys((call as unknown[])[1] as object).join(','));
    expect(props.some(p => p.includes('translateY'))).toBe(true);
    expect(props.some(p => p.includes('scaleX'))).toBe(true);
    expect(props.filter(p => p.startsWith('v,')).length).toBe(4);
  });

  it('keeps everything still for someone who asked for reduced motion', async () => {
    installMatchMedia({ [REDUCED]: true });
    await show();
    fireEvent.click(within(file('physics.test.ts')).getByRole('button'));
    expect(anime.animate).not.toHaveBeenCalled();
  });
});
