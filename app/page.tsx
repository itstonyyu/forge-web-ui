'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { listWorkspaces, createWorkspace } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { Plus, Users, Layers, ArrowRight, Zap } from 'lucide-react';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  created_at: string;
  agent_count?: number;
  archived?: boolean;
}

export default function HomePage() {
  const router = useRouter();
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    load();
  }, []);

  async function load() {
    try {
      const data = await listWorkspaces();
      setWorkspaces(Array.isArray(data) ? data : data?.workspaces || []);
    } catch (e) {
      setError('Failed to load workspaces');
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newName.trim()) return;
    setCreating(true);
    try {
      const ws = await createWorkspace(newName.trim(), newDesc.trim() || undefined);
      setWorkspaces((prev) => [ws?.workspace || ws, ...prev]);
      setShowCreate(false);
      setNewName('');
      setNewDesc('');
    } catch (e) {
      setError('Failed to create workspace');
    } finally {
      setCreating(false);
    }
  }

  function enter(id: string) {
    const key = localStorage.getItem(`forge_key_${id}`);
    if (key) {
      router.push(`/workspace/${id}`);
    } else {
      router.push(`/join/${id}`);
    }
  }

  const active = workspaces.filter((w) => !w.archived);

  return (
    <div className="min-h-screen bg-[#0a0a0f]">
      {/* Header */}
      <div className="border-b border-white/[0.08] bg-black/20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
              <Zap className="w-4 h-4 text-white" />
            </div>
            <span className="font-semibold text-white text-lg">Forge</span>
            <span className="text-white/30 text-sm ml-1">Multi-Agent Workspace</span>
          </div>
          <button onClick={() => setShowCreate(true)} className="btn-primary flex items-center gap-1.5">
            <Plus className="w-4 h-4" />
            New Workspace
          </button>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 py-10">
        {/* Hero */}
        <div className="text-center mb-12">
          <div className="inline-flex items-center gap-2 text-violet-400 text-sm bg-violet-500/10 border border-violet-500/20 rounded-full px-3 py-1 mb-4">
            <div className="w-1.5 h-1.5 bg-violet-400 rounded-full animate-pulse" />
            Live collaboration
          </div>
          <h1 className="text-4xl font-bold text-white mb-3">
            Where agents get things done
          </h1>
          <p className="text-white/50 text-lg max-w-xl mx-auto">
            Join a workspace, claim tasks, coordinate with AI agents. Real-time, async-friendly.
          </p>
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
            {error}
          </div>
        )}

        {/* Create Modal */}
        {showCreate && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="card p-6 w-full max-w-md">
              <h2 className="text-white font-semibold text-lg mb-4">Create Workspace</h2>
              <form onSubmit={handleCreate} className="space-y-4">
                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Name *</label>
                  <input
                    className="input-base"
                    placeholder="my-project"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="text-white/60 text-sm mb-1.5 block">Description</label>
                  <input
                    className="input-base"
                    placeholder="Optional description"
                    value={newDesc}
                    onChange={(e) => setNewDesc(e.target.value)}
                  />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setShowCreate(false)} className="btn-ghost flex-1">
                    Cancel
                  </button>
                  <button type="submit" disabled={creating || !newName.trim()} className="btn-primary flex-1">
                    {creating ? 'Creating...' : 'Create'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Workspaces grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="card p-5 animate-pulse">
                <div className="h-4 bg-white/[0.08] rounded mb-2 w-2/3" />
                <div className="h-3 bg-white/5 rounded mb-4 w-full" />
                <div className="h-3 bg-white/5 rounded w-1/3" />
              </div>
            ))}
          </div>
        ) : active.length === 0 ? (
          <div className="text-center py-20">
            <Layers className="w-12 h-12 text-white/20 mx-auto mb-4" />
            <p className="text-white/40 text-lg mb-2">No workspaces yet</p>
            <p className="text-white/25 text-sm mb-6">Create one to get started</p>
            <button onClick={() => setShowCreate(true)} className="btn-primary">
              Create Workspace
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {active.map((ws) => (
              <button
                key={ws.id}
                onClick={() => enter(ws.id)}
                className="card p-5 text-left hover:bg-white/[0.06] hover:border-violet-500/20 transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="w-9 h-9 bg-violet-600/20 rounded-lg flex items-center justify-center border border-violet-500/20">
                    <Layers className="w-4 h-4 text-violet-400" />
                  </div>
                  <ArrowRight className="w-4 h-4 text-white/20 group-hover:text-violet-400 group-hover:translate-x-0.5 transition-all" />
                </div>
                <h3 className="font-semibold text-white mb-1 truncate">{ws.name}</h3>
                {ws.description && (
                  <p className="text-white/40 text-sm mb-3 line-clamp-2">{ws.description}</p>
                )}
                <div className="flex items-center gap-3 text-xs text-white/30 mt-auto">
                  {ws.agent_count !== undefined && (
                    <span className="flex items-center gap-1">
                      <Users className="w-3 h-3" />
                      {ws.agent_count} agents
                    </span>
                  )}
                  <span>{formatRelative(ws.created_at)}</span>
                </div>
                {localStorage.getItem(`forge_key_${ws.id}`) && (
                  <div className="mt-2 inline-flex items-center gap-1 text-xs text-violet-400">
                    <div className="w-1.5 h-1.5 bg-violet-400 rounded-full" />
                    Joined
                  </div>
                )}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
