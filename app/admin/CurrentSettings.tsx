'use client';

import { useRef, useState } from 'react';
import { animate, stagger } from 'animejs';
import SlideIn from '@/app/components/SlideIn';
import { prefersReducedMotion, press } from '@/lib/motion';
import { CURRENT_MAX, INSTRUMENTS, isCurrent, type Currents } from '@/lib/instruments';

// The current each instrument's circuit carries, as the lab room takes it to
// be. The rig does not measure current and this does not set it: the admin
// sets the supply by hand and writes the same number here, so that the theory
// the students compare with is worked out from what really flows.

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-400';
const text = (amps: number) => String(amps);

export default function CurrentSettings({ currents, onChanged }: { currents: Currents; onChanged: () => Promise<void> }) {
  const listRef = useRef<HTMLFormElement>(null);
  // Only what has been typed and not yet saved; the rest shows what is stored.
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const changed = INSTRUMENTS.filter(i => edits[i.script] !== undefined && edits[i.script].trim() !== text(currents[i.script]));
  const invalid = changed.filter(i => edits[i.script].trim() === '' || !isCurrent(Number(edits[i.script])));

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!changed.length || invalid.length) return;
    setBusy(true);
    const saved = changed.map(i => i.script as string);
    let ok = false;
    let error = '';
    try {
      const res = await fetch('/api/admin/rig/currents', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currents: Object.fromEntries(changed.map(i => [i.script, Number(edits[i.script])])) }),
      });
      const data = await res.json().catch(() => null);
      ok = res.ok && data?.ok === true;
      error = data?.error ?? '';
    } catch {
      error = 'เชื่อมต่อเซิร์ฟเวอร์ไม่ได้';
    }
    if (ok) {
      await onChanged();
      setEdits({});
      setNotice({ ok: true, text: 'บันทึกค่ากระแสแล้ว ใช้กับผู้ที่เข้าห้องแลปครั้งถัดไป' });
      // The fields that were saved settle into place, one after another.
      if (listRef.current && !prefersReducedMotion()) {
        const fields = saved.map(script => listRef.current!.querySelector(`[data-current="${script}"]`)).filter(Boolean) as Element[];
        if (fields.length) animate(fields, { scale: [0.9, 1], duration: 380, delay: stagger(60), ease: 'outBack(2)' });
      }
    } else setNotice({ ok: false, text: error || 'บันทึกค่ากระแสไม่สำเร็จ' });
    setBusy(false);
  }

  return (
    <form ref={listRef} onSubmit={save} noValidate className="mt-4 border-t border-white/5 pt-3">
      <p className="text-xs text-gray-500">กระแสที่ใช้คำนวณค่าทฤษฎี</p>
      {INSTRUMENTS.map(inst => {
        const bad = invalid.includes(inst);
        return (
          <div key={inst.script} className="mt-2 flex items-center justify-between gap-3">
            <label htmlFor={`current-${inst.script}`} className="text-sm text-gray-200">{inst.label}</label>
            <span className="flex items-center gap-1.5">
              <input
                id={`current-${inst.script}`} data-current={inst.script}
                type="number" inputMode="decimal" min={0.001} max={CURRENT_MAX} step={0.001} disabled={busy}
                aria-invalid={bad || undefined}
                value={edits[inst.script] ?? text(currents[inst.script])}
                onChange={e => { setEdits(prev => ({ ...prev, [inst.script]: e.target.value })); setNotice(null); }}
                className={`w-20 rounded-lg border bg-gray-950 px-2 py-1 text-right font-mono text-sm text-white [color-scheme:dark] disabled:opacity-50 ${bad ? 'border-red-400/60' : 'border-white/10'} ${FOCUS}`}
              />
              <span className="font-mono text-xs text-gray-400">A</span>
            </span>
          </div>
        );
      })}
      <div className="mt-3 flex items-center justify-between gap-3">
        <p className="text-xs text-gray-500">ตั้งแหล่งจ่ายจริงให้ตรงกับค่านี้ ระบบไม่ได้วัดหรือปรับกระแสเอง</p>
        <button
          type="submit" disabled={busy || !changed.length || invalid.length > 0}
          onClick={e => press(e.currentTarget)}
          className={`shrink-0 rounded-full bg-[#c8ff00] px-4 py-1 text-xs font-semibold text-gray-950 transition-colors hover:bg-white disabled:bg-gray-800 disabled:text-gray-500 ${FOCUS}`}
        >
          {busy ? 'กำลังบันทึก' : 'บันทึกค่ากระแส'}
        </button>
      </div>
      {invalid.length > 0 && (
        <p role="alert" className="mt-2 text-xs text-red-300">ค่ากระแสต้องมากกว่า 0 และไม่เกิน {CURRENT_MAX} A ละเอียดได้ถึง 0.001 A</p>
      )}
      {notice && (
        <SlideIn key={notice.text} role={notice.ok ? 'status' : 'alert'} className={`mt-2 text-xs ${notice.ok ? 'text-[#c8ff00]' : 'text-red-300'}`}>
          {notice.text}
        </SlideIn>
      )}
    </form>
  );
}
