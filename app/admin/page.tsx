'use client';

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { animate, scrambleText, stagger } from 'animejs';
import DashboardNav from '@/app/components/DashboardNav';
import SlideIn from '@/app/components/SlideIn';
import EquipmentStatus from './EquipmentStatus';
import { prefersReducedMotion, press } from '@/lib/motion';
import { INSTRUMENTS } from '@/lib/instruments';

type Me = { name: string; email: string; role: string; is_admin?: boolean };
type Lab = { lab_id: string; code: string; name_th: string; is_active: boolean };
type Booking = {
  booking_id: string; lab_id: string; status: string;
  start_time: string; end_time: string;
  blocked: boolean; note: string;
  user: { uid: string; name: string; email: string };
};
type Overview = { labs: Lab[]; running: Booking[]; bookings: Booking[]; disabled_instruments: string[] };
type Notice = { ok: boolean; text: string };

const STATUS: Record<string, { label: string; tone: string }> = {
  confirmed: { label: 'จองแล้ว', tone: 'text-[#c8ff00] border-[#c8ff00]/30' },
  pending: { label: 'รอยืนยัน', tone: 'text-yellow-300 border-yellow-400/30' },
  in_progress: { label: 'กำลังทดลอง', tone: 'text-cyan-300 border-cyan-400/30' },
  completed: { label: 'เสร็จสิ้น', tone: 'text-gray-400 border-white/10' },
  cancelled: { label: 'ยกเลิก', tone: 'text-gray-500 border-white/10' },
};

const TZ = 'Asia/Bangkok';
const dayText = (iso: string) => new Date(iso).toLocaleDateString('th-TH', { weekday: 'short', day: 'numeric', month: 'short', timeZone: TZ });
const timeText = (iso: string) => new Date(iso).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit', timeZone: TZ });
const todayThai = () => new Date().toLocaleDateString('en-CA', { timeZone: TZ });
const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400';
const FIELD = `rounded-lg border border-white/10 bg-gray-950 px-3 py-1.5 text-sm text-white [color-scheme:dark] ${FOCUS}`;

async function call(url: string, method: string, body?: unknown): Promise<Notice & { data?: Record<string, unknown> }> {
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    return { ok: res.ok && data.ok !== false, text: data.error ?? '', data };
  } catch {
    return { ok: false, text: 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้' };
  }
}

const matches = (b: Booking, status: string) =>
  status === 'all' ? true
    : status === 'active' ? ['pending', 'confirmed', 'in_progress'].includes(b.status)
      : b.status === status;

