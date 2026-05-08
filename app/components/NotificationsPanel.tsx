'use client';

import { useState } from 'react';

export type Notification = {
  notification_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  action_url?: string | null;
  is_read: number;
  created_at: string;
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เพิ่งเมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ชั่วโมงที่แล้ว`;
  return `${Math.floor(hours / 24)} วันที่แล้ว`;
}

const TYPE_STYLE: Record<string, { bg: string; text: string; icon: React.ReactNode }> = {
  success: {
    bg: 'bg-[#c8ff00]/10', text: 'text-[#c8ff00]',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M20 6L9 17l-5-5"/></svg>,
  },
  warning: {
    bg: 'bg-yellow-500/10', text: 'text-yellow-400',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>,
  },
  error: {
    bg: 'bg-red-500/10', text: 'text-red-400',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>,
  },
  info: {
    bg: 'bg-cyan-500/10', text: 'text-cyan-400',
    icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>,
  },
};

export default function NotificationsPanel({
  notifications,
  unread,
  onMarkAllRead,
}: {
  notifications: Notification[];
  unread: number;
  onMarkAllRead: () => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3">
      {/* Panel */}
      {open && (
        <>
          {/* Backdrop */}
          <div className="fixed inset-0 z-[-1]" onClick={() => setOpen(false)} />

          <div className="w-80 rounded-2xl border border-white/10 bg-gray-950/95 backdrop-blur-xl shadow-2xl overflow-hidden"
            style={{ boxShadow: '0 8px 40px rgba(0,0,0,0.6), 0 0 0 1px rgba(255,255,255,0.06)' }}>
            {/* Header */}
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

            {/* List */}
            <div className="max-h-[400px] overflow-y-auto">
              {notifications.length === 0 ? (
                <div className="px-4 py-10 text-center">
                  <p className="text-xs text-gray-500">ไม่มีการแจ้งเตือน</p>
                </div>
              ) : (
                <ul className="divide-y divide-white/[0.04]">
                  {notifications.map(n => {
                    const s = TYPE_STYLE[n.type] ?? TYPE_STYLE.info;
                    return (
                      <li key={n.notification_id}
                        className={`flex items-start gap-3 px-4 py-3 ${!n.is_read ? 'bg-white/[0.03]' : ''}`}>
                        <span className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${s.bg} ${s.text}`}>
                          {s.icon}
                        </span>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium leading-snug ${n.is_read ? 'text-gray-400' : 'text-white'}`}>
                            {n.title}
                          </p>
                          <p className="mt-0.5 text-[11px] text-gray-500 leading-relaxed">{n.message}</p>
                          <p className="mt-1 text-[10px] text-gray-600">{formatRelative(n.created_at)}</p>
                          {n.action_url && (
                            <a
                              href={n.action_url}
                              className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#c8ff00] px-3 py-1 text-[11px] font-semibold text-gray-950 hover:bg-white transition-colors"
                              style={{ boxShadow: '0 0 10px rgba(200,255,0,0.3)' }}
                            >
                              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
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
        </>
      )}

      {/* Bell button */}
      <button
        onClick={() => setOpen(v => !v)}
        className={`relative flex h-12 w-12 items-center justify-center rounded-full border transition-all shadow-lg ${
          open
            ? 'border-[#c8ff00]/50 bg-[#c8ff00]/10 text-[#c8ff00]'
            : 'border-white/10 bg-gray-900 text-gray-400 hover:border-[#c8ff00]/30 hover:text-white'
        }`}
        style={{ boxShadow: open ? '0 0 20px rgba(200,255,0,0.2)' : '0 4px 16px rgba(0,0,0,0.4)' }}
        aria-label="การแจ้งเตือน"
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M18 8A6 6 0 006 8c0 7-3 9-3 9h18s-3-2-3-9"/>
          <path d="M13.73 21a2 2 0 01-3.46 0"/>
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] rounded-full bg-[#c8ff00] text-gray-950 text-[9px] font-bold flex items-center justify-center px-1"
            style={{ boxShadow: '0 0 8px rgba(200,255,0,0.5)' }}>
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
    </div>
  );
}
