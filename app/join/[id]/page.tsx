'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { joinWorkspace, getWorkspace, saveApiKey, saveAgentInfo } from '@/lib/api';
import { ROLES, CAPABILITIES } from '@/lib/utils';
import { Zap, ArrowLeft } from 'lucide-react';

export default function JoinPage() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  const [workspace, setWorkspace] = useState<{ name: string; description?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [displayName, setDisplayName] = useState('');
  const [role, setRole] = useState('worker');
  const [owner, setOwner] = useState('');
  const [model, setModel] = useState('');
  const [caps, setCaps] = useState<string[]>([]);
  const [agentId, setAgentId] = useState('');

  useEffect(() => {
    // Check if already joined
    const key = localStorage.getItem(`forge_key_${workspaceId}`);
    if (key) {
      router.replace(`/workspace/${workspaceId}`);
      return;
    }
    // Generate a random agent ID
    setAgentId(`human-${Math.random().toString(36).slice(2, 8)}`);
    loadWorkspace();
  }, [workspaceId]);

  async function loadWorkspace() {
    try {
      const data = await getWorkspace(workspaceId);
      setWorkspace(data?.workspace || data);
    } catch {
      setError('Workspace not found');
    } finally {
      setLoading(false);
    }
  }

  function toggleCap(cap: string) {
    setCaps((prev) => prev.includes(cap) ? prev.filter((c) => c !== cap) : [...prev, cap]);
  }

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !owner.trim()) return;
    setSubmitting(true);
    setError('');
    try {
      const res = await joinWorkspace(workspaceId, {
        id: agentId,
        display_name: displayName.trim(),
        role,
        owner: owner.trim(),
        model: model.trim() || undefined,
        capabilities: caps.length > 0 ? caps : undefined,
      });
      saveApiKey(workspaceId, res.api_key);
      saveAgentInfo(workspaceId, { ...res.agent, agentId });
      router.push(`/workspace/${workspaceId}`);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Failed to join workspace');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin w-6 h-6 border-2 border-violet-500 border-t-transparent rounded-full" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0f] flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Logo */}
        <div className="text-center mb-8">
          <div className="inline-flex w-12 h-12 bg-violet-600 rounded-xl items-center justify-center mb-3">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-white">Join Workspace</h1>
          {workspace && (
            <p className="text-white/50 text-sm mt-1">
              <span className="text-violet-400">{workspace.name}</span>
              {workspace.description && ` — ${workspace.description}`}
            </p>
          )}
        </div>

        <div className="card p-6">
          {error && (
            <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
              {error}
            </div>
          )}

          <form onSubmit={handleJoin} className="space-y-5">
            {/* Agent ID */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Agent ID</label>
              <input
                className="input-base font-mono"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="your-agent-id"
              />
              <p className="text-white/30 text-xs mt-1">Unique identifier for this session</p>
            </div>

            {/* Display Name */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Display Name *</label>
              <input
                className="input-base"
                placeholder="Your name"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
              />
            </div>

            {/* Owner */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Owner / Team *</label>
              <input
                className="input-base"
                placeholder="Your team or name"
                value={owner}
                onChange={(e) => setOwner(e.target.value)}
                required
              />
            </div>

            {/* Role */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Role</label>
              <div className="grid grid-cols-2 gap-2">
                {ROLES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => setRole(r)}
                    className={`px-3 py-2 rounded-lg text-sm border transition-all ${
                      role === r
                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/5 border-white/10 text-white/50 hover:bg-white/[0.08]'
                    }`}
                  >
                    {r}
                  </button>
                ))}
              </div>
            </div>

            {/* Capabilities */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Capabilities</label>
              <div className="flex flex-wrap gap-2">
                {CAPABILITIES.map((cap) => (
                  <button
                    key={cap}
                    type="button"
                    onClick={() => toggleCap(cap)}
                    className={`px-2.5 py-1 rounded-md text-xs border transition-all ${
                      caps.includes(cap)
                        ? 'bg-violet-600/20 border-violet-500/40 text-violet-300'
                        : 'bg-white/5 border-white/10 text-white/40 hover:bg-white/[0.08]'
                    }`}
                  >
                    {cap}
                  </button>
                ))}
              </div>
            </div>

            {/* Model (optional) */}
            <div>
              <label className="text-white/60 text-sm mb-1.5 block">Model <span className="text-white/30">(optional)</span></label>
              <input
                className="input-base"
                placeholder="e.g. gpt-4, claude-3-opus"
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </div>

            <button
              type="submit"
              disabled={submitting || !displayName.trim() || !owner.trim()}
              className="btn-primary w-full py-2.5 text-base"
            >
              {submitting ? 'Joining...' : 'Join Workspace →'}
            </button>
          </form>
        </div>

        <button
          onClick={() => router.push('/')}
          className="mt-4 flex items-center gap-1.5 text-white/30 hover:text-white/60 text-sm mx-auto transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back to workspaces
        </button>
      </div>
    </div>
  );
}
