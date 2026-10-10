'use client';

import { useLayoutEffect, useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import { prefersReducedMotion, press } from '@/lib/motion';

// The admin's check of the lab machine itself: the button asks the server to
// look at the rig's scripts, the sensor, the cameras and the database, and
// lists what it found, one line per thing checked. Unlike the unit tests, this
// is the real machine.

type Check = { id: string; group: string; label: string; ok: boolean | null; detail: string };
type Result = { ready: boolean; checkedAt: string; checks: Check[] };

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400';
const LOOK = {
  pass: { word: 'พร้อม', tone: 'text-[#c8ff00]', dot: 'bg-[#c8ff00]' },
  fail: { word: 'ไม่พร้อม', tone: 'text-red-300', dot: 'bg-red-500' },
  skip: { word: 'ไม่ได้ตรวจ', tone: 'text-gray-400', dot: 'bg-gray-500' },
};
const lookOf = (ok: boolean | null) => (ok === true ? LOOK.pass : ok === false ? LOOK.fail : LOOK.skip);
const timeText = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', second: '2-digit', timeZone: 'Asia/Bangkok' });

export default function ReadinessCheck() {
  const rootRef = useRef<HTMLElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState('');

  async function check() {
    setChecking(true);
    setError('');
    try {
      const res = await fetch('/api/admin/readiness', { method: 'POST' });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.ok) {
        setResult(data);
        if (buttonRef.current) press(buttonRef.current, data.ready ? 1.08 : 0.92);
      } else setError(data?.error || 'ตรวจความพร้อมไม่สำเร็จ');
    } catch {
      setError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้');
    }
    setChecking(false);
  }

  // Each line of a new result comes in after the one above it.
  const checkedAt = result?.checkedAt;
  useLayoutEffect(() => {
    if (!checkedAt || !rootRef.current || prefersReducedMotion()) return;
    const rows = animate(rootRef.current.querySelectorAll('[data-check]'), { opacity: [0, 1], translateX: [-10, 0], duration: 300, delay: stagger(35), ease: 'outCubic' });
    return () => { rows.pause(); };
  }, [checkedAt]);

  const groups = result ? [...new Set(result.checks.map(c => c.group))] : [];
  const failed = result ? result.checks.filter(c => c.ok === false).length : 0;

  return (
    <section ref={rootRef} aria-labelledby="readiness-title" className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 id="readiness-title" className="text-sm font-semibold text-white">ความพร้อมของเครื่องแลป</h2>
          <p className="mt-0.5 text-xs text-gray-400">
            ตรวจของจริงบนเครื่องนี้: ไฟล์สคริปต์และ Python ค่าจากเซนเซอร์ กล้อง และฐานข้อมูล โดยไม่สั่งให้อุปกรณ์ทำงาน
          </p>
        </div>
        <button
          ref={buttonRef} type="button" onClick={check} disabled={checking}
          className={`rounded-full bg-[#c8ff00] px-5 py-2 text-sm font-semibold text-gray-950 transition-colors hover:bg-white disabled:opacity-60 ${FOCUS}`}
        >
          {checking ? 'กำลังตรวจ' : 'ตรวจความพร้อมของเครื่องแลป'}
        </button>
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-red-300">{error}</p>}

      {result && (
        <div className="mt-4">
          <p role="status" className={`text-sm font-semibold ${result.ready ? 'text-[#c8ff00]' : 'text-red-300'}`}>
            {result.ready ? 'พร้อมใช้งาน ไม่พบสิ่งผิดปกติ' : `ยังไม่พร้อม พบ ${failed} รายการที่ต้องแก้`}
            <span className="ml-2 font-mono text-xs font-normal text-gray-500">ตรวจเมื่อ {timeText(result.checkedAt)}</span>
          </p>
          <div className="mt-3 grid gap-x-6 gap-y-4 lg:grid-cols-2">
            {groups.map(group => (
              <div key={group}>
                <h3 className="text-xs font-semibold text-cyan-400">{group}</h3>
                <ul className="mt-1">
                  {result.checks.filter(c => c.group === group).map(c => {
                    const look = lookOf(c.ok);
                    return (
                      <li key={c.id} data-check={c.id} className="flex items-baseline gap-3 border-b border-white/[0.04] py-1.5 text-sm last:border-0">
                        <span className={`flex w-20 shrink-0 items-center gap-1.5 text-xs font-semibold ${look.tone}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${look.dot}`} />
                          {look.word}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium text-gray-200">{c.label}</span>
                          <span className="block break-words text-xs text-gray-400">{c.detail}</span>
                        </span>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
