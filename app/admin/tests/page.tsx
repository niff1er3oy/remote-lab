'use client';

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { animate, stagger } from 'animejs';
import DashboardNav from '@/app/components/DashboardNav';
import { prefersReducedMotion } from '@/lib/motion';

// The unit tests, for admins: every test by what it is about, with what its
// file checks, the group it sits in, whether it passed and how long it took.
// It shows the last run that `npm run test:report` recorded; nothing is run
// from here.

type Me = { name: string; email: string; role: string; is_admin?: boolean };
type Status = 'passed' | 'failed' | 'skipped';
type Test = { section: string; title: string; status: Status; ms: number | null; failure?: string };
type TestFile = { name: string; layer: string; note: string; crashed: string; tests: Test[] };
type Category = { label: string; about: string; files: TestFile[] };
type Report = { ranAt: string; seconds: number; total: number; passed: number; failed: number; files: number; categories: Category[] };
type Show = 'all' | 'failed';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400';
const PANEL = 'rounded-xl border border-white/10 bg-gray-900/50';
const STATUS_TEXT: Record<Status, { label: string; tone: string; dot: string }> = {
  passed: { label: 'ผ่าน', tone: 'text-[#c8ff00]', dot: 'bg-[#c8ff00]' },
  failed: { label: 'ไม่ผ่าน', tone: 'text-red-300', dot: 'bg-red-500' },
  skipped: { label: 'ข้าม', tone: 'text-gray-400', dot: 'bg-gray-500' },
};

const failedIn = (file: TestFile) => file.tests.filter(t => t.status === 'failed').length + (file.crashed ? 1 : 0);
const testsIn = (category: Category) => category.files.reduce((n, f) => n + f.tests.length, 0);
const failuresIn = (category: Category) => category.files.reduce((n, f) => n + failedIn(f), 0);
const timeOf = (file: TestFile) => file.tests.reduce((n, t) => n + (t.ms ?? 0), 0);
const whenText = (iso: string) => new Date(iso).toLocaleString('th-TH', { dateStyle: 'long', timeStyle: 'short', timeZone: 'Asia/Bangkok' });

/** What is left of a report when only the tests that match are kept. */
function narrowed(report: Report, query: string, show: Show): Category[] {
  const q = query.trim().toLowerCase();
  const wanted = (file: TestFile, t: Test) =>
    (show === 'all' || t.status === 'failed')
    && (!q || `${file.name} ${file.note} ${t.section} ${t.title}`.toLowerCase().includes(q));
  return report.categories
    .map(category => ({
      ...category,
      files: category.files
        .map(file => ({ ...file, tests: file.tests.filter(t => wanted(file, t)) }))
        // A file that could not be run has no tests to match, and is itself a failure.
        .filter(file => file.tests.length > 0 || (file.crashed && !q)),
    }))
    .filter(category => category.files.length > 0);
}