export default function AdminPage() {
  const router = useRouter();
  const rootRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const countRef = useRef<HTMLSpanElement>(null);
  const [me, setMe] = useState<Me | null>(null);
  const [denied, setDenied] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [loadError, setLoadError] = useState('');
  const [from, setFrom] = useState(todayThai);
  const [days, setDays] = useState(7);
  const [status, setStatus] = useState('active');

  const load = useCallback(async () => {
    const res = await call(`/api/admin/overview?from=${from}&days=${days}`, 'GET');
    if (res.ok) { setData(res.data as unknown as Overview); setLoadError(''); }
    else setLoadError(res.text || 'โหลดข้อมูลไม่สำเร็จ');
  }, [from, days]);

  useEffect(() => {
    let stopped = false;
    (async () => {
      const res = await fetch('/api/auth/me').catch(() => null);
      if (stopped) return;
      if (!res || !res.ok) { router.replace('/login'); return; }
      const user: Me = (await res.json()).user;
      setMe(user);
      if (!user.is_admin) setDenied(true);
    })();
    return () => { stopped = true; };
  }, [router]);

  // Loaded on arrival and whenever the range changes, then kept fresh: who is
  // in the lab room changes without the admin doing anything.
  useEffect(() => {
    if (!me?.is_admin) return;
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 30_000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [me, load]);

  const ready = !!data;
  useLayoutEffect(() => {
    if (!ready || !rootRef.current || prefersReducedMotion()) return;
    const rise = animate(rootRef.current.querySelectorAll('[data-rise]'), {
      opacity: [0, 1], translateY: [20, 0], duration: 560, delay: stagger(80), ease: 'outCubic',
    });
    // The heading settles out of scrambled Thai letters as the page arrives.
    const title = titleRef.current
      ? animate(titleRef.current, { innerHTML: scrambleText({ chars: 'กขคงจฉชซญดตถทนบปผฝพฟมยรลวศษสหอฮ', settleDuration: 140 }), duration: 700 })
      : null;
    return () => { rise.pause(); title?.pause(); };
  }, [ready]);

  // The number of bookings shown counts to its new value when the list changes.
  const shownCount = data ? data.bookings.filter(b => matches(b, status)).length : 0;
  const counted = useRef(0);
  useLayoutEffect(() => {
    const el = countRef.current;
    if (!el) return;
    const from = counted.current;
    counted.current = shownCount;
    if (prefersReducedMotion() || from === shownCount) { el.textContent = String(shownCount); return; }
    const tally = { v: from };
    const count = animate(tally, { v: shownCount, duration: 500, ease: 'outCubic', onUpdate: () => { el.textContent = String(Math.round(tally.v)); } });
    return () => { count.pause(); el.textContent = String(shownCount); };
  }, [shownCount, ready]);

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

  if (!me || !data) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center gap-3 text-sm text-gray-400">
        {loadError
          ? <><p role="alert" className="text-red-300">{loadError}</p><button onClick={load} className={`rounded-full border border-white/10 px-4 py-1.5 text-gray-200 hover:border-cyan-500/30 ${FOCUS}`}>ลองใหม่</button></>
          : <svg className="animate-spin motion-reduce:animate-none text-[#c8ff00]" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-label="กำลังโหลด"><path d="M21 12a9 9 0 11-6.219-8.56" /></svg>}
      </div>
    );
  }

  const shown = data.bookings.filter(b => matches(b, status));

  return (
    <div ref={rootRef} className="min-h-screen bg-[#030712] text-white">
      <DashboardNav user={me} />
      <main className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 short:py-4">
        <header data-rise className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h1 ref={titleRef} className="min-h-[1lh] whitespace-nowrap text-2xl font-bold short:text-xl">ผู้ดูแลระบบ</h1>
            <p className="mt-0.5 text-sm text-gray-400">ดูแลการจอง ห้องแลป และอุปกรณ์</p>
          </div>
          {loadError && <p role="alert" className="text-sm text-red-300">{loadError}</p>}
        </header>

        <EquipmentStatus />

        <div className="grid gap-4 lg:grid-cols-3">
          <RunningPanel running={data.running} onChanged={load} />
          <RigPanel />
          <LabsPanel labs={data.labs} disabled={data.disabled_instruments ?? []} onChanged={load} />
        </div>

        <BlockPanel labs={data.labs} onChanged={load} />

        <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/5 px-4 py-3">
            <h2 className="text-sm font-semibold">การจองทั้งหมด <span ref={countRef} className="font-mono font-normal text-gray-500">{shown.length}</span></h2>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <label className="flex items-center gap-1.5 text-gray-400">ตั้งแต่
                <input type="date" value={from} onChange={e => e.target.value && setFrom(e.target.value)} className={FIELD} />
              </label>
              <label className="flex items-center gap-1.5 text-gray-400">ช่วง
                <select value={days} onChange={e => setDays(Number(e.target.value))} className={FIELD}>
                  <option value={1}>1 วัน</option><option value={7}>7 วัน</option><option value={14}>14 วัน</option><option value={30}>30 วัน</option>
                </select>
              </label>
              <label className="flex items-center gap-1.5 text-gray-400">สถานะ
                <select value={status} onChange={e => setStatus(e.target.value)} className={FIELD}>
                  <option value="active">ที่ยังใช้งานอยู่</option>
                  <option value="all">ทั้งหมด</option>
                  <option value="completed">เสร็จสิ้น</option>
                  <option value="cancelled">ยกเลิก</option>
                </select>
              </label>
            </div>
          </div>
          <BookingTable key={`${from}|${days}|${status}`} bookings={shown} onChanged={load} />
        </section>
      </main>
    </div>
  );
}

