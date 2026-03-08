'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams } from 'next/navigation';
import { getMessages, sendMessage, markRead, listAgents, getAgentInfo } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative } from '@/lib/utils';
import { Send, MessageSquare, Check, CheckCheck } from 'lucide-react';

interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type?: string;
  created_at: string;
  read: boolean;
}

interface Agent {
  id: string;
  display_name: string;
}

export default function MessagesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const agentInfo = typeof window !== 'undefined' ? getAgentInfo(workspaceId) : null;
  const myId = agentInfo?.id as string | undefined;

  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [loading, setLoading] = useState(true);
  const [to, setTo] = useState('*');
  const [content, setContent] = useState('');
  const [sending, setSending] = useState(false);
  const [filterUnread, setFilterUnread] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  async function load() {
    try {
      const [msgs, agts] = await Promise.allSettled([
        getMessages(workspaceId),
        listAgents(workspaceId),
      ]);
      if (msgs.status === 'fulfilled') {
        const list = Array.isArray(msgs.value) ? msgs.value : msgs.value?.messages || [];
        setMessages(list.sort((a: Message, b: Message) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()));
      }
      if (agts.status === 'fulfilled') {
        setAgents(Array.isArray(agts.value) ? agts.value : agts.value?.agents || []);
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setSending(true);
    try {
      await sendMessage(workspaceId, { to, content: content.trim() });
      setContent('');
      await load();
    } finally {
      setSending(false);
    }
  }

  async function handleMarkRead(msgId: string) {
    await markRead(workspaceId, msgId);
    setMessages((prev) => prev.map((m) => m.id === msgId ? { ...m, read: true } : m));
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (e.type === 'message_sent') load();
    });
    return () => { unsub(); };
  }, [workspaceId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const filtered = filterUnread ? messages.filter((m) => !m.read) : messages;
  const unreadCount = messages.filter((m) => !m.read && m.to === myId).length;

  function isMe(msg: Message) {
    return myId && msg.from === myId;
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-6 py-4 border-b border-white/[0.08] flex items-center justify-between flex-shrink-0">
        <div>
          <h1 className="text-xl font-bold text-white">Messages</h1>
          {unreadCount > 0 && (
            <p className="text-blue-400 text-sm">{unreadCount} unread</p>
          )}
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={filterUnread}
            onChange={(e) => setFilterUnread(e.target.checked)}
            className="rounded"
          />
          <span className="text-white/50 text-sm">Unread only</span>
        </label>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {loading ? (
          <div className="space-y-3">
            {[...Array(5)].map((_, i) => <div key={i} className="h-16 bg-white/5 rounded-xl animate-pulse" />)}
          </div>
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <MessageSquare className="w-12 h-12 text-white/15 mx-auto mb-3" />
              <p className="text-white/30 text-sm">No messages yet</p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-3 group ${isMe(msg) ? 'flex-row-reverse' : ''}`}
              >
                {/* Avatar */}
                <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-medium ${
                  isMe(msg) ? 'bg-violet-600/30 text-violet-300' : 'bg-blue-600/20 text-blue-400'
                }`}>
                  {(msg.from || '?')[0].toUpperCase()}
                </div>

                {/* Bubble */}
                <div className={`max-w-md ${isMe(msg) ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
                  <div className={`flex items-baseline gap-2 ${isMe(msg) ? 'flex-row-reverse' : ''}`}>
                    <span className="text-white/40 text-xs">{msg.from}</span>
                    {msg.to !== '*' && (
                      <span className="text-white/25 text-xs">→ {msg.to}</span>
                    )}
                    <span className="text-white/20 text-xs">{formatRelative(msg.created_at)}</span>
                  </div>
                  <div className={`px-3 py-2 rounded-xl text-sm ${
                    isMe(msg)
                      ? 'bg-violet-600/20 border border-violet-500/20 text-violet-100 rounded-tr-sm'
                      : 'bg-white/5 border border-white/[0.08] text-white/80 rounded-tl-sm'
                  } ${!msg.read && !isMe(msg) ? 'border-blue-500/30' : ''}`}>
                    {msg.content}
                  </div>
                  <div className={`flex items-center gap-2 ${isMe(msg) ? 'flex-row-reverse' : ''}`}>
                    {!msg.read && !isMe(msg) && (
                      <button
                        onClick={() => handleMarkRead(msg.id)}
                        className="text-blue-400/60 hover:text-blue-400 text-xs opacity-0 group-hover:opacity-100 transition-all"
                      >
                        Mark read
                      </button>
                    )}
                    {msg.read
                      ? <CheckCheck className="w-3 h-3 text-green-400/50" />
                      : <Check className="w-3 h-3 text-white/20" />
                    }
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Compose */}
      <div className="px-6 py-4 border-t border-white/[0.08] flex-shrink-0 bg-black/20">
        <form onSubmit={handleSend} className="flex gap-2">
          <select
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="input-base w-40 flex-shrink-0"
          >
            <option value="*">Broadcast (*)</option>
            {agents.filter((a) => a.id !== myId).map((a) => (
              <option key={a.id} value={a.id}>{a.display_name || a.id}</option>
            ))}
          </select>
          <input
            className="input-base flex-1"
            placeholder="Type a message..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(e); } }}
          />
          <button type="submit" disabled={sending || !content.trim()} className="btn-primary flex-shrink-0">
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>
    </div>
  );
}
