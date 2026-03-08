'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  getWorkspace, listTasks, getMessages, listAgents, listMerges
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative, STATUS_COLORS } from '@/lib/utils';
import {
  CheckSquare, MessageSquare, Users, GitMerge, Activity, Clock, TrendingUp
} from 'lucide-react';

interface Task { id: string; title: string; status: string; priority: string; created_at: string; }
interface Message { id: string; from: string; content: string; created_at: string; read: boolean; }
interface Agent { id: string; display_name: string; role: string; last_heartbeat?: string; }
interface Merge { id: string; source: string; summary: string; status: string; created_at: string; }

export default function WorkspaceOverview() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<{ name: string; description?: string } | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [messages, setMessages] = useState<Message[]>([]);
  const [agents, setAgents] = useState<Agent[]>([]);
  const [merges, setMerges] = useState<Merge[]>([]);
  const [loading, setLoading] = useState(true);

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
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white">{workspace?.name || 'Workspace'}</h1>
        {workspace?.description && (
          <p className="text-white/40 text-sm mt-1">{workspace.description}</p>
        )}
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
