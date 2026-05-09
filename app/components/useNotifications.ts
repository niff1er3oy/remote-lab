'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export type Notification = {
  notification_id: string;
  title: string;
  message: string;
  type: 'info' | 'success' | 'warning' | 'error';
  action_url?: string | null;
  is_read: number;
  created_at: string;
};

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'เพิ่งเมื่อกี้';
  if (mins < 60) return `${mins} นาทีที่แล้ว`;
  const h = Math.floor(mins / 60);
  if (h < 24) return `${h} ชั่วโมงที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

export const TYPE_ICON: Record<string, { bg: string; text: string; path: string }> = {
  success: { bg: 'bg-[#c8ff00]/10', text: 'text-[#c8ff00]',  path: 'M20 6L9 17l-5-5' },
  warning: { bg: 'bg-yellow-500/10', text: 'text-yellow-400', path: 'M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z' },
  error:   { bg: 'bg-red-500/10',    text: 'text-red-400',    path: 'M18 6L6 18M6 6l12 12' },
  info:    { bg: 'bg-cyan-500/10',   text: 'text-cyan-400',   path: 'M12 8v4m0 4h.01M12 2a10 10 0 100 20 10 10 0 000-20z' },
};

export function useNotifications() {
  const [loggedIn,      setLoggedIn]      = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unread,        setUnread]        = useState(0);
  const [toasts,        setToasts]        = useState<Notification[]>([]);
  const seenIds = useRef<Set<string>>(new Set());

  const refreshNotifications = useCallback(async () => {
    const res = await fetch('/api/notifications');
    if (!res.ok) return;
    const nd = await res.json();
    const list: Notification[] = nd.notifications ?? [];
    const fresh = list.filter(n => !n.is_read && !seenIds.current.has(n.notification_id));
    fresh.forEach(n => seenIds.current.add(n.notification_id));
    if (fresh.length > 0) setToasts(prev => [...fresh.slice(0, 3), ...prev].slice(0, 5));
    setNotifications(list);
    setUnread(nd.unread ?? 0);
  }, []);

  const checkUpcoming = useCallback(async () => {
    try {
      await fetch('/api/bookings/notify-upcoming', { method: 'POST' });
      await refreshNotifications();
    } catch {}
  }, [refreshNotifications]);

  useEffect(() => {
    fetch('/api/auth/me')
      .then(r => r.ok ? r.json() : null)
      .then(d => { if (d?.ok) { setLoggedIn(true); checkUpcoming(); } })
      .catch(() => {});
  }, [checkUpcoming]);

  useEffect(() => {
    if (!loggedIn) return;
    const id = setInterval(checkUpcoming, 30_000);
    return () => clearInterval(id);
  }, [loggedIn, checkUpcoming]);

  async function markAllRead() {
    await fetch('/api/notifications', { method: 'PATCH' });
    setNotifications(prev => prev.map(n => ({ ...n, is_read: 1 })));
    setUnread(0);
  }

  function dismissToast(id: string) {
    setToasts(prev => prev.filter(t => t.notification_id !== id));
  }

  return { loggedIn, notifications, unread, toasts, markAllRead, dismissToast };
}
