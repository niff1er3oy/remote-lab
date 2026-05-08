'use client';

import { useEffect, useRef, useState } from 'react';
import { animate, onScroll, stagger } from 'animejs';
import Link from 'next/link';

export type SlotStatus = 'free' | 'mine' | 'taken';

type Room = { room_id: string; code: string; name_th: string; name_en: string };

const TIME_SLOTS = [
  '00:00', '02:00', '04:00', '06:00', '08:00', '10:00',
  '12:00', '14:00', '16:00', '18:00', '20:00', '22:00',
];
const FALLBACK: SlotStatus[][] = TIME_SLOTS.map(() => Array(7).fill('free'));

function getBookingDates() {
  const today = new Date();
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(today);
    d.setDate(today.getDate() + i);
    return `${d.getDate()}/${d.getMonth() + 1}/${String(d.getFullYear()).slice(-2)}`;
  });
}

function slotTimes(di: number, ti: number): { start: Date; end: Date } {
  const base = new Date();
  base.setHours(0, 0, 0, 0);
  base.setDate(base.getDate() + di);
  const start = new Date(base);
  start.setHours(ti * 2);
  const end = new Date(base);
  end.setHours(ti * 2 + 2);
  return { start, end };
}

function toISO(d: Date) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:00:00`;
}

function slotCls(status: SlotStatus, held: boolean, isToday: boolean, loggedIn: boolean) {
  if (held) return 'bg-[#c8ff00] shadow-md shadow-[#c8ff00]/40 ring-2 ring-[#c8ff00]/60 scale-[1.03] z-10 relative';
  switch (status) {
    case 'mine':  return 'bg-cyan-500/40 ring-1 ring-inset ring-cyan-400/50 cursor-pointer hover:bg-cyan-500/60';
    case 'taken': return 'bg-[#c8ff00]/18 cursor-default';
    default:
      if (!loggedIn) return isToday
        ? 'bg-gray-700/50 ring-1 ring-inset ring-[#c8ff00]/15'
        : 'bg-gray-800/70';
      return isToday
        ? 'bg-gray-700/50 ring-1 ring-inset ring-[#c8ff00]/15 cursor-pointer hover:ring-[#c8ff00]/40 hover:bg-gray-700'
        : 'bg-gray-800/70 cursor-pointer hover:bg-gray-700/80';
  }
}

export default function BookingCalendar({ scrollAnimate = true, onBookingCreated, onBookingCancelled }: {
  scrollAnimate?: boolean;
  onBookingCreated?: () => void;
  onBookingCancelled?: () => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [slotsByRoom, setSlotsByRoom] = useState<Record<string, SlotStatus[][]>>({});
  const [selectedId, setSelectedId] = useState('');
  const [dates, setDates] = useState<string[]>(getBookingDates());
  const [loading, setLoading] = useState(true);
  const [loggedIn, setLoggedIn] = useState(false);

  const [held,         setHeld]         = useState<{ ti: number; di: number } | null>(null);
  const [cancelTarget, setCancelTarget] = useState<{ ti: number; di: number; booking_id: string } | null>(null);
  const [confirming,   setConfirming]   = useState(false);
  const [cancelling,   setCancelling]   = useState(false);
  const [bookingMsg,   setBookingMsg]   = useState<{ ok: boolean; text: string } | null>(null);
  // mine_booking_ids: { room_id: { "ti-di": booking_id } }
  const [mineBookingIds, setMineBookingIds] = useState<Record<string, Record<string, string>>>({});

  useEffect(() => {
    fetch('/api/bookings/availability')
      .then(r => r.json())
      .then(data => {
        if (data.ok && data.rooms?.length > 0) {
          setRooms(data.rooms);
          setSlotsByRoom(data.slots_by_room);
          setMineBookingIds(data.mine_booking_ids ?? {});
          setDates(data.dates);
          setSelectedId(data.rooms[0].room_id);
          setLoggedIn(!!data.logged_in);
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const currentSlots: SlotStatus[][] =
    selectedId && slotsByRoom[selectedId] ? slotsByRoom[selectedId] : FALLBACK;

  const selectedRoom = rooms.find(r => r.room_id === selectedId);

  useEffect(() => {
    if (!sectionRef.current || !scrollAnimate) return;
    const rows = sectionRef.current.querySelectorAll('.slot-row');
    animate(rows, { opacity: 0, duration: 0 });
    const playIn = () => animate(rows, {
      opacity: [0, 1], translateX: [-16, 0], duration: 500, delay: stagger(40), ease: 'outCubic',
    });
    const observer = onScroll({
      target: sectionRef.current,
      onEnterForward: () => { animate(rows, { opacity: 0, translateX: -16, duration: 0 }); playIn(); },
      onEnterBackward: () => { animate(rows, { opacity: 0, translateX: -16, duration: 0 }); playIn(); },
    });
    return () => { observer.revert(); };
  }, [loading, scrollAnimate]);

  useEffect(() => { setHeld(null); setCancelTarget(null); setBookingMsg(null); }, [selectedId]);

  async function handleConfirm() {
    if (!held || !selectedId) return;
    setConfirming(true);
    setBookingMsg(null);
    const { start, end } = slotTimes(held.di, held.ti);
    try {
      const res = await fetch('/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room_id: selectedId, start_time: toISO(start), end_time: toISO(end) }),
      });
      const data = await res.json();
      if (data.ok) {
        setSlotsByRoom(prev => {
          const next = prev[selectedId].map(row => [...row]);
          next[held.ti][held.di] = 'mine';
          return { ...prev, [selectedId]: next };
        });
        setHeld(null);
        setBookingMsg({ ok: true, text: 'จองสำเร็จ!' });
        setTimeout(() => setBookingMsg(null), 3000);
        onBookingCreated?.();
      } else {
        setBookingMsg({ ok: false, text: data.error ?? 'เกิดข้อผิดพลาด' });
      }
    } catch {
      setBookingMsg({ ok: false, text: 'ไม่สามารถเชื่อมต่อได้' });
    } finally {
      setConfirming(false);
    }
  }

  async function handleCancelConfirm() {
    if (!cancelTarget) return;
    setCancelling(true);
    setBookingMsg(null);
    try {
      const res = await fetch(`/api/bookings/${cancelTarget.booking_id}`, { method: 'PATCH' });
      const data = await res.json();
      if (data.ok) {
        setSlotsByRoom(prev => {
          const next = prev[selectedId].map(row => [...row]);
          next[cancelTarget.ti][cancelTarget.di] = 'free';
          return { ...prev, [selectedId]: next };
        });
        setMineBookingIds(prev => {
          const room = { ...(prev[selectedId] ?? {}) };
          delete room[`${cancelTarget.ti}-${cancelTarget.di}`];
          return { ...prev, [selectedId]: room };
        });
        setCancelTarget(null);
        setBookingMsg({ ok: true, text: 'ยกเลิกการจองเรียบร้อยแล้ว' });
        setTimeout(() => setBookingMsg(null), 3000);
        onBookingCancelled?.();
      } else {
        setBookingMsg({ ok: false, text: data.error ?? 'เกิดข้อผิดพลาด' });
      }
    } catch {
      setBookingMsg({ ok: false, text: 'ไม่สามารถเชื่อมต่อได้' });
    } finally {
      setCancelling(false);
    }
  }

  function handleSlotClick(ti: number, di: number) {
    if (!loggedIn) return;
    const status = currentSlots[ti][di];
    setBookingMsg(null);
    if (status === 'free') {
      setCancelTarget(null);
      setHeld(prev => prev?.ti === ti && prev?.di === di ? null : { ti, di });
    } else if (status === 'mine') {
      const booking_id = mineBookingIds[selectedId]?.[`${ti}-${di}`];
      if (!booking_id) return;
      setHeld(null);
      setCancelTarget(prev =>
        prev?.ti === ti && prev?.di === di ? null : { ti, di, booking_id }
      );
    }
  }

  return (
    <section ref={sectionRef} id="booking" className="py-24 sm:py-32 border-t border-white/5">
      <div className="mx-auto max-w-7xl px-6 lg:px-8">
        <div className="mx-auto max-w-2xl text-center mb-16">
          <p className="text-sm font-semibold text-[#c8ff00] mb-3 tracking-wider uppercase">ตารางการจอง</p>
          <h2 className="text-3xl font-bold tracking-tight text-white sm:text-4xl">จองเวลาทดลองแบบ Real-time</h2>
          <p className="mt-4 text-gray-400">เลือกห้องทดลองและช่วงเวลาที่ต้องการ ระบบจะยืนยันการจองทันที</p>
        </div>

        <div className="mx-auto max-w-4xl rounded-2xl border border-white/10 bg-gray-900/50 p-6 sm:p-8">
          {/* Room selector */}
          {rooms.length > 0 && (
            <div className="mb-6 flex flex-wrap gap-2">
              {rooms.map(r => (
                <button
                  key={r.room_id}
                  onClick={() => setSelectedId(r.room_id)}
                  className={`rounded-full px-4 py-1.5 text-xs font-medium transition-all flex items-center gap-1.5 ${
                    selectedId === r.room_id
                      ? 'bg-[#c8ff00] text-gray-950'
                      : 'border border-white/10 text-gray-400 hover:border-[#c8ff00]/30 hover:text-white'
                  }`}
                >
                  <span className={`font-mono font-bold ${selectedId === r.room_id ? 'text-gray-950' : 'text-[#c8ff00]/70'}`}>
                    {r.code}
                  </span>
                  <span className="hidden sm:inline">— {r.name_th}</span>
                </button>
              ))}
            </div>
          )}

          {/* Room description */}
          {selectedRoom && (
            <p className="mb-5 text-xs text-gray-500">
              <span className="text-gray-400 font-medium">{selectedRoom.code}</span>
              {' '}— {selectedRoom.name_th}
            </p>
          )}

          <div className="overflow-x-auto">
            <div className="min-w-[520px]">
              {/* Date header */}
              <div className="grid grid-cols-[52px_repeat(7,1fr)] gap-1.5 mb-3">
                <div />
                {dates.map((date, i) => (
                  <div key={date} className="flex flex-col items-center gap-1">
                    {i === 0
                      ? <span className="text-[9px] font-bold text-[#c8ff00] uppercase tracking-widest">วันนี้</span>
                      : <span className="text-[9px] invisible">-</span>}
                    <span className={`text-[11px] font-semibold ${i === 0 ? 'text-white' : 'text-gray-500'}`}>{date}</span>
                    {i === 0 && <div className="h-0.5 w-6 rounded-full bg-[#c8ff00]" />}
                  </div>
                ))}
              </div>

              {/* Slots */}
              <div className="space-y-1.5">
                {TIME_SLOTS.map((time, ti) => (
                  <div key={time} className="slot-row grid grid-cols-[52px_repeat(7,1fr)] gap-1.5 items-center">
                    <span className="text-[11px] text-gray-600 font-mono text-right pr-2 leading-none">{time}</span>
                    {currentSlots[ti].map((status, di) => {
                      const isHeld = held?.ti === ti && held?.di === di;
                      return (
                        <div
                          key={di}
                          onClick={() => handleSlotClick(ti, di)}
                          title={
                            status === 'mine'  ? 'จองแล้ว (ของคุณ)'
                            : status === 'taken' ? 'จองแล้ว (คนอื่น)'
                            : isHeld ? 'กำลังเลือก — กดยืนยัน'
                            : loggedIn ? 'คลิกเพื่อเลือก' : ''
                          }
                          className={`h-8 rounded-lg transition-all duration-150 ${slotCls(status, isHeld, di === 0, loggedIn)}`}
                        />
                      );
                    })}
                  </div>
                ))}
              </div>

              {/* Legend */}
              <div className="mt-6 pt-5 border-t border-white/5 flex items-center justify-between flex-wrap gap-4">
                <div className="flex flex-wrap items-center gap-4 text-[11px] text-gray-500">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-4 rounded-sm bg-gray-800/70" /> ว่าง
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-4 rounded-sm bg-[#c8ff00]/18" /> คนอื่น
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-4 rounded-sm bg-cyan-500/40 ring-1 ring-inset ring-cyan-400/50" /> ของฉัน
                  </span>
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-3 w-4 rounded-sm bg-[#c8ff00]" /> กำลังเลือก
                  </span>
                </div>
                {!loggedIn && (
                  <Link href="/login"
                    className="rounded-full bg-[#c8ff00] px-5 py-2 text-xs font-semibold text-gray-950 hover:bg-white transition-colors">
                    เข้าสู่ระบบเพื่อจอง →
                  </Link>
                )}
              </div>
            </div>
          </div>

          {/* Confirmation panel */}
          {held && loggedIn && (
            <div className="mt-5 rounded-xl border border-[#c8ff00]/25 bg-[#c8ff00]/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  ห้อง {selectedRoom?.code} — {selectedRoom?.name_th}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {dates[held.di]} · {TIME_SLOTS[held.ti]} – {String((held.ti * 2 + 2) % 24).padStart(2, '0')}:00
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setHeld(null)}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                >
                  ยกเลิก
                </button>
                <button
                  onClick={handleConfirm}
                  disabled={confirming}
                  className="rounded-full bg-[#c8ff00] px-5 py-1.5 text-xs font-semibold text-gray-950 hover:bg-white transition-colors disabled:opacity-60 flex items-center gap-1.5"
                  style={{ boxShadow: '0 0 16px rgba(200,255,0,0.3)' }}
                >
                  {confirming && (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  )}
                  ยืนยันการจอง
                </button>
              </div>
            </div>
          )}

          {/* Cancel confirmation panel */}
          {cancelTarget && loggedIn && (
            <div className="mt-5 rounded-xl border border-red-500/25 bg-red-500/5 px-5 py-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-white">
                  ยกเลิกการจอง — ห้อง {selectedRoom?.code}
                </p>
                <p className="text-xs text-gray-400 mt-0.5">
                  {dates[cancelTarget.di]} · {TIME_SLOTS[cancelTarget.ti]} – {String((cancelTarget.ti * 2 + 2) % 24).padStart(2, '0')}:00
                </p>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  onClick={() => setCancelTarget(null)}
                  className="rounded-full border border-white/15 px-4 py-1.5 text-xs text-gray-400 hover:text-white hover:border-white/30 transition-colors"
                >
                  ปิด
                </button>
                <button
                  onClick={handleCancelConfirm}
                  disabled={cancelling}
                  className="rounded-full bg-red-500 px-5 py-1.5 text-xs font-semibold text-white hover:bg-red-400 transition-colors disabled:opacity-60 flex items-center gap-1.5"
                >
                  {cancelling && (
                    <svg className="animate-spin" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21 12a9 9 0 11-6.219-8.56"/>
                    </svg>
                  )}
                  ยืนยันยกเลิก
                </button>
              </div>
            </div>
          )}

          {/* Result message */}
          {bookingMsg && (
            <div className={`mt-3 rounded-xl px-4 py-3 text-sm flex items-center gap-2 ${
              bookingMsg.ok
                ? 'bg-[#c8ff00]/10 border border-[#c8ff00]/20 text-[#c8ff00]'
                : 'bg-red-500/10 border border-red-500/20 text-red-400'
            }`}>
              {bookingMsg.ok
                ? <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>
                : <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12" y2="16"/></svg>
              }
              {bookingMsg.text}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