// A destructive button asks once more in place before it acts.
function ConfirmButton({ label, confirmLabel, question, danger = true, onConfirm }: {
  label: string; confirmLabel: string; question: string; danger?: boolean;
  onConfirm: () => Promise<void>;
}) {
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const tone = danger
    ? 'border-red-400/40 text-red-200 hover:bg-red-500/15'
    : 'border-white/10 text-gray-200 hover:border-cyan-500/30';

  if (!asking) {
    return (
      <button
        onClick={e => { press(e.currentTarget); setAsking(true); }}
        className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors ${tone} ${FOCUS}`}
      >
        {label}
      </button>
    );
  }
  return (
    <SlideIn from={-4} className="flex flex-wrap items-center justify-end gap-2">
      <span className="text-xs text-gray-300">{question}</span>
      <button
        disabled={busy}
        onClick={async e => { press(e.currentTarget); setBusy(true); await onConfirm(); setBusy(false); setAsking(false); }}
        className={`rounded-full bg-red-500 px-3 py-1 text-xs font-semibold text-white transition-colors hover:bg-red-400 disabled:opacity-50 ${FOCUS}`}
      >
        {busy ? 'กำลังดำเนินการ' : confirmLabel}
      </button>
      <button disabled={busy} onClick={() => setAsking(false)} className={`rounded-full border border-white/10 px-3 py-1 text-xs text-gray-300 hover:text-white ${FOCUS}`}>
        ไม่ใช่
      </button>
    </SlideIn>
  );
}

function Message({ notice }: { notice: Notice | null }) {
  if (!notice) return null;
  return (
    <SlideIn key={notice.text} role={notice.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${notice.ok ? 'text-[#c8ff00]' : 'text-red-300'}`}>
      {notice.text}
    </SlideIn>
  );
}

function RunningPanel({ running, onChanged }: { running: Booking[]; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  return (
    <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <h2 className="text-sm font-semibold">ห้องแลปตอนนี้</h2>
      {running.length === 0 && <p className="mt-3 text-sm text-gray-500">ไม่มีรอบที่กำลังดำเนินอยู่</p>}
      {running.map(b => (
        <div key={b.booking_id} className="mt-3">
          <p className="flex items-center gap-2 text-sm font-semibold text-white">
            <span className="h-1.5 w-1.5 rounded-full bg-[#c8ff00] animate-pulse motion-reduce:animate-none" />
            {b.blocked ? `ปิดช่วงเวลา${b.note ? `: ${b.note}` : ''}` : b.user.name || b.user.email || b.user.uid}
          </p>
          {!b.blocked && <p className="text-xs text-gray-500">{b.user.email}</p>}
          <p className="mt-1 font-mono text-sm text-gray-300">{timeText(b.start_time)} ถึง {timeText(b.end_time)} น.</p>
          <div className="mt-3">
            <ConfirmButton
              label="สิ้นสุดรอบนี้" confirmLabel="สิ้นสุดและตัดวงจร" question="ผู้ใช้จะถูกนำออกจากห้องแลป"
              onConfirm={async () => {
                const res = await call(`/api/admin/bookings/${b.booking_id}`, 'PATCH', { action: 'end' });
                setNotice(res.ok
                  // A circuit left live is a warning, not a success.
                  ? res.data?.circuits_cut === false
                    ? { ok: false, text: 'สิ้นสุดรอบแล้ว แต่ตัดวงจรไม่สำเร็จ ตรวจสอบอุปกรณ์' }
                    : { ok: true, text: 'สิ้นสุดรอบและตัดวงจรแล้ว' }
                  : { ok: false, text: res.text || 'สิ้นสุดรอบไม่สำเร็จ' });
                await onChanged();
              }}
            />
          </div>
        </div>
      ))}
      <Message notice={notice} />
    </section>
  );
}

function RigPanel() {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <h2 className="text-sm font-semibold">อุปกรณ์</h2>
      <div className="mt-3 flex items-center justify-between gap-3">
        <span className="text-sm text-gray-300">แหล่งจ่ายไฟ</span>
        <span className="flex gap-2">
          {[true, false].map(on => (
            <button
              key={String(on)} disabled={busy}
              onClick={async e => {
                press(e.currentTarget);
                setBusy(true);
                const res = await call('/api/admin/rig/power', 'POST', { on });
                setNotice(res.ok ? { ok: true, text: on ? 'เปิดแหล่งจ่ายไฟแล้ว' : 'ปิดแหล่งจ่ายไฟแล้ว' } : { ok: false, text: res.text || 'สั่งแหล่งจ่ายไฟไม่สำเร็จ' });
                setBusy(false);
              }}
              className={`rounded-full border px-3 py-1 text-xs font-semibold transition-colors disabled:opacity-50 ${on ? 'border-[#c8ff00]/40 text-[#c8ff00] hover:bg-[#c8ff00]/10' : 'border-white/10 text-gray-200 hover:border-cyan-500/30'} ${FOCUS}`}
            >
              {on ? 'เปิด' : 'ปิด'}
            </button>
          ))}
        </span>
      </div>
      <p className="mt-3 text-sm text-gray-400">ตัดวงจรขดลวดและโซลีนอยด์ และปิดแหล่งจ่ายไฟทันที ไม่ว่าใครกำลังใช้อยู่</p>
      <div className="mt-3">
        <ConfirmButton
          label="ตัดวงจรทั้งหมด" confirmLabel="ตัดวงจรเดี๋ยวนี้" question="การทดลองที่กำลังทำอยู่จะหยุด"
          onConfirm={async () => {
            const res = await call('/api/admin/rig/stop', 'POST');
            setNotice(res.ok ? { ok: true, text: 'ตัดวงจรและปิดแหล่งจ่ายไฟแล้ว' } : { ok: false, text: res.text || 'ตัดวงจรไม่สำเร็จ' });
          }}
        />
      </div>
      <Message notice={notice} />
    </section>
  );
}

