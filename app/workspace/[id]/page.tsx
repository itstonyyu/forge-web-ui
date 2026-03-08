'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getWorkspace, listTasks, getMessages, listAgents, listMerges, createInvite
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative, STATUS_COLORS } from '@/lib/utils';
import {
  CheckSquare, MessageSquare, Users, GitMerge, Activity, Clock, TrendingUp,
  Link2, Copy, Check, X, Share2
} from 'lucide-react';

interface Task { id: string; title: string; status: string; priority: string; created_at: string; }
interface Message { id: string; from: string; content: string; created_at: string; read: boolean; }
interface Agent { id: string; display_name: string; role: string; last_heartbeat?: string; }
interface Merge { id: string; source: string; summary: string; status: string; created_at: string; }

const INVITE_BASE = 'https://forge-web-ui.vercel.app/invite';

function InviteModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [role, setRole] = useState('builder');
  const [maxUses, setMaxUses] = useState<number | undefined>(undefined);
  const [expiresHours, setExpiresHours] = useState<number | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setError(null);
    try {
      const data: { role?: string; max_uses?: number; expires_hours?: number } = { role };
      if (maxUses !== undefined) data.max_uses = maxUses;
      if (expiresHours !== undefined) data.expires_hours = expiresHours;
      const result = await createInvite(workspaceId, data);
      const token = result.token;
      setLink(`${INVITE_BASE}/${token}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to create invite');
    } finally {
      setLoading(false);
    }
  }

  async function handleCopy() {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-md mx-4 bg-[#0d0d14] border border-white/[0.12]">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-2">
            <Link2 className="w-4 h-4 text-violet-400" />
            <h2 className="text-white font-semibold">Invite to Workspace</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>

        {!link ? (
          <div className="space-y-4">
            {/* Role */}
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="input-base"
              >
                <option value="lead">Lead</option>
                <option value="builder">Builder</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>

            {/* Max Uses */}
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Max Uses</label>
              <select
                value={maxUses === undefined ? '' : String(maxUses)}
                onChange={(e) => setMaxUses(e.target.value === '' ? undefined : Number(e.target.value))}
                className="input-base"
              >
                <option value="">Unlimited</option>
                <option value="1">1 use</option>
                <option value="5">5 uses</option>
                <option value="10">10 uses</option>
              </select>
            </div>

            {/* Expiry */}
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Expires</label>
              <select
                value={expiresHours === undefined ? '' : String(expiresHours)}
                onChange={(e) => setExpiresHours(e.target.value === '' ? undefined : Number(e.target.value))}
                className="input-base"
              >
                <option value="">Never</option>
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
              </select>
            </div>

            {error && <p className="text-red-400 text-sm">{error}</p>}

            <button
              onClick={handleGenerate}
              disabled={loading}
              className="btn-primary w-full"
            >
              {loading ? 'Generating...' : 'Generate Invite Link'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-white/50 text-sm">Share this link to invite someone to the workspace:</p>
            <div className="flex items-center gap-2">
              <input
                readOnly
                value={link}
                className="input-base flex-1 text-xs font-mono"
              />
              <button
                onClick={handleCopy}
                className="btn-ghost border border-white/10 flex-shrink-0 flex items-center gap-1.5"
              >
                {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
            <div className="flex gap-2">
              <a
                href={`https://t.me/share/url?url=${encodeURIComponent(link)}&text=${encodeURIComponent('Join my Forge workspace!')}`}
                target="_blank"
                rel="noopener noreferrer"
                className="btn-ghost border border-white/10 flex items-center gap-1.5 text-sm"
              >
                <Share2 className="w-3.5 h-3.5" />
                Share
              </a>
              <button
                onClick={() => { setLink(null); setRole('builder'); setMaxUses(undefined); setExpiresHours(undefined); }}
                className="btn-ghost text-sm"
              >
                New Link
              </button>
              <button onClick={onClose} className="btn-ghost text-sm ml-auto">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkspaceOverview() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<{ name: string; description?: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [merges, setMerges] = useState<Merge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);

  async function loadAll() {
    try {
      const [ws, t, m, a, mr] = await Promise.allSettled([
        getWorkspace(workspaceId),
        listTasks(workspaceId),
        getMessages(workspaceId),
        listAgents(workspaceId),
        listMerges(workspaceId),
      ]);
      if (ws.status === 'fulfilled') setWorkspace(ws.value?.workspace || ws.value);
      if (t.status === 'fulfilled') setTasks(Array.isArray(t.value) ? t.value : t.value?.tasks || []);
      if (m.status === 'fulfilled') setMessages(Array.isArray(m.value) ? m.value : m.value?.messages || []);
      if (a.status === 'fulfilled') setAgents(Array.isArray(a.value) ? a.value : a.value?.agents || []);
      if (mr.status === 'fulfilled') setMerges(Array.isArray(mr.value) ? mr.value : mr.value?.merges || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    const unsub = wsClient.subscribe((event) => {
      if (['task_created', 'task_updated', 'task_claimed', 'message_sent', 'merge_requested', 'merge_voted', 'agent_joined', 'agent_left'].includes(event.type)) {
        loadAll();
      }
    });
    return () => { unsub(); };
  }, [workspaceId]);

  const base = `/workspace/${workspaceId}`;
  const unreadCount = messages.filter((m) => !m.read).length;
  const tasksByStatus = tasks.reduce((acc: Record<string, number>, t) => {
    acc[t.status] = (acc[t.status] || 0) + 1;
    return acc;
  }, {});
  const recentActivity = [
    ...tasks.slice(0, 3).map((t) => ({ type: 'task', item: t, at: t.created_at })),
    ...messages.slice(0, 3).map((m) => ({ type: 'message', item: m, at: m.created_at })),
    ...merges.slice(0, 2).map((mr) => ({ type: 'merge', item: mr, at: mr.created_at })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()).slice(0, 10);

  if (loading) {
    return (
      <div className="p-6 space-y-4">
        {[...Array(4)].map((_, i) => (
          <div key={i} className="card p-5 animate-pulse h-24" />
        ))}
      </div>
    );
  }

  return (
    <div className="p-6 max-w-4xl">
      {showInvite && (
        <InviteModal workspaceId={workspaceId} onClose={() => setShowInvite(false)} />
      )}

      {/* Header */}
      <div className="mb-8 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{workspace?.name || 'Workspace'}</h1>
          {workspace?.description && (
            <p className="text-white/40 text-sm mt-1">{workspace.description}</p>
          )}
        </div>
        <button
          onClick={() => setShowInvite(true)}
          className="btn-ghost border border-white/10 flex items-center gap-2 text-sm"
        >
          <Link2 className="w-4 h-4 text-violet-400" />
          Invite
        </button>
      </div>

      {/* Stats cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <Link href={`${base}/tasks`} className="card p-4 hover:border-violet-500/20 transition-all group">
          <div className="flex items-center gap-2 mb-2">
            <CheckSquare className="w-4 h-4 text-violet-400" />
            <span className="text-white/50 text-xs uppercase tracking-wide">Tasks</span>
          </div>
          <div className="text-2xl font-bold text-white">{tasks.length}</div>
          <div className="text-xs text-white/30 mt-1">
            {tasksByStatus.in_progress || 0} in progress
          </div>
        </Link>
        <Link href={`${base}/messages`} className="card p-4 hover:border-violet-500/20 transition-all group">
          <div className="flex items-center gap-2 mb-2">
            <MessageSquare className="w-4 h-4 text-blue-400" />
            <span className="text-white/50 text-xs uppercase tracking-wide">Messages</span>
          </div>
          <div className="text-2xl font-bold text-white">{messages.length}</div>
          {unreadCount > 0 && (
            <div className="text-xs text-blue-400 mt-1">{unreadCount} unread</div>
          )}
        </Link>
        <Link href={`${base}/agents`} className="card p-4 hover:border-violet-500/20 transition-all group">
          <div className="flex items-center gap-2 mb-2">
            <Users className="w-4 h-4 text-green-400" />
            <span className="text-white/50 text-xs uppercase tracking-wide">Agents</span>
          </div>
          <div className="text-2xl font-bold text-white">{agents.length}</div>
          <div className="text-xs text-white/30 mt-1">online</div>
        </Link>
        <Link href={`${base}/merges`} className="card p-4 hover:border-violet-500/20 transition-all group">
          <div className="flex items-center gap-2 mb-2">
            <GitMerge className="w-4 h-4 text-yellow-400" />
            <span className="text-white/50 text-xs uppercase tracking-wide">Merges</span>
          </div>
          <div className="text-2xl font-bold text-white">{merges.length}</div>
          <div className="text-xs text-white/30 mt-1">
            {merges.filter((m) => m.status === 'pending').length} pending
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Activity Feed */}
        <div className="md:col-span-2">
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
            <Activity className="w-3.5 h-3.5" />
            Recent Activity
          </h2>
          <div className="space-y-2">
            {recentActivity.length === 0 ? (
              <div className="card p-8 text-center text-white/30 text-sm">No activity yet</div>
            ) : (
              recentActivity.map((item, i) => (
                <div key={i} className="card p-3 flex items-start gap-3">
                  {item.type === 'task' && <CheckSquare className="w-4 h-4 text-violet-400 flex-shrink-0 mt-0.5" />}
                  {item.type === 'message' && <MessageSquare className="w-4 h-4 text-blue-400 flex-shrink-0 mt-0.5" />}
                  {item.type === 'merge' && <GitMerge className="w-4 h-4 text-yellow-400 flex-shrink-0 mt-0.5" />}
                  <div className="flex-1 min-w-0">
                    {item.type === 'task' && (
                      <>
                        <span className="text-white/80 text-sm truncate block">{(item.item as Task).title}</span>
                        <span className={`badge text-xs mt-1 ${STATUS_COLORS[(item.item as Task).status] || ''}`}>
                          {(item.item as Task).status}
                        </span>
                      </>
                    )}
                    {item.type === 'message' && (
                      <>
                        <span className="text-white/50 text-xs">from {(item.item as Message).from}</span>
                        <p className="text-white/80 text-sm truncate">{(item.item as Message).content}</p>
                      </>
                    )}
                    {item.type === 'merge' && (
                      <>
                        <span className="text-white/80 text-sm truncate block">{(item.item as Merge).source}</span>
                        <span className="text-white/40 text-xs truncate block">{(item.item as Merge).summary}</span>
                      </>
                    )}
                  </div>
                  <span className="text-white/25 text-xs flex-shrink-0 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelative(item.at)}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Task breakdown */}
        <div>
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
            <TrendingUp className="w-3.5 h-3.5" />
            Task Status
          </h2>
          <div className="card p-4 space-y-3">
            {Object.entries(tasksByStatus).map(([status, count]) => (
              <div key={status} className="flex items-center justify-between">
                <span className={`badge ${STATUS_COLORS[status] || 'text-white/40 bg-white/5 border-white/10'}`}>
                  {status}
                </span>
                <span className="text-white/60 text-sm font-medium">{count}</span>
              </div>
            ))}
            {Object.keys(tasksByStatus).length === 0 && (
              <p className="text-white/30 text-sm text-center py-4">No tasks yet</p>
            )}
          </div>

          {/* Quick agents */}
          <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 mt-6 flex items-center gap-2">
            <Users className="w-3.5 h-3.5" />
            Agents
          </h2>
          <div className="card divide-y divide-white/5">
            {agents.slice(0, 5).map((a) => (
              <div key={a.id} className="flex items-center gap-2 px-4 py-2.5">
                <div className="w-1.5 h-1.5 bg-green-400 rounded-full flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="text-white/80 text-sm truncate">{a.display_name}</div>
                  <div className="text-white/30 text-xs">{a.role}</div>
                </div>
              </div>
            ))}
            {agents.length === 0 && (
              <p className="text-white/30 text-sm text-center py-4 px-4">No agents yet</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