export default function AdminTestsPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState(false);
  const [report, setReport] = useState<Report | null>(null);
  const [loadError, setLoadError] = useState('');
  const [query, setQuery] = useState('');
  const [show, setShow] = useState<Show>('all');
  const [open, setOpen] = useState<Set<string>>(new Set());

  useEffect(() => {
    let stopped = false;
    (async () => {
      const res = await fetch('/api/auth/me').catch(() => null);
      if (stopped) return;
      if (!res || !res.ok) { router.replace('/login'); return; }
      const user: Me = (await res.json()).user;
      setMe(user);
      if (!user.is_admin) { setDenied(true); return; }
      const tests = await fetch('/api/admin/tests').catch(() => null);
      const data = tests ? await tests.json().catch(() => null) : null;
      if (stopped) return;
      if (tests?.ok && data?.report) {
        setReport(data.report);
        // A file with a failure in it starts open: that is what the page is opened for.
        setOpen(new Set((data.report as Report).categories.flatMap(c => c.files).filter(f => failedIn(f) > 0).map(f => f.name)));
      } else setLoadError(data?.error || 'โหลดผลการทดสอบไม่สำเร็จ');
    })();
    return () => { stopped = true; };
  }, [router]);

  // The page rises into place, the totals count up and each category's bar
  // fills to its share of tests that passed.
  const ready = !!report;
  useLayoutEffect(() => {
    const root = rootRef.current;
    if (!ready || !root || prefersReducedMotion()) return;
    const rise = animate(root.querySelectorAll('[data-rise]'), { opacity: [0, 1], translateY: [18, 0], duration: 520, delay: stagger(60), ease: 'outCubic' });
    const bars = animate(root.querySelectorAll('[data-bar]'), { scaleX: [0, 1], duration: 700, delay: stagger(60, { start: 250 }), ease: 'outCubic' });
    const counts = [...root.querySelectorAll<HTMLElement>('[data-count]')].map(el => {
      const to = Number(el.dataset.count);
      const tally = { v: 0 };
      return animate(tally, { v: to, duration: 700, ease: 'outCubic', onUpdate: () => { el.textContent = Math.round(tally.v).toLocaleString('th-TH'); } });
    });
    return () => { rise.pause(); bars.pause(); counts.forEach(c => c.pause()); };
  }, [ready]);

  const shown = useMemo(() => (report ? narrowed(report, query, show) : []), [report, query, show]);
  const shownTests = shown.reduce((n, c) => n + testsIn(c), 0);
  // While searching or looking at failures, what matched is laid open.
  const filtering = query.trim() !== '' || show === 'failed';

  const toggle = (name: string, panel: HTMLElement | null) => {
    setOpen(was => {
      const next = new Set(was);
      if (next.has(name)) next.delete(name); else next.add(name);
      return next;
    });
    // The list of a file just opened slides in from under its heading.
    if (panel && !open.has(name) && !prefersReducedMotion())
      requestAnimationFrame(() => {
        const list = panel.querySelector('[data-tests]');
        if (list) animate(list, { opacity: [0, 1], translateY: [-6, 0], duration: 260, ease: 'outCubic' });
      });
  };

  if (denied && me) {
    return (
      <div className="min-h-screen bg-[#030712] text-white">
        <DashboardNav user={me} />
        <main className="mx-auto max-w-md px-4 py-24 text-center">
          <h1 className="text-xl font-bold">หน้านี้สำหรับผู้ดูแลระบบ</h1>
          <p className="mt-2 text-sm text-gray-400">บัญชี {me.email} ไม่มีสิทธิ์เข้าหน้านี้</p>
          <Link href="/dashboard" className={`mt-6 inline-block rounded-full bg-[#c8ff00] px-5 py-2 text-sm font-semibold text-gray-950 hover:bg-white transition-colors ${FOCUS}`}>
            กลับแดชบอร์ด
          </Link>
        </main>
      </div>
    );
  }

  if (!me || !report) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-3 text-sm text-gray-400">
        {loadError
          ? <><p role="alert" className="text-red-300">{loadError}</p><Link href="/admin" className={`rounded-full border border-white/10 px-4 py-1.5 text-gray-200 hover:border-cyan-500/30 ${FOCUS}`}>กลับหน้าผู้ดูแลระบบ</Link></>
          : <svg className="animate-spin motion-reduce:animate-none text-[#c8ff00]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" role="status" aria-label="กำลังโหลด"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>}
      </div>
    );
  }

  const allPassed = report.failed === 0 && report.categories.every(c => c.files.every(f => !f.crashed));
  const totals = [
    { label: 'เทสต์ทั้งหมด', value: report.total, tone: 'text-white' },
    { label: 'ผ่าน', value: report.passed, tone: 'text-[#c8ff00]' },
    { label: 'ไม่ผ่าน', value: report.failed, tone: report.failed ? 'text-red-300' : 'text-gray-400' },
    { label: 'ไฟล์ทดสอบ', value: report.files, tone: 'text-white' },
  ];

  return (
    <div ref={rootRef} className="min-h-screen bg-[#030712] text-white">
      <DashboardNav user={me} />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 short:py-4">
        <header data-rise className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <Link href="/admin" className={`inline-flex h-6 items-center rounded text-sm text-cyan-400 underline-offset-4 hover:text-cyan-300 hover:underline ${FOCUS}`}>ผู้ดูแลระบบ</Link>
            <h1 className="mt-1 text-2xl font-bold short:text-xl">ผลการทดสอบ unit test</h1>
            <p className="mt-0.5 text-sm text-gray-400">
              รันล่าสุดเมื่อ {whenText(report.ranAt)} ใช้เวลา {report.seconds.toLocaleString('th-TH')} วินาที
            </p>
          </div>
          <p className={`rounded-full border px-4 py-1.5 text-sm font-semibold ${allPassed ? 'border-[#c8ff00]/40 text-[#c8ff00]' : 'border-red-400/40 text-red-300'}`}>
            {allPassed ? 'ผ่านทั้งหมด' : 'มีรายการไม่ผ่าน'}
          </p>
        </header>

        <dl data-rise className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {totals.map(t => (
            <div key={t.label} className={`${PANEL} px-4 py-3`}>
              <dt className="text-xs text-gray-500">{t.label}</dt>
              <dd className={`mt-0.5 font-mono text-2xl font-bold tabular-nums ${t.tone}`} data-count={t.value}>{t.value.toLocaleString('th-TH')}</dd>
            </div>
          ))}
        </dl>

        <p data-rise className="text-xs leading-5 text-gray-500">
          หน้านี้แสดงผลของการรันครั้งล่าสุดที่บันทึกไว้ด้วยคำสั่ง <code className="rounded bg-white/5 px-1.5 py-0.5 font-mono text-gray-300">npm run test:report</code> ไม่ได้รันเทสต์ใหม่ตอนเปิดหน้า
          ทุกเทสต์รันกับตัวจำลองของ Firebase ผู้ช่วย AI กล้อง และเครื่องแลป จึงไม่แตะระบบจริง ชื่อเทสต์เป็นประโยคภาษาอังกฤษที่บอกพฤติกรรมที่ตรวจ
        </p>

        <section data-rise aria-label="สรุปตามหมวดหมู่" className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          {report.categories.map(category => {
            const total = testsIn(category);
            const bad = failuresIn(category);
            return (
              <a
                key={category.label} href={`#${encodeURIComponent(category.label)}`}
                className={`${PANEL} block px-4 py-3 transition-colors hover:border-cyan-500/30 ${FOCUS}`}
              >
                <p className="text-sm font-semibold text-white">{category.label}</p>
                <p className="mt-0.5 font-mono text-xs tabular-nums text-gray-400">
                  {total.toLocaleString('th-TH')} เทสต์ · {category.files.length} ไฟล์
                  {bad > 0 && <span className="text-red-300"> · ไม่ผ่าน {bad}</span>}
                </p>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5" role="img" aria-label={`ผ่าน ${total - bad} จาก ${total}`}>
                  <div data-bar className={`h-full origin-left rounded-full ${bad ? 'bg-red-400' : 'bg-[#c8ff00]'}`} style={{ width: `${total ? ((total - bad) / total) * 100 : 0}%` }} />
                </div>
              </a>
            );
          })}
        </section>

        <div data-rise className={`${PANEL} flex flex-wrap items-center gap-3 px-4 py-3`}>
          <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-gray-400">
            <span className="shrink-0">ค้นหา</span>
            <input
              type="search" value={query} onChange={e => setQuery(e.target.value)}
              placeholder="ชื่อเทสต์ ไฟล์ หรือคำอธิบาย"
              className={`min-w-0 flex-1 rounded-lg border border-white/10 bg-gray-950 px-3 py-1.5 text-sm text-white placeholder:text-gray-600 ${FOCUS}`}
            />
          </label>
          <div role="group" aria-label="แสดงเทสต์" className="flex rounded-lg border border-white/10 p-0.5">
            {([['all', 'ทั้งหมด'], ['failed', 'เฉพาะที่ไม่ผ่าน']] as Array<[Show, string]>).map(([value, label]) => (
              <button
                key={value} type="button" aria-pressed={show === value} onClick={() => setShow(value)}
                className={`h-7 rounded-md px-3 text-xs font-semibold transition-colors ${FOCUS} ${show === value ? 'bg-[#c8ff00] text-gray-950' : 'text-gray-400 hover:text-white'}`}
              >
                {label}
              </button>
            ))}
          </div>
          <p role="status" className="font-mono text-xs tabular-nums text-gray-500">แสดง {shownTests.toLocaleString('th-TH')} เทสต์</p>
        </div>

        {shown.length === 0 && (
          <p className={`${PANEL} px-4 py-8 text-center text-sm text-gray-400`}>
            {show === 'failed' && !query.trim() ? 'ไม่มีเทสต์ที่ไม่ผ่าน' : 'ไม่พบเทสต์ที่ตรงกับคำค้น'}
          </p>
        )}

        {shown.map(category => (
          <section key={category.label} id={encodeURIComponent(category.label)} aria-labelledby={`h-${encodeURIComponent(category.label)}`} className="scroll-mt-20">
            <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
              <h2 id={`h-${encodeURIComponent(category.label)}`} className="text-base font-bold text-white">{category.label}</h2>
              <p className="text-xs text-gray-500">{category.about}</p>
            </div>
            <div className="flex flex-col gap-2">
              {category.files.map(file => {
                const bad = failedIn(file);
                const isOpen = filtering || open.has(file.name);
                return (
                  <article key={file.name} data-file={file.name} className={`${PANEL} overflow-hidden ${bad ? 'border-red-500/30' : ''}`}>
                    <h3>
                      <button
                        type="button" aria-expanded={isOpen} disabled={filtering}
                        onClick={e => toggle(file.name, e.currentTarget.closest('article'))}
                        className={`flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-left transition-colors enabled:hover:bg-white/[0.03] ${FOCUS}`}
                      >
                        <span className={`h-2 w-2 shrink-0 rounded-full ${bad ? 'bg-red-500' : 'bg-[#c8ff00]'}`} />
                        <span className="font-mono text-sm font-semibold text-white">{file.name}</span>
                        <span className="rounded-full border border-white/10 px-2 py-0.5 text-[11px] text-gray-400">{file.layer}</span>
                        <span className="ml-auto font-mono text-xs tabular-nums text-gray-400">
                          {file.tests.length} เทสต์ · {timeOf(file).toLocaleString('th-TH')} ms
                          {bad > 0 && <span className="text-red-300"> · ไม่ผ่าน {bad}</span>}
                        </span>
                        {file.note && <span className="basis-full text-sm text-gray-400">{file.note}</span>}
                      </button>
                    </h3>
                    {isOpen && <FileTests file={file} />}
                  </article>
                );
              })}
            </div>
          </section>
        ))}
      </main>
    </div>
  );
}

