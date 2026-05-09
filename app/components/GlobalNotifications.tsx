'use client';

import { useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import { animate, stagger } from 'animejs';
import { useNotifications, formatRelative, TYPE_ICON, type Notification } from './useNotifications';

export type { Notification };

// ── Toast ─────────────────────────────────────────────────────────────────────

function Toast({ notif, onDismiss }: { notif: Notification; onDismiss: () => void }) {
  const ref  = useRef<HTMLDivElement>(null);
  const s    = TYPE_ICON[notif.type] ?? TYPE_ICON.info;
  const isSuccess = notif.type === 'success';

  useEffect(() => {
    const t = setTimeout(onDismiss, notif.action_url ? 60_000 : 20_000);
    return () => clearTimeout(t);
  }, [notif.action_url, onDismiss]);

  // Slide in from left on mount
  useEffect(() => {
    if (ref.current)
      animate(ref.current, { opacity: [0, 1], translateX: [-28, 0], scale: [0.95, 1], duration: 380, ease: 'outBack' });
  }, []);

  return (
    <div ref={ref}
      className={`flex items-start gap-3 rounded-2xl border px-4 py-3 shadow-2xl backdrop-blur-xl w-80
        ${isSuccess ? 'border-[#c8ff00]/30 bg-gray-950/95' : 'border-white/10 bg-gray-950/90'}`}
      style={{ opacity: 0, boxShadow: isSuccess ? '0 8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(200,255,0,0.1)' : '0 8px 32px rgba(0,0,0,0.5)' }}
    >
      <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <path d={s.path} />
        </svg>
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-xs font-semibold text-white leading-snug">{notif.title}</p>
        <p className="mt-0.5 text-[11px] text-gray-400 leading-relaxed">{notif.message}</p>
        {notif.action_url && (
          <a href={notif.action_url}
            className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#c8ff00] px-3 py-1 text-[11px] font-semibold text-gray-950 hover:bg-white transition-colors"
            style={{ boxShadow: '0 0 10px rgba(200,255,0,0.3)' }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
              <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
            </svg>
            เข้าห้องแลป
          </a>
        )}
      </div>
      <button onClick={onDismiss} className="shrink-0 text-gray-600 hover:text-gray-400 transition-colors mt-0.5">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
          <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
        </svg>
      </button>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function GlobalNotifications() {
  const pathname   = usePathname();
  const { loggedIn, notifications, unread, toasts, markAllRead, dismissToast } = useNotifications();
  const [panelOpen, setPanelOpen] = useState(false);
  const bellRef    = useRef<HTMLButtonElement>(null);
  const prevUnread = useRef(0);

  // Bell wiggle when unread count increases
  useEffect(() => {
    if (unread > prevUnread.current && bellRef.current)
      animate(bellRef.current, { rotate: [0, -18, 14, -10, 6, 0], duration: 550, ease: 'outElastic(1, 0.5)' });
    prevUnread.current = unread;
  }, [unread]);

  if (pathname.startsWith('/lab')) return null;
  if (!loggedIn) return null;

  return (
    <>
      {/* Toast stack — bottom-left */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-6 z-[60] flex flex-col-reverse gap-2">
          {toasts.map(t => (
            <Toast key={t.notification_id} notif={t} onDismiss={() => dismissToast(t.notification_id)} />
          ))}
        </div>
      )}

      {/* Floating bell — bottom-right */}
      <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
        {panelOpen && (
          <>
            <div className="fixed inset-0 z-[-1]" onClick={() => setPanelOpen(false)} />
            <NotifPanel notifications={notifications} unread={unread} onMarkAllRead={markAllRead} />
          </>
        )}
        <button
          ref={bellRef}
          onClick={() => setPanelOpen(v => !v)}
          className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-all shadow-lg ${
            panelOpen ? 'border-[#c8ff00]/50 bg-[#c8ff00]/10 text-[#c8ff00]' : 'border-white/10 bg-gray-900 text-gray-400 hover:border-[#c8ff00]/30 hover:text-white'
          }`}
          style={{ boxShadow: panelOpen ? '0 0 20px rgba(200,255,0,0.2)' : '0 4px 16px rgba(0,0,0,0.4)' }}
          aria-label="การแจ้งเตือน"
        >
          <BellIcon />
          {unread > 0 && <UnreadBadge count={unread} />}
        </button>
      </div>
    </>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

export function BellIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
      <path d="M13.73 21a2 2 0 01-3.46 0"/>
    </svg>
  );
}

export function UnreadBadge({ count }: { count: number }) {
  return (
    <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#c8ff00] text-gray-950 text-[9px] font-bold flex items-center justify-center px-1"
      style={{ boxShadow: '0 0 8px rgba(200,255,0,0.5)' }}>
      {count > 9 ? '9+' : count}
    </span>
  );
}

export function NotifPanel({ notifications, unread, onMarkAllRead, maxH = '400px', panelClass = 'w-80' }: {
  notifications: Notification[];
  unread: number;
  onMarkAllRead: () => void;
  maxH?: string;
  panelClass?: string;
}) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Panel slide up + stagger items on open
  useEffect(() => {
    if (!panelRef.current) return;
    animate(panelRef.current, { opacity: [0, 1], translateY: [12, 0], scale: [0.96, 1], duration: 280, ease: 'outBack' });
    const items = panelRef.current.querySelectorAll('.notif-item');
    if (items.length)
      animate(items, { opacity: [0, 1], translateX: [-8, 0], duration: 240, delay: stagger(35, { start: 120 }), ease: 'outCubic' });
  }, []);

  return (
    <div ref={panelRef}
      className={`${panelClass} rounded-2xl border border-white/10 bg-gray-950 backdrop-blur-xl shadow-2xl overflow-hidden`}
      style={{ opacity: 0, boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
      <div className="px-4 py-3 border-b border-white/[0.06] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-white">การแจ้งเตือน</span>
          {unread > 0 && (
            <span className="min-w-[18px] h-[18px] rounded-full bg-[#c8ff00] text-gray-950 text-[9px] font-bold flex items-center justify-center px-1">
              {unread > 9 ? '9+' : unread}
            </span>
          )}
        </div>
        {unread > 0 && (
          <button onClick={onMarkAllRead} className="text-[11px] text-gray-500 hover:text-white transition-colors">
            อ่านทั้งหมด
          </button>
        )}
      </div>
      <div className="overflow-y-auto" style={{ maxHeight: maxH }}>
        {notifications.length === 0 ? (
          <div className="px-4 py-10 text-center">
            <p className="text-xs text-gray-500">ไม่มีการแจ้งเตือน</p>
          </div>
        ) : (
          <ul className="divide-y divide-white/[0.04]">
            {notifications.map(n => {
              const s = TYPE_ICON[n.type] ?? TYPE_ICON.info;
              return (
                <li key={n.notification_id}
                  className={`notif-item flex items-start gap-3 px-4 py-3 ${!n.is_read ? 'bg-white/[0.03]' : ''}`}
                  style={{ opacity: 0 }}>
                  <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                      <path d={s.path} />
                    </svg>
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`text-xs font-medium leading-snug ${n.is_read ? 'text-gray-400' : 'text-white'}`}>{n.title}</p>
                    <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">{n.message}</p>
                    <p className="mt-1 text-[10px] text-gray-600">{formatRelative(n.created_at)}</p>
                    {n.action_url && (
                      <a href={n.action_url}
                        className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#c8ff00] px-3 py-1 text-[11px] font-semibold text-gray-950 hover:bg-white transition-colors"
                        style={{ boxShadow: '0 0 10px rgba(200,255,0,0.3)' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                          <path d="M15 3h6v6M10 14L21 3M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6"/>
                        </svg>
                        เข้าห้องแลป
                      </a>
                    )}
                  </div>
                  {!n.is_read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-[#c8ff00]" />}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
