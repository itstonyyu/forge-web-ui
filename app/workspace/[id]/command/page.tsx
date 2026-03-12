'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import {
  listMerges, listTasks, listEvents, getMessages, sendMessage,
  voteMerge, updateTask, claimTask, getAgentInfo, listGoals, recordDecision
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative, STATUS_COLORS } from '@/lib/utils';
import {
  GitMerge, CheckSquare, AlertCircle, CheckCircle, XCircle,
  Clock, Send, Activity, Inbox, Target, MessageSquare, Hand,
  ChevronDown, ChevronRight, Search, Filter, FileText, X, Check
} from 'lucide-react';
import {
  DndContext,
  DragEndEvent,
  DragOverlay,
  DragStartEvent,
  PointerSensor,
  useSensor,
  useSensors,
  closestCorners,
} from '@dnd-kit/core';
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';

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
  goal_id?: string;
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

interface Goal {
  id: string;
  title: string;
  description?: string;
  status?: string;
  tasks?: Task[];
  total_cost_usd?: number;
  total_time_seconds?: number;
}

type FeedItem =
  | { kind: 'event'; data: { id: string; text: string; created_at: string } }
  | { kind: 'message'; data: Message };

/* ─── Helpers ─── */

const PRIORITY_ORDER = ['critical', 'high', 'medium', 'low'];
const INITIAL_FEED_COUNT = 20;

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

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins % 60}m`;
}

/* ─── Toast Component ─── */

function Toast({ show, message, type = 'success' }: { show: boolean; message: string; type?: 'success' | 'error' }) {
  const bgClass = type === 'success' 
    ? 'bg-green-500/20 border-green-500/30 text-green-400'
    : 'bg-red-500/20 border-red-500/30 text-red-400';

  return (
    <div
      className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg
        ${bgClass} border text-sm font-medium backdrop-blur-sm shadow-lg
        ${show ? 'toast-enter' : 'toast-exit pointer-events-none'}`}
      style={{ display: show ? 'flex' : 'none' }}
    >
      {type === 'success' ? <Check className="w-4 h-4" /> : <X className="w-4 h-4" />}
      {message}
    </div>
  );
}

/* ─── Decision Modal ─── */

