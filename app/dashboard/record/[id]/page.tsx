'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { animate } from 'animejs';
import LabSummary from '@/app/lab/LabSummary';
import type { LabEvent } from '@/lib/lab-activity';
import { prefersReducedMotion } from '@/lib/motion';

// The summary of a past visit, opened from the dashboard's history: the same
// screen the lab room shows on finishing, drawn from the record that was saved
// then.

type Loaded =
  | { state: 'loading' }
  | { state: 'ready'; events: LabEvent[]; experimentName: string }
  | { state: 'missing' | 'signed-out' | 'failed' };

const MESSAGE = {
  missing: 'ไม่พบบันทึกของรอบนี้ รอบที่ทดลองก่อนมีการเก็บบันทึก หรือรอบที่ไม่ได้เข้าห้องแลป จะไม่มีสรุปให้ดู',
  'signed-out': 'กรุณาเข้าสู่ระบบก่อน จึงจะเปิดสรุปการทดลองได้',
  failed: 'เปิดบันทึกไม่ได้ในตอนนี้ ลองใหม่อีกครั้ง',
};

export default function LabRecordPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<Loaded>({ state: 'loading' });
  const [attempt, setAttempt] = useState(0);
  const noticeRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let gone = false;
    fetch(`/api/lab/record?booking=${encodeURIComponent(id)}`)
      .then(async (res) => {
        const data = await res.json().catch(() => null);
        if (gone) return;
        if (res.ok && data?.ok && Array.isArray(data.events) && data.events.length)
          setLoaded({ state: 'ready', events: data.events, experimentName: data.experiment_name || 'การทดลอง' });
        else setLoaded({ state: res.status === 401 ? 'signed-out' : res.status === 404 || res.ok ? 'missing' : 'failed' });
      })
      .catch(() => { if (!gone) setLoaded({ state: 'failed' }); });
    return () => { gone = true; };
  }, [id, attempt]);

  // What is shown instead of a summary rises into place.
  const settled = loaded.state !== 'loading' && loaded.state !== 'ready';
  useLayoutEffect(() => {
    if (!settled || !noticeRef.current || prefersReducedMotion()) return;
    const rise = animate(noticeRef.current, { opacity: [0, 1], translateY: [14, 0], duration: 460, ease: 'outCubic' });
    return () => { rise.pause(); };
  }, [settled]);

  if (loaded.state === 'ready')
    return <LabSummary events={loaded.events} experimentName={loaded.experimentName} onLeave={() => router.push('/dashboard')} />;

  return (
    <main className="flex min-h-screen items-center justify-center bg-[#030712] px-6 text-white">
      {loaded.state === 'loading' ? (
        <svg className="animate-spin motion-reduce:animate-none text-[#c8ff00]" width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" role="status" aria-label="กำลังเปิดสรุปการทดลอง">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      ) : (
        <div ref={noticeRef} role={loaded.state === 'failed' ? 'alert' : 'status'} className="max-w-md rounded-2xl border border-white/10 bg-gray-900/50 px-6 py-7 text-center">
          <h1 className="text-lg font-bold text-white">สรุปการทดลอง</h1>
          <p className="mt-2 text-sm leading-6 text-gray-400">{MESSAGE[loaded.state]}</p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            {loaded.state === 'failed' && (
              <button
                onClick={() => { setLoaded({ state: 'loading' }); setAttempt(n => n + 1); }}
                className="rounded-full bg-[#c8ff00] px-5 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#c8ff00]"
              >
                ลองใหม่
              </button>
            )}
            <Link
              href={loaded.state === 'signed-out' ? '/login' : '/dashboard'}
              className="rounded-full border border-white/10 px-5 py-2 text-sm text-gray-300 transition-colors hover:border-cyan-500/30 hover:text-white focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400"
            >
              {loaded.state === 'signed-out' ? 'เข้าสู่ระบบ' : 'กลับแดชบอร์ด'}
            </Link>
          </div>
        </div>
      )}
    </main>
  );
}
