'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listMerges, listTasks, listEvents, getMessages, sendMessage,
  voteMerge, updateTask, claimTask, getAgentInfo
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative, STATUS_COLORS } from '@/lib/utils';
import {
  GitMerge, CheckSquare, AlertCircle, CheckCircle, XCircle,
  Clock, Send, Activity, Inbox, Target, MessageSquare, Hand
} from 'lucide-react';

/* ─── Types ─── */

interface Task {
  id: string;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_at: string;
  claimed_by?: string;
  requires_plan_approval?: boolean;
  plan?: { plan: string; steps: string[]; submitted_at: string };
  plan_approved?: boolean;
  completion_summary?: string;
}

interface Merge {
  id: string;
  source: string;
  summary: string;
  status: string;
  requested_by?: string;
  created_at: string;
  security_status?: string;
  votes?: Array<{ agent_id: string; vote: string; feedback?: string }>;
}

interface Message {
  id: string;
  from: string;
  to: string;
  content: string;
  type?: string;
  created_at: string;
  read: boolean;
}

interface WSEvent {
  id?: string;
  type: string;
  text?: string;
  created_at?: string;
  [key: string]: unknown;
}

type FeedItem =
  | { kind: 'event'; data: { id: string; text: string; created_at: string } }
  | { kind: 'message'; data: Message };

/* ─── Helpers ─── */

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];

function parsePlanFromContent(content: string): { type: string; task_id?: string; title?: string; steps?: Array<{ description: string; estimate?: string }> | string[] } | null {
  try {
    const jsonMatch = content.match(/```json\n?([\s\S]*?)\n?```/) ||
      content.match(/(\{[\s\S]*"type"\s*:\s*"plan"[\s\S]*\})/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[1]);
      if (parsed.type === 'plan') return parsed;
    }
    const direct = JSON.parse(content);
    if (direct.type === 'plan') return direct;
  } catch {}
  return null;
}

/* ─── Component ─── */