function DecisionModal({ workspaceId, onClose, onSuccess }: { workspaceId: string; onClose: () => void; onSuccess: () => void }) {
  const [title, setTitle] = useState('');
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit() {
    if (!title.trim() || !decision.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await recordDecision(workspaceId, { title, decision, rationale });
      onSuccess();
      onClose();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to log decision');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-lg mx-4 bg-[#0d0d14] border border-white/[0.12]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-violet-400" />
            <h2 className="text-white font-semibold">Log Decision</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Decision Title</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g., Use PostgreSQL for database"
              className="input-base"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Decision</label>
            <textarea
              value={decision}
              onChange={(e) => setDecision(e.target.value)}
              placeholder="What did you decide?"
              className="input-base resize-none h-24"
            />
          </div>
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Rationale (Optional)</label>
            <textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder="Why did you make this decision?"
              className="input-base resize-none h-20"
            />
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-2">
            <button
              onClick={handleSubmit}
              disabled={loading || !title.trim() || !decision.trim()}
              className="btn-primary flex-1 disabled:opacity-40"
            >
              {loading ? 'Logging...' : 'Log Decision'}
            </button>
            <button onClick={onClose} className="btn-ghost border border-white/10">Cancel</button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Sortable Task Card ─── */

function SortableTaskCard({ task, expanded, onToggle }: { task: Task; expanded: boolean; onToggle: () => void }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className="card p-3 cursor-move hover:bg-white/[0.05] transition-all group relative"
    >
      <div onClick={(e) => { e.stopPropagation(); onToggle(); }} className="cursor-pointer">
        <p className="text-white/80 text-xs font-medium mb-1 pr-6">
          {task.title}
        </p>
        {expanded && task.description && (
          <p className="text-white/50 text-xs mt-2 whitespace-pre-wrap border-t border-white/[0.06] pt-2">
            {task.description}
          </p>
        )}
        <div className="flex items-center gap-2 mt-1.5">
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
      {task.description && !expanded && (
        <div className="absolute top-2 right-2 text-white/20 opacity-0 group-hover:opacity-100 transition-opacity">
          <ChevronDown className="w-3 h-3" />
        </div>
      )}
      {expanded && (
        <div className="absolute top-2 right-2 text-white/20">
          <ChevronRight className="w-3 h-3" />
        </div>
      )}
    </div>
  );
}

/* ─── Goal Card Component ─── */

function GoalCard({ goal, allTasks }: { goal: Goal; allTasks: Task[] }) {
  const [expanded, setExpanded] = useState(false);
  const tasks = goal.tasks || allTasks.filter(t => t.goal_id === goal.id);
  const doneTasks = tasks.filter(t => t.status === 'done').length;
  const totalTasks = tasks.length;
  const pct = totalTasks > 0 ? Math.round((doneTasks / totalTasks) * 100) : 0;

  return (
    <div className="card p-4 fade-in">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full text-left flex items-start gap-3"
      >
        {expanded ? (
          <ChevronDown className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
        ) : (
          <ChevronRight className="w-4 h-4 text-white/30 mt-0.5 flex-shrink-0" />
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-2">
            <span className="text-white/90 text-sm font-medium truncate">{goal.title}</span>
            <span className="text-white/40 text-xs flex-shrink-0">{doneTasks}/{totalTasks}</span>
          </div>
          <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full bg-violet-500 transition-all duration-500"
              style={{ width: `${pct}%` }}
            />
          </div>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-white/30">
            <span>{pct}% complete</span>
            {goal.total_cost_usd != null && <span>${goal.total_cost_usd.toFixed(2)}</span>}
            {goal.total_time_seconds != null && <span>{formatDuration(goal.total_time_seconds)}</span>}
          </div>
        </div>
      </button>

      {expanded && tasks.length > 0 && (
        <div className="mt-3 ml-7 space-y-1.5 border-t border-white/[0.06] pt-3">
          {tasks.map(task => (
            <div key={task.id} className="flex items-center gap-2 py-1">
              <span className={`badge text-xs ${STATUS_COLORS[task.status] || 'text-white/40 bg-white/5 border-white/10'}`}>
                {task.status.replace('_', ' ')}
              </span>
              <span className="text-white/60 text-xs truncate flex-1">{task.title}</span>
              {task.claimed_by && (
                <span className="text-white/25 text-xs">→ {task.claimed_by}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
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
  const [goals, setGoals] = useState<Goal[] | null>(null);
  const [feedLimit, setFeedLimit] = useState(INITIAL_FEED_COUNT);

  // New state for UX improvements
  const [searchQuery, setSearchQuery] = useState('');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterPriority, setFilterPriority] = useState<string>('all');
  const [filterAssignee, setFilterAssignee] = useState<string>('all');
  const [showFilters, setShowFilters] = useState(false);
  const [showDecisionModal, setShowDecisionModal] = useState(false);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<string>>(new Set());
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);

  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const showToast = useCallback((message: string, type: 'success' | 'error' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 3000);
  }, []);

  const loadData = useCallback(async () => {
    try {
      const [mergesRes, tasksRes, eventsRes, msgsRes, goalsRes] = await Promise.allSettled([
        listMerges(workspaceId),
        listTasks(workspaceId),
        listEvents(workspaceId, 50),
        getMessages(workspaceId),
        listGoals(workspaceId),
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

      // Goals
      if (goalsRes.status === 'fulfilled' && goalsRes.value) {
        const goalList: Goal[] = Array.isArray(goalsRes.value) ? goalsRes.value : goalsRes.value?.goals || [];
        if (goalList.length > 0) setGoals(goalList);
        else setGoals(null);
      } else {
        setGoals(null);
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
    showToast(`Merge ${status}`, 'success');
    await loadData();
  }

  async function handleClaimTask(taskId: string) {
    try {
      await claimTask(workspaceId, taskId);
      showToast('Task claimed', 'success');
    } catch {
      await updateTask(workspaceId, taskId, { status: 'claimed' });
      showToast('Task claimed', 'success');
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

  async function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    setActiveTaskId(null);

    if (!over || active.id === over.id) return;

    const taskId = active.id as string;
    const newStatus = over.id as string;

    // Optimistic update
    setAllTasks(prev => prev.map(t => t.id === taskId ? { ...t, status: newStatus } : t));

    try {
      await updateTask(workspaceId, taskId, { status: newStatus });
      showToast(`Task moved to ${newStatus.replace('_', ' ')}`, 'success');
      await loadData();
    } catch (e) {
      showToast('Failed to update task', 'error');
      await loadData();
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveTaskId(event.active.id as string);
  }

  /* ─── Derived data ─── */

  const actionItems = [
    ...pendingMerges.map(m => ({ type: 'merge' as const, data: m, priority: 'high', at: m.created_at })),
    ...unclaimedTasks.map(t => ({ type: 'task' as const, data: t, priority: t.priority, at: t.created_at })),
  ].sort((a, b) => PRIORITY_ORDER.indexOf(a.priority) - PRIORITY_ORDER.indexOf(b.priority));

  // Filter tasks based on search and filters
  const filteredTasks = allTasks.filter(task => {
    if (searchQuery && !task.title.toLowerCase().includes(searchQuery.toLowerCase()) && 
        !task.description?.toLowerCase().includes(searchQuery.toLowerCase())) {
      return false;
    }
    if (filterStatus !== 'all' && task.status !== filterStatus) return false;
    if (filterPriority !== 'all' && task.priority !== filterPriority) return false;
    if (filterAssignee !== 'all') {
      if (filterAssignee === 'unassigned' && task.claimed_by) return false;
      if (filterAssignee !== 'unassigned' && task.claimed_by !== filterAssignee) return false;
    }
    return true;
  });

  const tasksByStatus: Record<string, Task[]> = {};
  filteredTasks.forEach(t => {
    if (!tasksByStatus[t.status]) tasksByStatus[t.status] = [];
    tasksByStatus[t.status].push(t);
  });

  const kanbanColumns = [
    { id: 'unclaimed', label: 'TODO' },
    { id: 'claimed', label: 'Claimed' },
    { id: 'in_progress', label: 'In Progress' },
    { id: 'done', label: 'Done' },
  ];

  const totalTasks = allTasks.length;
  const inProgress = (tasksByStatus['in_progress'] || []).length + (tasksByStatus['claimed'] || []).length;
  const done = (tasksByStatus['done'] || []).length;

  const visibleFeed = feedItems.slice(-feedLimit);
  const hasMoreFeed = feedItems.length > feedLimit;

  const assignees = Array.from(new Set(allTasks.map(t => t.claimed_by).filter(Boolean)));

  const activeTask = activeTaskId ? allTasks.find(t => t.id === activeTaskId) : null;

  /* ─── Render ─── */

  if (loading) {
    return (
      <div className="p-6 space-y-6">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="skeleton h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-7xl space-y-8 page-enter">
      {toast && <Toast show={!!toast} message={toast.message} type={toast.type} />}
      {showDecisionModal && (
        <DecisionModal
          workspaceId={workspaceId}
          onClose={() => setShowDecisionModal(false)}
          onSuccess={() => {
            showToast('Decision logged successfully', 'success');
            loadData();
          }}
        />
      )}

      {/* ── Zone A: Action Queue ── */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide flex items-center gap-2">
            <AlertCircle className="w-3.5 h-3.5" />
            Action Queue
          </h2>
          <button
            onClick={() => setShowDecisionModal(true)}
            className="btn-ghost border border-white/10 text-xs flex items-center gap-1.5"
          >
            <FileText className="w-3.5 h-3.5" />
            Log Decision
          </button>
        </div>

        {actionItems.length === 0 ? (
          <div className="card p-8 text-center fade-in">
            <Inbox className="w-10 h-10 text-green-400/30 mx-auto mb-2" />
            <p className="text-green-400/80 text-sm font-medium">Nothing needs your attention</p>
            <p className="text-white/25 text-xs mt-1">All merges reviewed, all tasks claimed</p>
          </div>
        ) : (
          <div className="space-y-2">
            {actionItems.map((item, idx) => {
              const borderAccent = item.type === 'merge'
                ? 'border-accent-violet'
                : item.priority === 'critical' ? 'border-accent-red' : 'border-accent-yellow';

              if (item.type === 'merge') {
                const merge = item.data as Merge;
                return (
                  <div key={`merge-${merge.id}`} className={`card p-4 ${borderAccent} fade-in-stagger`} style={{ animationDelay: `${idx * 60}ms` }}>
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
                              <button onClick={() => handleVote(merge.id, 'approved')} className="btn-success flex items-center gap-1.5 text-xs">
                                <CheckCircle className="w-3.5 h-3.5" /> Approve
                              </button>
                              <button onClick={() => handleVote(merge.id, 'rejected')} className="btn-danger flex items-center gap-1.5 text-xs">
                                <XCircle className="w-3.5 h-3.5" /> Reject
                              </button>
                              <button onClick={() => { setVotingId(null); setVoteFeedback(''); }} className="btn-ghost text-xs">Cancel</button>
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
                                onClick={async () => { await handleVote(merge.id, 'rejected'); setRequestChangesId(null); setChangesFeedback(''); }}
                                disabled={!changesFeedback.trim()}
                                className="btn-danger flex items-center gap-1.5 text-xs disabled:opacity-40"
                              >
                                <XCircle className="w-3.5 h-3.5" /> Submit Changes Request
                              </button>
                              <button onClick={() => { setRequestChangesId(null); setChangesFeedback(''); }} className="btn-ghost text-xs">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex gap-2 mt-2">
                            <button onClick={() => handleVote(merge.id, 'approved')} className="btn-success flex items-center gap-1.5 text-xs">
                              <CheckCircle className="w-3.5 h-3.5" /> Approve
                            </button>
                            <button onClick={() => handleVote(merge.id, 'rejected')} className="btn-danger flex items-center gap-1.5 text-xs">
                              <XCircle className="w-3.5 h-3.5" /> Reject
                            </button>
                            <button
                              onClick={() => { setRequestChangesId(merge.id); setChangesFeedback(''); setVoteFeedback(''); }}
                              className="btn-ghost border border-yellow-500/20 text-yellow-400/70 text-xs flex items-center gap-1.5"
                            >
                              <MessageSquare className="w-3.5 h-3.5" /> Request Changes
                            </button>
                            <button onClick={() => setVotingId(merge.id)} className="btn-ghost border border-white/10 text-xs">Add feedback</button>
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
                <div key={`task-${task.id}`} className={`card p-4 ${borderAccent} fade-in-stagger`} style={{ animationDelay: `${idx * 60}ms` }}>
                  <div className="flex items-start gap-3">
                    <CheckSquare className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-white/80 text-sm font-medium">{task.title}</span>
                        <span className={`badge text-xs ${STATUS_COLORS[task.status] || ''}`}>{task.status}</span>
                        <span className={`text-xs ${
                          task.priority === 'critical' ? 'text-red-400' :
                          task.priority === 'high' ? 'text-yellow-400' :
                          task.priority === 'medium' ? 'text-blue-400' : 'text-gray-400'
                        }`}>
                          {task.priority}
                        </span>
                      </div>
                      {task.description && <p className="text-white/40 text-xs">{task.description}</p>}
                      <button onClick={() => handleClaimTask(task.id)} className="btn-primary text-xs py-1.5 mt-2 flex items-center gap-1.5">
                        <Hand className="w-3.5 h-3.5" /> Claim Task
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
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide flex items-center gap-2">
            <CheckSquare className="w-3.5 h-3.5" />
            Tasks &amp; Progress
          </h2>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search tasks..."
                className="input-base w-48 pl-8 text-xs"
              />
            </div>
            <button
              onClick={() => setShowFilters(!showFilters)}
              className={`btn-ghost border border-white/10 text-xs flex items-center gap-1.5 ${
                showFilters ? 'bg-white/5' : ''
              }`}
            >
              <Filter className="w-3.5 h-3.5" />
              Filters
            </button>
          </div>
        </div>

        {showFilters && (
          <div className="card p-4 mb-4 fade-in">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Status</label>
                <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="input-base text-xs">
                  <option value="all">All</option>
                  <option value="unclaimed">TODO</option>
                  <option value="claimed">Claimed</option>
                  <option value="in_progress">In Progress</option>
                  <option value="done">Done</option>
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Priority</label>
                <select value={filterPriority} onChange={(e) => setFilterPriority(e.target.value)} className="input-base text-xs">
                  <option value="all">All</option>
                  <option value="critical">Critical</option>
                  <option value="high">High</option>
                  <option value="medium">Medium</option>
                  <option value="low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Assignee</label>
                <select value={filterAssignee} onChange={(e) => setFilterAssignee(e.target.value)} className="input-base text-xs">
                  <option value="all">All</option>
                  <option value="unassigned">Unassigned</option>
                  {assignees.map(a => (
                    <option key={a} value={a}>{a}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        )}

        {/* Summary bar */}
        <div className="flex flex-wrap gap-3 mb-4">
          <div className="card px-4 py-2 flex items-center gap-2 fade-in">
            <span className="text-white/50 text-xs">Total</span>
            <span className="text-white font-semibold text-sm">{totalTasks}</span>
          </div>
          <div className="card px-4 py-2 flex items-center gap-2 fade-in" style={{ animationDelay: '50ms' }}>
            <span className="text-yellow-400/50 text-xs">In Progress</span>
            <span className="text-yellow-400 font-semibold text-sm">{inProgress}</span>
          </div>
          <div className="card px-4 py-2 flex items-center gap-2 fade-in" style={{ animationDelay: '100ms' }}>
            <span className="text-green-400/50 text-xs">Done</span>
            <span className="text-green-400 font-semibold text-sm">{done}</span>
          </div>
        </div>

        {/* Goals view (if goals exist) */}
        {goals && goals.length > 0 ? (
          <div className="space-y-2 mb-6">
            {goals.map(goal => (
              <GoalCard key={goal.id} goal={goal} allTasks={allTasks} />
            ))}
          </div>
        ) : null}

        {/* Drag-and-drop Kanban */}
        {totalTasks === 0 ? (
          <div className="card p-8 text-center fade-in">
            <Target className="w-10 h-10 text-white/10 mx-auto mb-2" />
            <p className="text-white/30 text-sm">No tasks yet</p>
            <p className="text-white/20 text-xs mt-1">Create tasks to track progress</p>
          </div>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCorners}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
              {kanbanColumns.map(column => {
                const tasks = tasksByStatus[column.id] || [];
                return (
                  <div key={column.id} className="space-y-2">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`badge text-xs ${STATUS_COLORS[column.id] || 'text-white/40 bg-white/5 border-white/10'}`}>
                        {column.label}
                      </span>
                      <span className="text-white/25 text-xs">{tasks.length}</span>
                    </div>
                    <SortableContext items={tasks.map(t => t.id)} strategy={verticalListSortingStrategy} id={column.id}>
                      <div className="space-y-1.5 min-h-[100px] p-2 rounded-lg border-2 border-dashed border-white/[0.04]">
                        {tasks.map((task, idx) => (
                          <SortableTaskCard
                            key={task.id}
                            task={task}
                            expanded={expandedTaskIds.has(task.id)}
                            onToggle={() => {
                              setExpandedTaskIds(prev => {
                                const next = new Set(prev);
                                if (next.has(task.id)) next.delete(task.id);
                                else next.add(task.id);
                                return next;
                              });
                            }}
                          />
                        ))}
                        {tasks.length === 0 && (
                          <div className="card p-3 text-center text-white/20 text-xs">Drop here</div>
                        )}
                      </div>
                    </SortableContext>
                  </div>
                );
              })}
            </div>

            <DragOverlay>
              {activeTask ? (
                <div className="card p-3 cursor-move opacity-80 shadow-lg">
                  <p className="text-white/80 text-xs font-medium mb-1">{activeTask.title}</p>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs ${
                      activeTask.priority === 'critical' ? 'text-red-400' :
                      activeTask.priority === 'high' ? 'text-yellow-400' :
                      activeTask.priority === 'medium' ? 'text-blue-400' : 'text-gray-400'
                    }`}>
                      {activeTask.priority}
                    </span>
                  </div>
                </div>
              ) : null}
            </DragOverlay>
          </DndContext>
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
              <>
                {/* Load more button */}
                {hasMoreFeed && (
                  <div className="text-center py-2">
                    <button
                      onClick={() => setFeedLimit(prev => prev + 20)}
                      className="btn-ghost border border-white/10 text-xs text-white/40 hover:text-white/60"
                    >
                      Load older activity ({feedItems.length - feedLimit} more)
                    </button>
                  </div>
                )}
                {visibleFeed.map((item, i) => {
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
                })}
              </>
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