function LabsPanel({ labs, disabled, onChanged }: { labs: Lab[]; disabled: string[]; onChanged: () => Promise<void> }) {
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState('');

  async function toggle(lab: Lab, knob: HTMLElement | null) {
    setBusy(lab.lab_id);
    const res = await call(`/api/admin/labs/${lab.lab_id}`, 'PATCH', { is_active: !lab.is_active });
    setNotice(res.ok
      ? { ok: true, text: lab.is_active ? `ปิดรับจอง ${lab.code} แล้ว รอบที่จองไว้ยังอยู่` : `เปิดรับจอง ${lab.code} แล้ว` }
      : { ok: false, text: res.text || 'เปลี่ยนสถานะไม่สำเร็จ' });
    await onChanged();
    if (res.ok && knob && !prefersReducedMotion()) animate(knob, { scale: [0.7, 1], duration: 380, ease: 'outBack(2)' });
    setBusy('');
  }

  return (
    <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <h2 className="text-sm font-semibold">การเปิดให้ใช้งาน</h2>
      <p className="mt-2 text-xs text-gray-500">รับจอง</p>
      {labs.length === 0 && <p className="mt-3 text-sm text-gray-500">ยังไม่มีการทดลองในระบบ</p>}
      {labs.map(lab => (
        <div key={lab.lab_id} className="mt-3 flex items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="font-mono text-sm font-semibold text-[#c8ff00]">{lab.code}</p>
            <p className="truncate text-xs text-gray-400" title={lab.name_th}>{lab.name_th}</p>
          </div>
          <button
            role="switch" aria-checked={lab.is_active} aria-label={`เปิดรับจอง ${lab.code}`}
            disabled={busy === lab.lab_id}
            onClick={e => toggle(lab, e.currentTarget.querySelector<HTMLElement>('[data-knob]'))}
            className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${lab.is_active ? 'border-[#c8ff00]/50 bg-[#c8ff00]/25' : 'border-white/10 bg-gray-800'} ${FOCUS}`}
          >
            <span data-knob className={`absolute top-0.5 h-4.5 w-4.5 rounded-full transition-[left] duration-200 ${lab.is_active ? 'left-[22px] bg-[#c8ff00]' : 'left-0.5 bg-gray-500'}`} />
          </button>
        </div>
      ))}
      <InstrumentSwitches disabled={disabled} onChanged={onChanged} />
      <Message notice={notice} />
    </section>
  );
}

const SWITCH = (on: boolean) => `relative h-6 w-11 shrink-0 rounded-full border transition-colors disabled:opacity-50 ${on ? 'border-[#c8ff00]/50 bg-[#c8ff00]/25' : 'border-white/10 bg-gray-800'} ${FOCUS}`;
const KNOB = (on: boolean) => `absolute top-0.5 h-4.5 w-4.5 rounded-full transition-[left] duration-200 ${on ? 'left-[22px] bg-[#c8ff00]' : 'left-0.5 bg-gray-500'}`;

// Which instruments students may use. A closed one disappears from the lab
// room's list and the rig refuses to start it.
function InstrumentSwitches({ disabled, onChanged }: { disabled: string[]; onChanged: () => Promise<void> }) {
  const listRef = useRef<HTMLDivElement>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);
  const coils = INSTRUMENTS.filter(i => i.part === 'coil').map(i => i.script as string);
  const coilsOpen = coils.some(script => !disabled.includes(script));

  async function save(next: string[], changed: string[], text: string) {
    setBusy(true);
    const res = await call('/api/admin/rig/instruments', 'PATCH', { disabled: next });
    setNotice(res.ok ? { ok: true, text } : { ok: false, text: res.text || 'เปลี่ยนสถานะไม่สำเร็จ' });
    await onChanged();
    if (res.ok && listRef.current && !prefersReducedMotion()) {
      const knobs = changed.map(script => listRef.current!.querySelector(`[data-knob="${script}"]`)).filter(Boolean) as Element[];
      if (knobs.length) animate(knobs, { scale: [0.7, 1], duration: 380, delay: stagger(60), ease: 'outBack(2)' });
    }
    setBusy(false);
  }

  const flip = (script: string, label: string) => {
    const closing = !disabled.includes(script);
    save(closing ? [...disabled, script] : disabled.filter(s => s !== script), [script], closing ? `ปิดใช้งาน ${label} แล้ว` : `เปิดใช้งาน ${label} แล้ว`);
  };
  const flipCoils = () => save(
    coilsOpen ? [...new Set([...disabled, ...coils])] : disabled.filter(s => !coils.includes(s)),
    coils, coilsOpen ? 'ปิดการทดลองขดลวดเดี่ยวทั้งหมดแล้ว' : 'เปิดการทดลองขดลวดเดี่ยวทั้งหมดแล้ว',
  );

  return (
    <div ref={listRef} className="mt-4 border-t border-white/5 pt-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">อุปกรณ์ที่นักศึกษาใช้ได้</p>
        <button disabled={busy} onClick={e => { press(e.currentTarget); flipCoils(); }}
          className={`rounded-full border border-white/10 px-3 py-1 text-xs text-gray-200 transition-colors hover:border-cyan-500/30 disabled:opacity-50 ${FOCUS}`}>
          {coilsOpen ? 'ปิดขดลวดเดี่ยวทั้งหมด' : 'เปิดขดลวดเดี่ยวทั้งหมด'}
        </button>
      </div>
      {INSTRUMENTS.map(inst => {
        const on = !disabled.includes(inst.script);
        return (
          <div key={inst.script} className="mt-2 flex items-center justify-between gap-3">
            <span className={`text-sm ${on ? 'text-gray-200' : 'text-gray-500'}`}>{inst.label}</span>
            <button role="switch" aria-checked={on} aria-label={`เปิดใช้งาน ${inst.label}`} disabled={busy}
              onClick={() => flip(inst.script, inst.label)} className={SWITCH(on)}>
              <span data-knob={inst.script} className={KNOB(on)} />
            </button>
          </div>
        );
      })}
      <Message notice={notice} />
    </div>
  );
}

function BlockPanel({ labs, onChanged }: { labs: Lab[]; onChanged: () => Promise<void> }) {
  const [labId, setLabId] = useState(labs[0]?.lab_id ?? '');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!start || !end) { setNotice({ ok: false, text: 'เลือกเวลาเริ่มและเวลาสิ้นสุด' }); return; }
    setBusy(true);
    // The inputs give local time without a zone; Date reads it as the admin's own.
    const res = await call('/api/admin/blocks', 'POST', {
      lab_id: labId, start_time: new Date(start).toISOString(), end_time: new Date(end).toISOString(), note,
    });
    setNotice(res.ok ? { ok: true, text: 'ปิดช่วงเวลาแล้ว ยกเลิกได้จากตารางด้านล่าง' } : { ok: false, text: res.text || 'ปิดช่วงเวลาไม่สำเร็จ' });
    if (res.ok) { setStart(''); setEnd(''); setNote(''); await onChanged(); }
    setBusy(false);
  }

  return (
    <section data-rise className="rounded-xl border border-white/10 bg-gray-900/50 p-4">
      <h2 className="text-sm font-semibold">ปิดช่วงเวลาไม่ให้จอง</h2>
      <p className="mt-0.5 text-xs text-gray-500">สำหรับซ่อมบำรุงหรือคาบเรียนที่ใช้ห้องจริง ช่วงที่ปิดจะขึ้นเป็นไม่ว่างในตารางจอง</p>
      <form onSubmit={submit} className="mt-3 flex flex-wrap items-end gap-3 text-sm">
        {labs.length > 1 && (
          <label className="flex flex-col gap-1 text-xs text-gray-400">การทดลอง
            <select value={labId} onChange={e => setLabId(e.target.value)} className={FIELD}>
              {labs.map(l => <option key={l.lab_id} value={l.lab_id}>{l.code}</option>)}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1 text-xs text-gray-400">เริ่ม
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className={FIELD} />
        </label>
        <label className="flex flex-col gap-1 text-xs text-gray-400">สิ้นสุด
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className={FIELD} />
        </label>
        <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-xs text-gray-400">เหตุผล (ไม่บังคับ)
          <input type="text" value={note} maxLength={120} onChange={e => setNote(e.target.value)} placeholder="เช่น ซ่อมหัววัด" className={FIELD} />
        </label>
        <button
          type="submit" disabled={busy || !labId}
          onClick={e => press(e.currentTarget)}
          className={`rounded-full bg-[#c8ff00] px-4 py-1.5 text-sm font-semibold text-gray-950 transition-colors hover:bg-white disabled:opacity-50 ${FOCUS}`}
        >
          {busy ? 'กำลังปิด' : 'ปิดช่วงเวลา'}
        </button>
      </form>
      <Message notice={notice} />
    </section>
  );
}

function BookingTable({ bookings, onChanged }: { bookings: Booking[]; onChanged: () => Promise<void> }) {
  const bodyRef = useRef<HTMLTableSectionElement>(null);
  const [notice, setNotice] = useState<Notice | null>(null);

  // Rows come in one after another when the table is first shown or the filter
  // changes (the table is keyed on the filter), not on every refresh.
  useLayoutEffect(() => {
    if (!bodyRef.current || prefersReducedMotion()) return;
    const rows = animate(bodyRef.current.querySelectorAll('tr'), {
      opacity: [0, 1], translateX: [-12, 0], duration: 320, delay: stagger(22), ease: 'outCubic',
    });
    return () => { rows.pause(); };
  }, []);

  // The message stays when the list empties: cancelling the last booking in
  // view must still say that it went through.
  if (bookings.length === 0) {
    return (
      <>
        <p className="px-4 py-6 text-sm text-gray-500">ไม่มีการจองในช่วงที่เลือก</p>
        <div className="px-4 pb-3"><Message notice={notice} /></div>
      </>
    );
  }

  return (
    <>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">วัน</th>
              <th className="px-3 py-2 font-medium">เวลา</th>
              <th className="px-3 py-2 font-medium">ผู้จอง</th>
              <th className="px-3 py-2 font-medium">สถานะ</th>
              <th className="px-4 py-2 text-right font-medium">จัดการ</th>
            </tr>
          </thead>
          <tbody ref={bodyRef}>
            {bookings.map(b => {
              const s = b.blocked && b.status === 'confirmed'
                ? { label: 'ปิดอยู่', tone: 'text-yellow-300 border-yellow-400/30' }
                : STATUS[b.status] ?? { label: b.status, tone: 'text-gray-400 border-white/10' };
              const canCancel = ['pending', 'confirmed'].includes(b.status);
              return (
                <tr key={b.booking_id} className="border-t border-white/5">
                  <td className="whitespace-nowrap px-4 py-2 text-gray-200">{dayText(b.start_time)}</td>
                  <td className="whitespace-nowrap px-3 py-2 font-mono tabular-nums text-gray-300">{timeText(b.start_time)} ถึง {timeText(b.end_time)}</td>
                  <td className="px-3 py-2">
                    {b.blocked
                      ? <span className="text-gray-300">ปิดช่วงเวลา{b.note && <span className="text-gray-500">: {b.note}</span>}</span>
                      : <><span className="text-gray-200">{b.user.name || b.user.uid}</span>{b.user.email && <span className="block text-xs text-gray-500">{b.user.email}</span>}</>}
                  </td>
                  <td className="px-3 py-2">
                    <span className={`whitespace-nowrap rounded-full border px-2 py-0.5 text-xs ${s.tone}`}>{s.label}</span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    {canCancel && (
                      <ConfirmButton
                        label={b.blocked ? 'เปิดคืน' : 'ยกเลิก'} confirmLabel={b.blocked ? 'เปิดคืน' : 'ยกเลิกการจอง'}
                        question={b.blocked ? 'เปิดช่วงนี้ให้จองได้อีกครั้ง' : 'ผู้จองจะได้รับแจ้งเตือน'}
                        onConfirm={async () => {
                          const res = await call(`/api/admin/bookings/${b.booking_id}`, 'PATCH', { action: 'cancel' });
                          setNotice(res.ok ? { ok: true, text: b.blocked ? 'เปิดช่วงเวลาคืนแล้ว' : 'ยกเลิกการจองแล้ว' } : { ok: false, text: res.text || 'ยกเลิกไม่สำเร็จ' });
                          await onChanged();
                        }}
                      />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="px-4 pb-3"><Message notice={notice} /></div>
    </>
  );
}
