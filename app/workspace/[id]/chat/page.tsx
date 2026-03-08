'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getMessages, sendMessage, listMerges, getAgentInfo, approveTask
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative } from '@/lib/utils';
import {
  Send, CheckSquare, FolderOpen, GitMerge,
  ChevronDown, ChevronRight, ThumbsUp, ThumbsDown, Wrench
} from 'lucide-react';

interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type?: string;
  created_at: string;
  read: boolean;
}

interface PlanData {
  type: 'plan';
  task_id: string;
  title: string;
  steps: Array<{ description: string; estimate?: string }> | string[];
  total_estimate?: string;
}

interface SystemEvent {
  id: string;
  text: string;
  created_at: string;
}

type ChatItem =
  | { kind: 'message'; data: Message }
  | { kind: 'event'; data: SystemEvent };

function parsePlan(content: string): PlanData | null {
  try {
    // Try to find JSON block in the message
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
      content.match(/(\{[\s\S]*"type"\s*:\s*"plan"[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type === 'plan') return parsed as PlanData;
    }
    // Try direct parse
    const direct = JSON.parse(content);
    if (direct.type === 'plan') return direct as PlanData;
  } catch {}
  return null;
}

function PlanCard({ plan, workspaceId }: { plan: PlanData; workspaceId: string }) {
  const [expanded, setExpanded] = useState(true);
  const [action, setAction] = useState<'none' | 'reject' | 'fix'>('none');
  const [feedback, setFeedback] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState<'approved' | 'rejected' | 'fixed' | null>(null);

  async function handleApprove() {
    setLoading(true);
    try {
      await approveTask(workspaceId, plan.task_id, { approved: true });
      setDone('approved');
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (action !== 'reject') { setAction('reject'); return; }
    setLoading(true);
    try {
      await approveTask(workspaceId, plan.task_id, { approved: false, feedback });
      setDone('rejected');
    } finally {
      setLoading(false);
    }
  }

  async function handleFix() {
    if (action !== 'fix') { setAction('fix'); return; }
    if (!feedback.trim()) return;
    setLoading(true);
    try {
      await sendMessage(workspaceId, {
        to: '*',
        content: `Re: plan for ${plan.title} — ${feedback}`,
        type: 'plan_feedback',
      });
      setDone('fixed');
    } finally {
      setLoading(false);
    }
  }

  const steps = plan.steps || [];

  if (done) {
    const colors: Record<string, string> = {
      approved: 'border-green-500/30 bg-green-500/5',
      rejected: 'border-red-500/30 bg-red-500/5',
      fixed: 'border-yellow-500/30 bg-yellow-500/5',
    };
    const labels: Record<string, string> = {
      approved: '✅ Plan approved',
      rejected: '👎 Plan rejected',
      fixed: '🔧 Feedback sent',
    };
    return (
      <div className={`rounded-xl border p-3 text-sm text-center ${colors[done]}`}>
        {labels[done]}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 overflow-hidden mt-2">
      {/* Header */}
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-2 p-3 text-left hover:bg-white/5 transition-colors"
      >
        {expanded ? <ChevronDown className="w-4 h-4 text-violet-400 flex-shrink-0" /> : <ChevronRight className="w-4 h-4 text-violet-400 flex-shrink-0" />}
        <span className="text-violet-300 font-medium text-sm flex-1">📋 {plan.title}</span>
        {plan.total_estimate && (
          <span className="text-white/30 text-xs">{plan.total_estimate}</span>
        )}
      </button>

      {/* Steps */}
      {expanded && (
        <div className="px-3 pb-3">
          <div className="space-y-1.5 mb-3">
            {steps.map((step, i) => {
              const desc = typeof step === 'string' ? step : step.description;
              const est = typeof step === 'string' ? null : step.estimate;
              return (
                <div key={i} className="flex items-start gap-2 text-sm">
                  <span className="text-white/25 font-mono text-xs mt-0.5 flex-shrink-0">{i + 1}.</span>
                  <span className="text-white/70 flex-1">{desc}</span>
                  {est && <span className="text-white/30 text-xs flex-shrink-0">{est}</span>}
                </div>
              );
            })}
          </div>

          {/* Feedback input (for reject or fix) */}
          {(action === 'reject' || action === 'fix') && (
            <textarea
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder={action === 'reject' ? 'Why are you rejecting? (optional)' : 'What needs fixing?'}
              className="input-base text-sm resize-none mb-2"
              rows={2}
              autoFocus
            />
          )}

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={handleApprove}
              disabled={loading}
              className="btn-success flex items-center gap-1.5 text-xs"
            >
              <ThumbsUp className="w-3.5 h-3.5" />
              Approve
            </button>
            <button
              onClick={handleFix}
              disabled={loading}
              className="btn-ghost border border-white/10 flex items-center gap-1.5 text-xs"
            >
              <Wrench className="w-3.5 h-3.5" />
              {action === 'fix' ? 'Send feedback' : 'Fix'}
            </button>
            <button
              onClick={handleReject}
              disabled={loading}
              className="btn-danger flex items-center gap-1.5 text-xs"
            >
              <ThumbsDown className="w-3.5 h-3.5" />
              {action === 'reject' ? 'Confirm reject' : 'Reject'}
            </button>
            {action !== 'none' && (
              <button onClick={() => { setAction('none'); setFeedback(''); }} className="btn-ghost text-xs">
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ChatBubble({ msg, isMe, workspaceId }: { msg: Message; isMe: boolean; workspaceId: string }) {
  const plan = parsePlan(msg.content);
  const showPlanOnly = plan !== null;

  return (
    <div className={`flex gap-2 group ${isMe ? 'flex-row-reverse' : ''}`}>
      {/* Avatar */}
      <div className={`w-7 h-7 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold mt-1 ${
        isMe ? 'bg-violet-600/40 text-violet-300' : 'bg-white/10 text-white/60'
      }`}>
        {(msg.from || '?')[0].toUpperCase()}
      </div>

      <div className={`max-w-[80%] min-w-0 ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-1`}>
        {/* Sender + time */}
        <div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
          <span className="text-white/40 text-xs font-medium">{isMe ? 'You' : msg.from}</span>
          <span className="text-white/20 text-xs">{formatRelative(msg.created_at)}</span>
        </div>

        {/* Bubble */}
        {!showPlanOnly && (
          <div className={`px-3 py-2 rounded-2xl text-sm leading-relaxed ${
            isMe
              ? 'bg-violet-600/25 border border-violet-500/20 text-violet-100 rounded-tr-sm'
              : 'bg-white/[0.06] border border-white/[0.08] text-white/80 rounded-tl-sm'
          }`}>
            {msg.content}
          </div>
        )}

        {/* Plan card */}
        {plan && <PlanCard plan={plan} workspaceId={workspaceId} />}
      </div>
    </div>
  );
}

export default function ChatPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const agentInfo = typeof window !== 'undefined' ? getAgentInfo(workspaceId) : null;
  const myId = agentInfo?.id as string | undefined;

  const [items, setItems] = useState<ChatItem[]>([]);
  const [pendingMerges, setPendingMerges] = useState(0);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const base = `/workspace/${workspaceId}`;

  const loadMessages = useCallback(async () => {
    try {
      const [msgs, mergeRes] = await Promise.allSettled([
        getMessages(workspaceId),
        listMerges(workspaceId),
      ]);
      if (msgs.status === 'fulfilled') {
        const list: Message[] = Array.isArray(msgs.value) ? msgs.value : msgs.value?.messages || [];
        const sorted = list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
        setItems((prev) => {
          // Preserve system events, replace messages
          const events = prev.filter((i) => i.kind === 'event');
          const msgItems: ChatItem[] = sorted.map((m) => ({ kind: 'message', data: m }));
          // Merge and sort by timestamp
          const all: ChatItem[] = [...events, ...msgItems];
          all.sort((a, b) => {
            const aTime = a.kind === 'message' ? a.data.created_at : a.data.created_at;
            const bTime = b.kind === 'message' ? b.data.created_at : b.data.created_at;
            return new Date(aTime).getTime() - new Date(bTime).getTime();
          });
          return all;
        });
      }
      if (mergeRes.status === 'fulfilled') {
        const list = Array.isArray(mergeRes.value) ? mergeRes.value : mergeRes.value?.merges || [];
        setPendingMerges(list.filter((m: { status: string }) => m.status === 'pending').length);
      }
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  function addSystemEvent(text: string) {
    const event: SystemEvent = {
      id: `evt-${Date.now()}-${Math.random()}`,
      text,
      created_at: new Date().toISOString(),
    };
    setItems((prev) => {
      const all = [...prev, { kind: 'event' as const, data: event }];
      all.sort((a, b) => {
        const aTime = a.data.created_at;
        const bTime = b.data.created_at;
        return new Date(aTime).getTime() - new Date(bTime).getTime();
      });
      return all;
    });
  }

  useEffect(() => {
    loadMessages();

    const unsub = wsClient.subscribe((event) => {
      if (event.type === 'message_sent') {
        loadMessages();
        return;
      }
      // Activity events → system messages
      if (event.type === 'task_claimed') {
        const agentName = (event.agent_id as string) || 'An agent';
        const taskId = (event.task_id as string) || '';
        addSystemEvent(`🔧 ${agentName} claimed ${taskId}`);
      } else if (event.type === 'task_updated') {
        const status = event.status as string;
        const agentName = (event.agent_id as string) || 'An agent';
        const taskId = (event.task_id as string) || '';
        if (status === 'done') {
          addSystemEvent(`✅ ${agentName} completed ${taskId}`);
        } else if (status === 'in_progress') {
          addSystemEvent(`⚡ ${agentName} started working on ${taskId}`);
        }
      } else if (event.type === 'merge_requested') {
        const agentName = (event.agent_id as string) || 'An agent';
        const source = (event.source as string) || '';
        addSystemEvent(`📦 ${agentName} requested merge for ${source}`);
        setPendingMerges((n) => n + 1);
      } else if (event.type === 'merge_voted') {
        loadMessages();
      } else if (event.type === 'agent_joined') {
        const name = (event.display_name as string) || (event.agent_id as string) || 'Someone';
        addSystemEvent(`👋 ${name} joined the workspace`);
      } else if (event.type === 'agent_left') {
        const name = (event.agent_id as string) || 'An agent';
        addSystemEvent(`👋 ${name} left the workspace`);
      }
    });

    return () => { unsub(); };
  }, [workspaceId, loadMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [items]);

  async function handleSend() {
    const text = input.trim();
    if (!text || sending) return;
    setSending(true);
    setInput('');
    try {
      await sendMessage(workspaceId, { to: '*', content: text });
      await loadMessages();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  return (
    <div className="flex flex-col h-full">
      {/* Quick actions bar */}
      <div className="flex items-center gap-2 px-4 py-2.5 border-b border-white/[0.06] flex-shrink-0 bg-black/20">
        <Link
          href={`${base}/tasks`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <CheckSquare className="w-3.5 h-3.5" />
          View Tasks
        </Link>
        <Link
          href={`${base}/files`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <FolderOpen className="w-3.5 h-3.5" />
          Files
        </Link>
        <Link
          href={`${base}/merges`}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs text-white/50 hover:text-white/80 hover:bg-white/5 transition-all"
        >
          <GitMerge className="w-3.5 h-3.5" />
          Merges
          {pendingMerges > 0 && (
            <span className="bg-yellow-500/20 text-yellow-400 border border-yellow-500/20 text-xs px-1.5 py-0.5 rounded-full font-medium">
              {pendingMerges}
            </span>
          )}
        </Link>
      </div>

      {/* Message feed */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {loading ? (
          <div className="space-y-3 pt-4">
            {[...Array(4)].map((_, i) => (
              <div key={i} className={`flex gap-2 ${i % 2 === 1 ? 'flex-row-reverse' : ''}`}>
                <div className="w-7 h-7 rounded-full bg-white/10 animate-pulse flex-shrink-0" />
                <div className={`h-10 rounded-2xl animate-pulse ${i % 2 === 1 ? 'bg-violet-600/20' : 'bg-white/5'}`}
                  style={{ width: `${140 + Math.random() * 120}px` }} />
              </div>
            ))}
          </div>
        ) : items.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center space-y-2">
              <p className="text-white/20 text-4xl">💬</p>
              <p className="text-white/40 text-sm">No messages yet</p>
              <p className="text-white/25 text-xs">Type below to broadcast to all agents</p>
            </div>
          </div>
        ) : (
          items.map((item, i) => {
            if (item.kind === 'event') {
              return (
                <div key={item.data.id} className="flex items-center gap-3 py-1">
                  <div className="flex-1 h-px bg-white/[0.04]" />
                  <span className="text-white/30 text-xs px-2">{item.data.text}</span>
                  <div className="flex-1 h-px bg-white/[0.04]" />
                </div>
              );
            }
            const msg = item.data;
            const isMe = !!myId && msg.from === myId;
            return (
              <ChatBubble key={msg.id || i} msg={msg} isMe={isMe} workspaceId={workspaceId} />
            );
          })
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className="px-4 py-3 border-t border-white/[0.08] flex-shrink-0 bg-black/30">
        <div className="flex items-end gap-2">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => {
              setInput(e.target.value);
              // Auto-resize
              e.target.style.height = 'auto';
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
            }}
            onKeyDown={handleKeyDown}
            placeholder="Message the team... (Enter to send, Shift+Enter for newline)"
            className="input-base flex-1 resize-none min-h-[40px] max-h-[120px] py-2.5 leading-relaxed"
            rows={1}
            disabled={sending}
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="btn-primary flex-shrink-0 h-10 w-10 flex items-center justify-center p-0"
          >
            <Send className="w-4 h-4" />
          </button>
        </div>
        <p className="text-white/20 text-xs mt-1.5">Broadcasting to all agents · Enter to send</p>
      </div>
    </div>
  );
}
