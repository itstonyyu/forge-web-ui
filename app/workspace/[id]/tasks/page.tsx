'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  listTasks, createTask, updateTask, submitPlan, approveTask, reviewTask
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { getAgentInfo } from '@/lib/api';
import { formatRelative, STATUS_COLORS, PRIORITIES } from '@/lib/utils';
import {
  Plus, Filter, ChevronDown, ChevronRight, CheckCircle, XCircle, Loader2
} from 'lucide-react';

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
  dependencies?: string[];
}

const STATUS_ORDER = ['unclaimed', 'claimed', 'in_progress', 'done', 'blocked'];
const PRIORITY_COLORS: Record<string, string> = {
  low: 'text-gray-400', medium: 'text-blue-400', high: 'text-yellow-400', critical: 'text-red-400'
};

export default function TasksPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [showPlan, setShowPlan] = useState<string | null>(null);
  const [showFeedback, setShowFeedback] = useState<{ id: string; action: string } | null>(null);
  const agentInfo = typeof window !== 'undefined' ? getAgentInfo(workspaceId) : null;

  // Create form
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newPriority, setNewPriority] = useState('medium');
  const [requiresPlan, setRequiresPlan] = useState(false);
  const [creating, setCreating] = useState(false);

  // Plan form
  const [planText, setPlanText] = useState('');
  const [planSteps, setPlanSteps] = useState('');
  const [submittingPlan, setSubmittingPlan] = useState(false);

  // Feedback form
  const [feedback, setFeedback] = useState('');

  async function load() {
    try {
      const data = await listTasks(workspaceId);
      setTasks(Array.isArray(data) ? data : data?.tasks || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (['task_created', 'task_updated', 'task_claimed'].includes(e.type)) load();
    });
    return () => { unsub(); };
  }, [workspaceId]);

  const filtered = tasks.filter((t) => filter === 'all' || t.status === filter);
  const sorted = [...filtered].sort((a, b) => {
    const pi = PRIORITIES.indexOf(b.priority) - PRIORITIES.indexOf(a.priority);
    if (pi !== 0) return pi;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newTitle.trim()) return;
    setCreating(true);
    try {
      await createTask(workspaceId, {
        title: newTitle.trim(),
        description: newDesc.trim() || undefined,
        priority: newPriority,
        requires_plan_approval: requiresPlan || undefined,
      });
      setNewTitle(''); setNewDesc(''); setNewPriority('medium'); setRequiresPlan(false);
      setShowCreate(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function claim(taskId: string) {
    await updateTask(workspaceId, taskId, { status: 'claimed' });
    await load();
  }

  async function markInProgress(taskId: string) {
    await updateTask(workspaceId, taskId, { status: 'in_progress' });
    await load();
  }

  async function markDone(taskId: string, summary?: string) {
    await updateTask(workspaceId, taskId, { status: 'done', completion_summary: summary });
    await load();
  }

  async function handlePlan(taskId: string) {
    if (!planText.trim()) return;
    setSubmittingPlan(true);
    try {
      await submitPlan(workspaceId, taskId, {
        plan: planText.trim(),
        steps: planSteps.split('\n').map((s) => s.trim()).filter(Boolean),
      });
      setShowPlan(null); setPlanText(''); setPlanSteps('');
      await load();
    } finally {
      setSubmittingPlan(false);
    }
  }

  async function handleApprove(taskId: string, approved: boolean) {
    await approveTask(workspaceId, taskId, { approved, feedback: feedback.trim() || undefined });
    setShowFeedback(null); setFeedback('');
    await load();
  }

  async function handleReview(taskId: string, approved: boolean) {
    await reviewTask(workspaceId, taskId, { approved, feedback: feedback.trim() || undefined });
    setShowFeedback(null); setFeedback('');
    await load();
  }

  return (
    <div className="p-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Tasks</h1>
          <p className="text-white/40 text-sm">{tasks.length} total</p>
        </div>
        <div className="flex items-center gap-2">
          {/* Filter */}
          <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-lg p-1">
            {['all', ...STATUS_ORDER].map((s) => (
              <button
                key={s}
                onClick={() => setFilter(s)}
                className={`px-2.5 py-1 rounded-md text-xs transition-all ${
                  filter === s ? 'bg-violet-600 text-white' : 'text-white/40 hover:text-white'
                }`}
              >
                {s}
              </button>
            ))}
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
      </div>

      {/* Create task modal */}
      {showCreate && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-4">Create Task</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                className="input-base"
                placeholder="Task title *"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                autoFocus
              />
              <textarea
                className="input-base h-20 resize-none"
                placeholder="Description (optional)"
                value={newDesc}
                onChange={(e) => setNewDesc(e.target.value)}
              />
              <div className="flex gap-3 items-center">
                <div className="flex-1">
                  <label className="text-white/50 text-xs mb-1 block">Priority</label>
                  <div className="flex gap-1.5">
                    {PRIORITIES.map((p) => (
                      <button key={p} type="button" onClick={() => setNewPriority(p)}
                        className={`px-2.5 py-1 rounded text-xs border transition-all ${
                          newPriority === p
                            ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                            : 'bg-white/5 border-white/10 text-white/40'
                        }`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
                <label className="flex items-center gap-2 cursor-pointer mt-4">
                  <input
                    type="checkbox"
                    checked={requiresPlan}
                    onChange={(e) => setRequiresPlan(e.target.checked)}
                    className="rounded"
                  />
                  <span className="text-white/50 text-sm">Requires plan</span>
                </label>
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={creating || !newTitle.trim()} className="btn-primary flex-1">
                  {creating ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Submit plan modal */}
      {showPlan && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-4">Submit Plan</h2>
            <div className="space-y-4">
              <textarea
                className="input-base h-24 resize-none"
                placeholder="Plan description..."
                value={planText}
                onChange={(e) => setPlanText(e.target.value)}
                autoFocus
              />
              <textarea
                className="input-base h-24 resize-none font-mono text-xs"
                placeholder="Steps (one per line)&#10;1. Research requirements&#10;2. Implement solution&#10;3. Write tests"
                value={planSteps}
                onChange={(e) => setPlanSteps(e.target.value)}
              />
              <div className="flex gap-2">
                <button onClick={() => setShowPlan(null)} className="btn-ghost flex-1">Cancel</button>
                <button
                  onClick={() => handlePlan(showPlan)}
                  disabled={submittingPlan || !planText.trim()}
                  className="btn-primary flex-1"
                >
                  {submittingPlan ? 'Submitting...' : 'Submit Plan'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Feedback modal */}
      {showFeedback && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-white font-semibold text-lg mb-4">
              {showFeedback.action === 'approve' ? 'Approve Task' : 'Request Review'}
            </h2>
            <textarea
              className="input-base h-20 resize-none mb-4"
              placeholder="Feedback (optional)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowFeedback(null)} className="btn-ghost flex-1">Cancel</button>
              <button
                onClick={() => showFeedback.action === 'approve'
                  ? handleApprove(showFeedback.id, false)
                  : handleReview(showFeedback.id, false)
                }
                className="btn-danger flex-1"
              >
                Reject
              </button>
              <button
                onClick={() => showFeedback.action === 'approve'
                  ? handleApprove(showFeedback.id, true)
                  : handleReview(showFeedback.id, true)
                }
                className="btn-success flex-1"
              >
                Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Task list */}
      {loading ? (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <div key={i} className="card p-4 animate-pulse h-16" />)}
        </div>
      ) : sorted.length === 0 ? (
        <div className="card p-12 text-center">
          <p className="text-white/30">No tasks found</p>
          <button onClick={() => setShowCreate(true)} className="btn-primary mt-4">Create first task</button>
        </div>
      ) : (
        <div className="space-y-2">
          {sorted.map((task) => (
            <div key={task.id} className="card overflow-hidden">
              {/* Task header */}
              <div
                className="p-4 flex items-start gap-3 cursor-pointer hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(expanded === task.id ? null : task.id)}
              >
                <div className="flex-shrink-0 mt-0.5">
                  {expanded === task.id
                    ? <ChevronDown className="w-4 h-4 text-white/30" />
                    : <ChevronRight className="w-4 h-4 text-white/30" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-white/80 text-sm font-medium truncate">{task.title}</span>
                    <span className={`badge flex-shrink-0 ${STATUS_COLORS[task.status] || ''}`}>
                      {task.status}
                    </span>
                    <span className={`text-xs flex-shrink-0 ${PRIORITY_COLORS[task.priority] || 'text-white/30'}`}>
                      {task.priority}
                    </span>
                    {task.requires_plan_approval && (
                      <span className="badge text-orange-400 bg-orange-400/10 border-orange-400/20 flex-shrink-0 text-xs">
                        needs plan
                      </span>
                    )}
                  </div>
                  {task.claimed_by && (
                    <span className="text-white/30 text-xs">→ {task.claimed_by}</span>
                  )}
                </div>
                <span className="text-white/25 text-xs flex-shrink-0">{formatRelative(task.created_at)}</span>
              </div>

              {/* Expanded */}
              {expanded === task.id && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3">
                  {task.description && (
                    <p className="text-white/50 text-sm mb-4">{task.description}</p>
                  )}
                  {task.plan && (
                    <div className="bg-white/5 rounded-lg p-3 mb-4">
                      <p className="text-white/60 text-xs font-medium mb-1 uppercase tracking-wide">Plan</p>
                      <p className="text-white/70 text-sm mb-2">{task.plan.plan}</p>
                      {task.plan.steps.length > 0 && (
                        <ol className="space-y-1">
                          {task.plan.steps.map((s, i) => (
                            <li key={i} className="text-white/50 text-xs flex gap-1.5">
                              <span className="text-violet-400 flex-shrink-0">{i + 1}.</span>
                              {s}
                            </li>
                          ))}
                        </ol>
                      )}
                      {task.plan_approved !== undefined && (
                        <div className={`mt-2 text-xs ${task.plan_approved ? 'text-green-400' : 'text-red-400'}`}>
                          Plan {task.plan_approved ? 'approved' : 'rejected'}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Action buttons */}
                  <div className="flex flex-wrap gap-2">
                    {task.status === 'unclaimed' && (
                      <button onClick={() => claim(task.id)} className="btn-primary text-xs py-1.5">
                        Claim Task
                      </button>
                    )}
                    {task.status === 'claimed' && (
                      <button onClick={() => markInProgress(task.id)} className="btn-primary text-xs py-1.5">
                        Start Working
                      </button>
                    )}
                    {task.status === 'in_progress' && !task.plan && task.requires_plan_approval && (
                      <button
                        onClick={() => { setShowPlan(task.id); setPlanText(''); setPlanSteps(''); }}
                        className="btn-primary text-xs py-1.5"
                      >
                        Submit Plan
                      </button>
                    )}
                    {task.status === 'in_progress' && (
                      <button
                        onClick={() => markDone(task.id)}
                        className="btn-success text-xs"
                      >
                        Mark Done
                      </button>
                    )}
                    {task.plan && task.plan_approved === undefined && (
                      <button
                        onClick={() => setShowFeedback({ id: task.id, action: 'approve' })}
                        className="btn-success text-xs"
                      >
                        Review Plan
                      </button>
                    )}
                    {task.status === 'done' && (
                      <button
                        onClick={() => setShowFeedback({ id: task.id, action: 'review' })}
                        className="btn-success text-xs"
                      >
                        Review Completion
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
