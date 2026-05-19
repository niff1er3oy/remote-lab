'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';

function getRemaining(endTime: string): number {
  return Math.max(0, Math.floor((new Date(endTime).getTime() - Date.now()) / 1000));
}

function hhmmss(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return [h, m, sec].map(n => String(n).padStart(2, '0')).join(':');
}

type RoomInfo = { labName: string; labCode: string; hostName: string; endTime: string };
type ChatMsg  = { id: number; user_id: string; user_name: string; content: string; created_at: string };

function getOrCreateViewerId(): string {
  const key = 'viewer_id';
  let id = localStorage.getItem(key);
  if (!id || id.startsWith('viewer_')) {
    id = crypto.randomUUID();
    localStorage.setItem(key, id);
  }
  return id;
}

function ViewerChatPanel({ roomCode }: { roomCode: string }) {
  const [messages, setMessages]   = useState<ChatMsg[]>([]);
  const [labCode, setLabCode]     = useState<string | null>(null);
  const [viewerName, setViewerName] = useState('');
  const [nameInput, setNameInput] = useState('');
  const [nameSet, setNameSet]     = useState(false);
  const [input, setInput]         = useState('');
  const [sending, setSending]     = useState(false);
  const [sendError, setSendError] = useState('');
  const labCodeRef                = useRef<string | null>(null);
  const viewerIdRef               = useRef<string>('');
  const lastIdRef                 = useRef(0);
  const bottomRef                 = useRef<HTMLDivElement>(null);
  const inputRef                  = useRef<HTMLInputElement>(null);
  const audioRef                  = useRef<HTMLAudioElement | null>(null);
  const readyForSound             = useRef(false);

  useEffect(() => {
    const stored = localStorage.getItem('viewer_name');
    if (stored) { setViewerName(stored); setNameSet(true); }
    viewerIdRef.current = getOrCreateViewerId();
  }, []);

  const addMessages = useCallback((incoming: ChatMsg[]) => {
    if (!incoming.length) return;
    setMessages(prev => {
      const seen  = new Set(prev.map(m => m.id));
      const fresh = incoming.filter(m => !seen.has(m.id));
      if (!fresh.length) return prev;
      lastIdRef.current = Math.max(lastIdRef.current, fresh[fresh.length - 1].id);

      if (readyForSound.current && fresh.some(m => m.user_id !== viewerIdRef.current)) {
        if (!audioRef.current) audioRef.current = new Audio('/sound/ack.mp3');
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }

      requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }));
      return [...prev, ...fresh];
    });
  }, []);

  const fetchMessages = useCallback(async () => {
    const res = await fetch(`/api/lab/chat-view?room=${roomCode}&since=${lastIdRef.current}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.lab_code && !labCodeRef.current) {
      labCodeRef.current = data.lab_code;
      setLabCode(data.lab_code);
    }
    if (data.messages?.length) addMessages(data.messages);
  }, [roomCode, addMessages]);

  useEffect(() => {
    fetchMessages().then(() => { readyForSound.current = true; });
    const t = setInterval(fetchMessages, 10_000);
    return () => clearInterval(t);
  }, [fetchMessages]);

  useEffect(() => {
    if (!labCode) return;
    let active = true;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryDelay = 1000;

    function connect() {
      if (!active) return;
      const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${location.host}/ws?room=${encodeURIComponent(`lab:${labCode}`)}`);
      ws.onmessage = (e) => {
        if (!active) return;
        try {
          const msg = JSON.parse(e.data as string);
          if (msg.type === 'chat' && msg.payload?.id) addMessages([msg.payload]);
        } catch { }
      };
      ws.onopen  = () => { retryDelay = 1000; };
      ws.onclose = () => {
        if (!active) return;
        retryTimer = setTimeout(() => { retryDelay = Math.min(retryDelay * 2, 30_000); connect(); }, retryDelay);
      };
      ws.onerror = () => { };
    }

    connect();
    return () => {
      active = false;
      if (retryTimer) clearTimeout(retryTimer);
      ws?.close();
    };
  }, [labCode, addMessages]);

  function confirmName(e: React.FormEvent) {
    e.preventDefault();
    const n = nameInput.trim();
    if (!n) return;
    localStorage.setItem('viewer_name', n);
    setViewerName(n);
    setNameSet(true);
    setTimeout(() => inputRef.current?.focus(), 50);
  }

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setSendError('');
    try {
      const res = await fetch('/api/lab/chat-view', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ room: roomCode, name: viewerName, viewer_id: viewerIdRef.current, content: text }),
      });
      const data = await res.json();
      if (res.ok && data.message) {
        setInput('');
        addMessages([data.message]);
      } else {
        setSendError(data.error ?? 'ส่งข้อความไม่สำเร็จ');
      }
    } catch {
      setSendError('ไม่สามารถเชื่อมต่อได้');
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto p-2.5 space-y-2">
        {messages.length === 0 && (
          <p className="text-center text-[10px] text-gray-600 pt-4">ยังไม่มีข้อความ</p>
        )}
        {messages.map(m => {
          const isMe = m.user_id === viewerIdRef.current;
          return (
            <div key={m.id} className={`flex ${isMe ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[88%] text-[11px] rounded-xl px-2.5 py-1.5 leading-relaxed ${
                isMe
                  ? 'bg-cyan-500/10 border border-cyan-500/20 text-cyan-300/90'
                  : 'bg-gray-800/60 border border-white/[0.07] text-gray-300'
              }`}>
                {!isMe && <p className="text-[9px] text-gray-500 mb-0.5 font-semibold">{m.user_name}</p>}
                {m.content}
              </div>
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      {!nameSet ? (
        <form onSubmit={confirmName} className="shrink-0 p-3 border-t border-white/5 space-y-2">
          <p className="text-[10px] text-gray-500 text-center">ระบุชื่อที่จะแสดงในแชท</p>
          <div className="flex gap-1.5">
            <input
              value={nameInput}
              onChange={e => setNameInput(e.target.value)}
              placeholder="ชื่อของคุณ…"
              maxLength={40}
              autoFocus
              className="flex-1 rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
            />
            <button
              type="submit"
              disabled={!nameInput.trim()}
              className="shrink-0 rounded-lg bg-cyan-500/20 border border-cyan-500/30 px-3 text-[11px] text-cyan-400 font-semibold hover:bg-cyan-500/30 disabled:opacity-30 transition-colors"
            >
              ตกลง
            </button>
          </div>
        </form>
      ) : (
        <div className="shrink-0 border-t border-white/5">
          {sendError && (
            <p className="px-3 pt-2 text-[10px] text-red-400 flex items-center gap-1">
              <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {sendError}
            </p>
          )}
          <div className="p-2 flex gap-1.5 items-center">
          <input
            ref={inputRef}
            value={input}
            onChange={e => { setInput(e.target.value); if (sendError) setSendError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
            placeholder={`ส่งข้อความในฐานะ ${viewerName}…`}
            maxLength={1000}
            className="flex-1 rounded-lg border border-white/10 bg-gray-950/80 px-2.5 py-1.5 text-[11px] text-white placeholder-gray-600 focus:outline-none focus:border-cyan-500/40 transition-colors"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="shrink-0 h-8 w-8 rounded-lg bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 flex items-center justify-center hover:bg-cyan-500/20 disabled:opacity-30 transition-colors"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <line x1="22" y1="2" x2="11" y2="13" /><polygon points="22 2 15 22 11 13 2 9 22 2" />
            </svg>
          </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default function ViewerPage() {
  const params = useParams();
  const code   = ((params.code as string) ?? '').toUpperCase();

  const [info, setInfo]           = useState<RoomInfo | null>(null);
  const [error, setError]         = useState<string | null>(null);
  const [remaining, setRemaining] = useState(0);

  useEffect(() => {
    if (!code) return;
    fetch(`/api/lab/view?room=${code}`)
      .then(r => r.json())
      .then(d => {
        if (d.ok) {
          setInfo({ labName: d.lab_name, labCode: d.lab_code, hostName: d.host_name, endTime: d.end_time });
          setRemaining(getRemaining(d.end_time));
        } else {
          setError(d.error ?? 'ไม่พบห้องนี้');
        }
      })
      .catch(() => setError('ไม่สามารถเชื่อมต่อได้'));
  }, [code]);

  useEffect(() => {
    if (!info) return;
    const t = setInterval(() => setRemaining(getRemaining(info.endTime)), 1000);
    return () => clearInterval(t);
  }, [info]);

  if (!info && !error) {
    return (
      <div className="min-h-screen bg-[#030712] flex items-center justify-center">
        <svg className="animate-spin text-[#c8ff00]" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M21 12a9 9 0 11-6.219-8.56" />
        </svg>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#030712] flex flex-col items-center justify-center px-6 text-center">
        <div className="fixed inset-0 pointer-events-none" style={{
          backgroundImage: 'linear-gradient(rgba(200,255,0,0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.03) 1px, transparent 1px)',
          backgroundSize: '64px 64px',
        }} />
        <div className="relative z-10 max-w-sm w-full">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl border border-red-500/20 bg-red-500/10">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#f87171" strokeWidth="1.5" strokeLinecap="round">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
          </div>
          <h1 className="text-xl font-bold text-white mb-2">ไม่พบห้องนี้</h1>
          <p className="text-sm text-gray-400 mb-6">{error}</p>
          <a href="/"
            className="inline-block rounded-full bg-[#c8ff00] px-6 py-2.5 text-sm font-semibold text-gray-950 hover:bg-white transition-colors"
            style={{ boxShadow: '0 0 20px rgba(200,255,0,0.25)' }}>
            กลับหน้าแรก
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-[#030712] text-white overflow-hidden">
      <div className="fixed inset-0 pointer-events-none" style={{
        backgroundImage: 'linear-gradient(rgba(200,255,0,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(200,255,0,0.025) 1px, transparent 1px)',
        backgroundSize: '64px 64px',
      }} />

      {/* Header */}
      <div className="relative z-10 shrink-0 h-12 border-b border-white/10 bg-gray-950/80 backdrop-blur flex items-center justify-between px-4 gap-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="shrink-0 rounded-md border border-[#c8ff00]/30 bg-[#c8ff00]/10 px-2 py-0.5 font-mono text-xs font-bold tracking-widest text-[#c8ff00]">
            {code}
          </span>
          <span className="text-sm text-white truncate">{info!.labName}</span>
          <span className="hidden sm:block text-[10px] text-gray-500 shrink-0">เจ้าของห้อง: {info!.hostName}</span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <span className="text-xs text-gray-500 font-mono">{hhmmss(remaining)}</span>
          <span className="text-[10px] border border-cyan-500/30 text-cyan-400/70 rounded-full px-2 py-0.5">Viewer</span>
        </div>
      </div>

      {/* Chat (read-only) */}
      <div className="relative z-10 flex-1 min-h-0 max-w-2xl w-full mx-auto p-4">
        <div className="h-full rounded-xl border border-white/10 bg-gray-900/50 overflow-hidden flex flex-col">
          <div className="shrink-0 px-4 py-2.5 border-b border-white/[0.06] flex items-center gap-2">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#c8ff00] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[#c8ff00]" />
            </span>
            <span className="text-xs font-semibold text-white">แชทห้องแลป</span>
            <span className="ml-auto font-mono text-[10px] text-gray-600">{code}</span>
          </div>
          <ViewerChatPanel roomCode={code} />
        </div>
      </div>
    </div>
  );
}