// The tests of one file, under the headings their file groups them by.
function FileTests({ file }: { file: TestFile }) {
  const sections: Array<{ name: string; tests: Test[] }> = [];
  for (const t of file.tests) {
    const last = sections[sections.length - 1];
    if (last && last.name === t.section) last.tests.push(t);
    else sections.push({ name: t.section, tests: [t] });
  }
  return (
    <div data-tests className="border-t border-white/5 px-4 py-3">
      {file.crashed && (
        <div role="alert" className="mb-3">
          <p className="text-sm text-red-300">ไฟล์นี้รันไม่ได้</p>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-red-200">{file.crashed}</pre>
        </div>
      )}
      {/* A file can come back to a group it left, so the name alone is not a key. */}
      {sections.map((section, i) => (
        <div key={`${i}:${section.name}`} className="mb-3 last:mb-0">
          <h4 className="text-xs font-semibold text-cyan-400">{section.name || 'ทั่วไป'}</h4>
          <ul className="mt-1">
            {section.tests.map((t, i) => {
              const look = STATUS_TEXT[t.status];
              return (
                <li key={i} className="border-b border-white/[0.04] py-1.5 last:border-0">
                  <div className="flex items-baseline gap-3 text-sm">
                    <span className={`flex w-16 shrink-0 items-center gap-1.5 text-xs font-semibold ${look.tone}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
                      {look.label}
                    </span>
                    <span className="min-w-0 flex-1 text-gray-200">{t.title}</span>
                    <span className="shrink-0 font-mono text-xs tabular-nums text-gray-500">{t.ms === null ? '' : `${t.ms.toLocaleString('th-TH')} ms`}</span>
                  </div>
                  {t.failure && <pre className="mt-1.5 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs leading-5 text-red-200">{t.failure}</pre>}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