export default function CommandPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const agentInfo = typeof window !== 'undefined' ? getAgentInfo(workspaceId) : null;
  const myId = agentInfo?.id as string | undefined;

  const [pendingMerges, setPendingMerges] = useState<Merge[]>([]);
  const [unclaimedTasks, setUnclaimedTasks] = useState<Task[]>([]);
  const [allTasks, setAllTasks] = useState<Task[]>([]);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [chatInput, setChatInput] = useState('');
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [votingId, setVotingId] = useState<string | null>(null);
  const [voteFeedback, setVoteFeedback] = useState('');
  const [requestChangesId, setRequestChangesId] = useState<string | null>(null);
  const [changesFeedback, setChangesFeedback] = useState('');

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const loadData = useCallback(async () => {
    try {
      const [mergesRes, tasksRes, eventsRes, msgsRes] = await Promise.allSettled([
        listMerges(workspaceId),
        listTasks(workspaceId),
        listEvents(workspaceId, 50),
        getMessages(workspaceId),
      ]);

      if (mergesRes.status === 'fulfilled') {
        const list: Merge[] = Array.isArray(mergesRes.value) ? mergesRes.value : mergesRes.value?.merges || [];
        setPendingMerges(list.filter(m => m.status === 'pending'));
      }

      if (tasksRes.status === 'fulfilled') {
        const list: Task[] = Array.isArray(tasksRes.value) ? tasksRes.value : tasksRes.value?.tasks || [];
        setAllTasks(list);
        setUnclaimedTasks(list.filter(t => t.status === 'unclaimed'));
      }

      // Build activity feed
      const events: FeedItem[] = [];
      if (eventsRes.status === 'fulfilled') {
        const evtList = Array.isArray(eventsRes.value) ? eventsRes.value : eventsRes.value?.events || [];
        evtList.forEach((e: WSEvent) => {
          events.push({
            kind: 'event',
            data: {
              id: e.id || `evt-${Math.random()}`,
              text: e.text || e.type || 'Event',
              created_at: e.created_at || new Date().toISOString(),
            },
          });
        });
      }
      if (msgsRes.status === 'fulfilled') {
        const msgList: Message[] = Array.isArray(msgsRes.value) ? msgsRes.value : msgsRes.value?.messages || [];
        msgList.forEach(m => {
          events.push({ kind: 'message', data: m });
        });
      }
      events.sort((a, b) => new Date(a.data.created_at).getTime() - new Date(b.data.created_at).getTime());
      setFeedItems(events);
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    loadData();
    const unsub = wsClient.subscribe((event) => {
      if ([
        'task_created', 'task_updated', 'task_claimed',
        'message_sent', 'merge_requested', 'merge_voted',
        'agent_joined', 'agent_left',
      ].includes(event.type)) {
        loadData();
      }
    });
    return () => { unsub(); };
  }, [workspaceId, loadData]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [feedItems]);

  /* ─── Actions ─── */

  async function handleVote(mergeId: string, status: 'approved' | 'rejected') {
    const feedback = (requestChangesId === mergeId ? changesFeedback : voteFeedback).trim() || undefined;
    await voteMerge(workspaceId, mergeId, { status, feedback });
    setVotingId(null);
    setVoteFeedback('');
    setRequestChangesId(null);
    setChangesFeedback('');
    await loadData();
  }

  async function handleClaimTask(taskId: string) {
    try {
      await claimTask(workspaceId, taskId);
    } catch {
      // Fallback to status update if claim endpoint doesn't exist
      await updateTask(workspaceId, taskId, { status: 'claimed' });
    }
    await loadData();
  }

  async function handleSendChat() {
    const text = chatInput.trim();
    if (!text || sending) return;
    setSending(true);
    setChatInput('');
    try {
      await sendMessage(workspaceId, { to: '*', content: text });
      await loadData();
    } finally {
      setSending(false);
      textareaRef.current?.focus();
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendChat();
    }
  }

  /* ─── Derived data ─── */

  const actionItems = [
    ...pendingMerges.map(m => ({ type: 'merge' as const, data: m, priority: 'high', at: m.created_at })),
    ...unclaimedTasks.map(t => ({ type: 'task' as const, data: t, priority: t.priority, at: t.created_at })),
  ].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  const tasksByStatus: Record<string, Task[]> = {};
  allTasks.forEach(t => {
    if (!tasksByStatus[t.status]) tasksByStatus[t.status] = [];
    tasksByStatus[t.status].push(t);
  });

  const kanbanColumns = ['unclaimed', 'in_progress', 'claimed', 'done'];
  const totalTasks = allTasks.length;
  const inProgress = (tasksByStatus['in_progress'] || []).length + (tasksByStatus['claimed'] || []).length;
  const done = (tasksByStatus['done'] || []).length;

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="card p-5 animate-pulse h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl space-y-8">
      {/* ── Zone A: Action Queue ── */}
      <section>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <AlertCircle className="w-3.5 h-3.5" />
          Action Queue
        </h2>

        {actionItems.length === 0 ? (
          <div className="card p-8 text-center">
            <Inbox className="w-10 h-10 text-green-400/30 mx-auto mb-2" />
            <p className="text-green-400/80 text-sm font-medium">Nothing needs your attention</p>
            <p className="text-white/25 text-xs mt-1">All merges reviewed, all tasks claimed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {actionItems.map((item) => {
              if (item.type === 'merge') {
                const merge = item.data as Merge;
                return (
                  <div key={`merge-${merge.id}`} className="card p-4">
                    <div className="flex items-start gap-3">
                      <GitMerge className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1 flex-wrap">
                          <code className="text-violet-400 font-mono text-sm bg-violet-500/10 px-2 py-0.5 rounded">
                            {merge.source}
                          </code>
                          <span className="badge text-yellow-400 bg-yellow-400/10 border-yellow-400/20">
                            pending merge
                          </span>
                          {merge.security_status && (
                            <span className={`badge text-xs ${
                              merge.security_status === 'pass'
                                ? 'text-green-400 bg-green-400/10 border-green-400/20'
                                : 'text-red-400 bg-red-400/10 border-red-400/20'
                            }`}>
                              {merge.security_status}
                            </span>
                          )}
                        </div>
                        <p className="text-white/60 text-sm">{merge.summary}</p>
                        {merge.requested_by && (
                          <p className="text-white/25 text-xs mt-1">by {merge.requested_by}</p>
                        )}

                        {/* Inline vote */}
                        {votingId === merge.id ? (
                          <div className="mt-3 space-y-2">
                            <textarea
                              value={voteFeedback}
                              onChange={(e) => setVoteFeedback(e.target.value)}
                              placeholder="Feedback (optional)"
                              className="input-base text-sm resize-none"
                              rows={2}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={() => handleVote(merge.id, 'approved')}
                                className="btn-success flex items-center gap-1.5 text-xs"
                              >
                                <CheckCircle className="w-3.5 h-3.5" />
                                Approve
                              </button>
                              <button
                                onClick={() => handleVote(merge.id, 'rejected')}
                                className="btn-danger flex items-center gap-1.5 text-xs"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Reject
                              </button>
                              <button
                                onClick={() => { setVotingId(null); setVoteFeedback(''); }}
                                className="btn-ghost text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : requestChangesId === merge.id ? (
                          <div className="mt-3 space-y-2 border-t border-white/[0.06] pt-3">
                            <div className="flex items-center gap-1.5 text-xs text-yellow-400/80">
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span className="font-medium">Request Changes</span>
                            </div>
                            <textarea
                              value={changesFeedback}
                              onChange={(e) => setChangesFeedback(e.target.value)}
                              placeholder="Describe the changes needed..."
                              className="input-base text-sm resize-none"
                              rows={3}
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                onClick={async () => {
                                  await handleVote(merge.id, 'rejected');
                                  setRequestChangesId(null);
                                  setChangesFeedback('');
                                }}
                                disabled={!changesFeedback.trim()}
                                className="btn-danger flex items-center gap-1.5 text-xs disabled:opacity-40"
                              >
                                <XCircle className="w-3.5 h-3.5" />
                                Submit Changes Request
                              </button>
                              <button
                                onClick={() => { setRequestChangesId(null); setChangesFeedback(''); }}
                                className="btn-ghost text-xs"
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button
                              onClick={() => handleVote(merge.id, 'approved')}
                              className="btn-success flex items-center gap-1.5 text-xs"
                            >
                              <CheckCircle className="w-3.5 h-3.5" />
                              Approve
                            </button>
                            <button
                              onClick={() => handleVote(merge.id, 'rejected')}
                              className="btn-danger flex items-center gap-1.5 text-xs"
                            >
                              <XCircle className="w-3.5 h-3.5" />
                              Reject
                            </button>
                            <button
                              onClick={() => {
                                setRequestChangesId(merge.id);
                                setChangesFeedback('');
                                setVoteFeedback('');
                              }}
                              className="btn-ghost border border-yellow-500/20 text-yellow-400/70 text-xs flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              Request Changes
                            </button>
                            <button
                              onClick={() => setVotingId(merge.id)}
                              className="btn-ghost border border-white/10 text-xs"
                            >
                              Add feedback
                            </button>
                          </div>
                        )}
                      </div>
                      <span className="text-white/25 text-xs flex-shrink-0 flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {formatRelative(merge.created_at)}
                      </span>
                    </div>
                  </div>
                );
              }

              // Task card
              const task = item.data as Task;
              return (
                <div key={`task-${task.id}`} className="card p-4">
                  <div className="flex items-start gap-3">
                    <CheckSquare className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white/80 text-sm font-medium">{task.title}</span>
                        <span className={`badge text-xs ${STATUS_COLORS[task.status] || ''}`}>
                          {task.status}
                        </span>
                        <span className={`text-xs ${
                          task.priority === 'critical' ? 'text-red-400' :
                          task.priority === 'high' ? 'text-yellow-400' :
                          task.priority === 'medium' ? 'text-blue-400' : 'text-gray-400'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.description && (
                        <p className="text-white/40 text-xs">{task.description}</p>
                      )}
                      <button
                        onClick={() => handleClaimTask(task.id)}
                        className="btn-primary text-xs py-1.5 mt-2 flex items-center gap-1.5"
                      >
                        <Hand className="w-3.5 h-3.5" />
                        Claim Task
                      </button>
                    </div>
                    <span className="text-white/25 text-xs flex-shrink-0 flex items-center gap-1">
                      <Clock className="w-3 h-3" />
                      {formatRelative(task.created_at)}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Zone B: Goals & Progress ── */}
      <section>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <CheckSquare className="w-3.5 h-3.5" />
          Goals &amp; Progress
        </h2>

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-white/50 text-xs">Total</span>
            <span className="text-white font-semibold text-sm">{totalTasks}</span>
          </div>
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-yellow-400/50 text-xs">In Progress</span>
            <span className="text-yellow-400 font-semibold text-sm">{inProgress}</span>
          </div>
          <div className="card px-4 py-2 flex items-center gap-2">
            <span className="text-green-400/50 text-xs">Done</span>
            <span className="text-green-400 font-semibold text-sm">{done}</span>
          </div>
        </div>

        {/* Kanban columns */}
        {totalTasks === 0 ? (
          <div className="card p-8 text-center">
            <Target className="w-10 h-10 text-white/10 mx-auto mb-2" />
            <p className="text-white/30 text-sm">No tasks yet</p>
            <p className="text-white/20 text-xs mt-1">Create tasks to track progress</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            {kanbanColumns.map(status => {
              const tasks = tasksByStatus[status] || [];
              const label = status.replace('_', ' ');
              return (
                <div key={status} className="space-y-2">
                  <div className="flex items-center gap-2 mb-1">
                    <span className={`badge text-xs ${STATUS_COLORS[status] || 'text-white/40 bg-white/5 border-white/10'}`}>
                      {label}
                    </span>
                    <span className="text-white/25 text-xs">{tasks.length}</span>
                  </div>
                  {tasks.map(task => (
                    <div key={task.id} className="card p-3">
                      <p className="text-white/80 text-xs font-medium mb-1 truncate">{task.title}</p>
                      <div className="flex items-center gap-2">
                        {task.claimed_by && (
                          <span className="text-white/30 text-xs truncate">→ {task.claimed_by}</span>
                        )}
                        <span className={`text-xs ml-auto ${
                          task.priority === 'critical' ? 'text-red-400' :
                          task.priority === 'high' ? 'text-yellow-400' :
                          task.priority === 'medium' ? 'text-blue-400' : 'text-gray-400'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                    </div>
                  ))}
                  {tasks.length === 0 && (
                    <div className="card p-3 text-center text-white/20 text-xs">—</div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Zone C: Activity Stream ── */}
      <section>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Activity className="w-3.5 h-3.5" />
          Activity Stream
        </h2>

        <div className="card overflow-hidden">
          {/* Feed */}
          <div className="max-h-96 overflow-y-auto p-4 space-y-3">
            {feedItems.length === 0 ? (
              <div className="text-center py-8">
                <Activity className="w-10 h-10 text-white/10 mx-auto mb-2" />
                <p className="text-white/30 text-sm">No activity yet</p>
                <p className="text-white/20 text-xs mt-1">Events and messages will appear here</p>
              </div>
            ) : (
              feedItems.map((item, i) => {
                if (item.kind === 'event') {
                  return (
                    <div key={item.data.id || i} className="flex items-center gap-3 py-0.5">
                      <div className="flex-1 h-px bg-white/[0.04]" />
                      <span className="text-white/30 text-xs px-2">{item.data.text}</span>
                      <div className="flex-1 h-px bg-white/[0.04]" />
                    </div>
                  );
                }

                const msg = item.data;
                const isMe = !!myId && msg.from === myId;
                const plan = parsePlanFromContent(msg.content);

                return (
                  <div key={msg.id || i} className={`flex gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                    <div className={`w-6 h-6 rounded-full flex-shrink-0 flex items-center justify-center text-xs font-bold ${
                      isMe ? 'bg-violet-600/40 text-violet-300' : 'bg-white/10 text-white/60'
                    }`}>
                      {(msg.from || '?')[0].toUpperCase()}
                    </div>
                    <div className={`max-w-[75%] min-w-0 ${isMe ? 'items-end' : 'items-start'} flex flex-col gap-0.5`}>
                      <div className={`flex items-center gap-2 ${isMe ? 'flex-row-reverse' : ''}`}>
                        <span className="text-white/40 text-xs">{isMe ? 'You' : msg.from}</span>
                        <span className="text-white/20 text-xs">{formatRelative(msg.created_at)}</span>
                      </div>
                      {!plan && (
                        <div className={`px-3 py-1.5 rounded-2xl text-sm leading-relaxed ${
                          isMe
                            ? 'bg-violet-600/25 border border-violet-500/20 text-violet-100 rounded-tr-sm'
                            : 'bg-white/[0.06] border border-white/[0.08] text-white/80 rounded-tl-sm'
                        }`}>
                          {msg.content}
                        </div>
                      )}
                      {plan && (
                        <div className="rounded-xl border border-violet-500/20 bg-violet-500/5 p-3 text-sm">
                          <span className="text-violet-300 font-medium">📋 {plan.title || 'Plan'}</span>
                          {plan.steps && (
                            <div className="mt-1.5 space-y-0.5">
                              {plan.steps.map((step, si) => {
                                const desc = typeof step === 'string' ? step : step.description;
                                return (
                                  <div key={si} className="text-white/60 text-xs flex gap-1.5">
                                    <span className="text-white/25 font-mono">{si + 1}.</span>
                                    {desc}
                                  </div>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
            <div ref={bottomRef} />
          </div>

          {/* Chat input */}
          <div className="px-4 py-3 border-t border-white/[0.08] bg-black/20">
            <div className="flex items-end gap-2">
              <textarea
                ref={textareaRef}
                value={chatInput}
                onChange={(e) => {
                  setChatInput(e.target.value);
                  e.target.style.height = 'auto';
                  e.target.style.height = Math.min(e.target.scrollHeight, 100) + 'px';
                }}
                onKeyDown={handleKeyDown}
                placeholder="Broadcast to team... (Enter to send)"
                className="input-base flex-1 resize-none min-h-[36px] max-h-[100px] py-2 leading-relaxed text-sm"
                rows={1}
                disabled={sending}
              />
              <button
                onClick={handleSendChat}
                disabled={sending || !chatInput.trim()}
                className="btn-primary flex-shrink-0 h-9 w-9 flex items-center justify-center p-0"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
