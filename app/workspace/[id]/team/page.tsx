'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import {
  listAgents, getStatuses, getAgentScorecard,
  createInvite, getCapabilityCard, searchCapabilities,
  getAgentHealth, getContributions
} from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative } from '@/lib/utils';
import CapabilityCard, { CapabilityCardData } from '@/components/CapabilityCard';
import {
  Users, Cpu, Link2, Copy, Check, X, Share2, UserPlus, Plug, Search,
  AlertTriangle, Zap
} from 'lucide-react';

/* ─── Types ─── */

interface Agent {
  id: string;
  display_name: string;
  role: string;
  owner?: string;
  model?: string;
  capabilities?: string[];
  joined_at?: string;
  trust_level?: string;
  zone?: string;
}

interface AgentStatus {
  agent_id: string;
  state: string;
  message?: string;
  updated_at: string;
}

interface HealthEntry {
  agent_id: string;
  last_heartbeat?: string;
  consecutive_failures?: number;
  current_task?: string;
  status?: string;
}

interface ContributionData {
  tasks_completed?: number;
  merges_approved?: number;
  reviews_given?: number;
  total_tokens?: number;
  total_cost_usd?: number;
  total_time_seconds?: number;
  approval_rate?: number;
}

interface Scorecard {
  tasks_completed?: number;
  tasks_failed?: number;
  avg_completion_time?: string;
  total_tokens?: number;
  total_cost_usd?: number;
  recent_tasks?: Array<{ id: string; title: string; status: string; completed_at?: string }>;
}

/* ─── Constants ─── */

const TRUST_COLORS: Record<string, { badge: string; dot: string; label: string }> = {
  unverified: {
    badge: 'text-red-400 bg-red-400/10 border-red-400/20',
    dot: 'bg-red-400',
    label: '🔴 Unverified',
  },
  contributor: {
    badge: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
    dot: 'bg-yellow-400',
    label: '🟡 Contributor',
  },
  trusted: {
    badge: 'text-green-400 bg-green-400/10 border-green-400/20',
    dot: 'bg-green-400',
    label: '🟢 Trusted',
  },
};

const ROLE_COLORS: Record<string, string> = {
  lead: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  reviewer: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  worker: 'text-green-400 bg-green-400/10 border-green-400/20',
  builder: 'text-green-400 bg-green-400/10 border-green-400/20',
  observer: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
};

const INVITE_BASE = 'https://forge-web-ui.vercel.app/invite';

/* ─── Health helpers ─── */

function getHealthStatus(agentId: string, healthMap: Record<string, HealthEntry>, statuses: AgentStatus[]): {
  label: string; dotClass: string; isOnline: boolean;
} {
  const h = healthMap[agentId];
  const s = statuses.find(st => st.agent_id === agentId);

  // Use health data if available
  const lastBeat = h?.last_heartbeat || s?.updated_at;
  if (!lastBeat) return { label: 'offline', dotClass: 'bg-gray-600', isOnline: false };

  const diffMs = Date.now() - new Date(lastBeat).getTime();
  const diffMin = diffMs / 60000;

  if (diffMin < 5) return { label: h?.current_task ? 'working' : 'online', dotClass: 'bg-green-400', isOnline: true };
  if (diffMin < 30) return { label: 'idle', dotClass: 'bg-yellow-400', isOnline: false };
  return { label: 'offline', dotClass: 'bg-gray-600', isOnline: false };
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const hrs = Math.floor(mins / 60);
  if (hrs === 0) return `${mins}m`;
  return `${hrs}h ${mins % 60}m`;
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1000) return `${(n / 1000).toFixed(1)}k`;
  return String(n);
}

/* ─── Invite Modal ─── */

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
      setLink(`${INVITE_BASE}/${result.token}`);
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
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Role</label>
              <select value={role} onChange={(e) => setRole(e.target.value)} className="input-base">
                <option value="lead">Lead</option>
                <option value="builder">Builder</option>
                <option value="reviewer">Reviewer</option>
              </select>
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Max Uses</label>
              <select value={maxUses === undefined ? '' : String(maxUses)} onChange={(e) => setMaxUses(e.target.value === '' ? undefined : Number(e.target.value))} className="input-base">
                <option value="">Unlimited</option>
                <option value="1">1 use</option>
                <option value="5">5 uses</option>
                <option value="10">10 uses</option>
              </select>
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Expires</label>
              <select value={expiresHours === undefined ? '' : String(expiresHours)} onChange={(e) => setExpiresHours(e.target.value === '' ? undefined : Number(e.target.value))} className="input-base">
                <option value="">Never</option>
                <option value="1">1 hour</option>
                <option value="24">24 hours</option>
                <option value="168">7 days</option>
              </select>
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button onClick={handleGenerate} disabled={loading} className="btn-primary w-full">
              {loading ? 'Generating...' : 'Generate Invite Link'}
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-white/50 text-sm">Share this link to invite someone:</p>
            <div className="flex items-center gap-2">
              <input readOnly value={link} className="input-base flex-1 text-xs font-mono" />
              <button onClick={handleCopy} className="btn-ghost border border-white/10 flex-shrink-0 flex items-center gap-1.5">
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
              <button onClick={() => { setLink(null); setRole('builder'); setMaxUses(undefined); setExpiresHours(undefined); }} className="btn-ghost text-sm">
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

/* ─── Contribution Stats Component ─── */

function ContributionStats({ data }: { data: ContributionData | null }) {
  if (!data) return null;

  const approvalRate = data.approval_rate ?? 0;
  const stats = [
    { label: 'Tasks completed', value: data.tasks_completed ?? 0 },
    { label: 'Merges approved', value: data.merges_approved ?? 0 },
    { label: 'Reviews given', value: data.reviews_given ?? 0 },
    { label: 'Total tokens', value: data.total_tokens ? formatTokens(data.total_tokens) : '—' },
    { label: 'Total cost', value: data.total_cost_usd != null ? `$${data.total_cost_usd.toFixed(2)}` : '—' },
    { label: 'Total time', value: data.total_time_seconds ? formatDuration(data.total_time_seconds) : '—' },
  ];

  return (
    <div className="fade-in">
      <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Contributions</h3>
      <div className="card p-4 space-y-3">
        {stats.map(({ label, value }) => (
          <div key={label} className="flex items-center justify-between">
            <span className="text-white/50 text-sm">{label}</span>
            <span className="text-white/90 text-sm font-medium">{value}</span>
          </div>
        ))}
        {/* Approval rate bar */}
        <div className="pt-2 border-t border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="flex-1 h-2 bg-white/5 rounded-full overflow-hidden">
              <div
                className="h-full rounded-full transition-all duration-500"
                style={{
                  width: `${Math.min(approvalRate, 100)}%`,
                  background: approvalRate >= 80 ? '#4ade80' : approvalRate >= 50 ? '#facc15' : '#f87171',
                }}
              />
            </div>
            <span className="text-white/50 text-xs whitespace-nowrap">
              {Math.round(approvalRate)}% approve
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ─── Main Component ─── */

export default function TeamPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [healthMap, setHealthMap] = useState<Record<string, HealthEntry>>({});
  const [loading, setLoading] = useState(true);
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [scorecard, setScorecard] = useState<Scorecard | null>(null);
  const [scorecardLoading, setScorecardLoading] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [showConnect, setShowConnect] = useState(false);
  const [capCard, setCapCard] = useState<CapabilityCardData | null>(null);
  const [capCardLoading, setCapCardLoading] = useState(false);
  const [capSearch, setCapSearch] = useState('');
  const [capSearchResults, setCapSearchResults] = useState<string[] | null>(null);
  const [contributions, setContributions] = useState<ContributionData | null>(null);
  const [contribLoading, setContribLoading] = useState(false);

  async function load() {
    try {
      const [a, s, h] = await Promise.allSettled([
        listAgents(workspaceId),
        getStatuses(workspaceId),
        getAgentHealth(workspaceId),
      ]);
      if (a.status === 'fulfilled') setAgents(Array.isArray(a.value) ? a.value : a.value?.agents || []);
      if (s.status === 'fulfilled') setStatuses(Array.isArray(s.value) ? s.value : s.value?.statuses || []);
      if (h.status === 'fulfilled') {
        const healthList: HealthEntry[] = Array.isArray(h.value) ? h.value : h.value?.agents || [];
        const map: Record<string, HealthEntry> = {};
        healthList.forEach(entry => { map[entry.agent_id] = entry; });
        setHealthMap(map);
      }
    } finally {
      setLoading(false);
    }
  }

  async function loadCapabilityCard(agentId: string) {
    setCapCardLoading(true);
    try {
      const data = await getCapabilityCard(workspaceId, agentId);
      setCapCard(data);
    } catch {
      setCapCard(null);
    } finally {
      setCapCardLoading(false);
    }
  }

  async function loadContributions(agentId: string) {
    setContribLoading(true);
    try {
      const data = await getContributions(workspaceId, { agent_id: agentId });
      setContributions(data);
    } catch {
      setContributions(null);
    } finally {
      setContribLoading(false);
    }
  }

  async function handleCapSearch(query: string) {
    setCapSearch(query);
    if (!query.trim()) {
      setCapSearchResults(null);
      return;
    }
    try {
      const res = await searchCapabilities(workspaceId, query);
      const ids: string[] = Array.isArray(res)
        ? res.map((r: { agent_id?: string; id?: string }) => r.agent_id || r.id || '')
        : res?.agent_ids || [];
      setCapSearchResults(ids);
    } catch {
      setCapSearchResults(null);
    }
  }

  async function loadScorecard(agentId: string) {
    setScorecardLoading(true);
    try {
      const data = await getAgentScorecard(workspaceId, agentId);
      setScorecard(data);
    } catch {
      setScorecard(null);
    } finally {
      setScorecardLoading(false);
    }
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (['agent_joined', 'agent_left', 'heartbeat'].includes(e.type)) load();
    });
    return () => unsub();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspaceId]);

  useEffect(() => {
    if (selectedAgent) {
      loadScorecard(selectedAgent);
      loadCapabilityCard(selectedAgent);
      loadContributions(selectedAgent);
    } else {
      setScorecard(null);
      setCapCard(null);
      setContributions(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedAgent]);

  function getTrust(agent: Agent) {
    const level = agent.trust_level || 'unverified';
    return TRUST_COLORS[level] || TRUST_COLORS.unverified;
  }

  const filteredAgents = capSearchResults
    ? agents.filter(a => capSearchResults.includes(a.id))
    : agents;
  const selected = agents.find(a => a.id === selectedAgent);

  return (
    <div className="flex h-full page-enter">
      {showInvite && <InviteModal workspaceId={workspaceId} onClose={() => setShowInvite(false)} />}

      {/* Connect Agent modal */}
      {showConnect && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setShowConnect(false)} />
          <div className="relative card p-6 w-full max-w-md mx-4 bg-[#0d0d14] border border-white/[0.12]">
            <div className="flex items-center justify-between mb-5">
              <div className="flex items-center gap-2">
                <Plug className="w-4 h-4 text-violet-400" />
                <h2 className="text-white font-semibold">Connect an Agent</h2>
              </div>
              <button onClick={() => setShowConnect(false)} className="text-white/40 hover:text-white/70">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <p className="text-white/60 text-sm">
                To connect an AI agent to this workspace, use the Forge SDK with an API key.
              </p>
              <div className="bg-white/5 border border-white/10 rounded-lg p-4">
                <p className="text-white/50 text-xs uppercase tracking-wide mb-2">Quick Start</p>
                <pre className="text-violet-300 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
{`// Install the SDK
npm install @forge/sdk

// Connect your agent
import { ForgeAgent } from '@forge/sdk';

const agent = new ForgeAgent({
  workspace: '${workspaceId}',
  apiKey: 'YOUR_API_KEY',
});

await agent.join({
  displayName: 'My Agent',
  role: 'builder',
});`}
                </pre>
              </div>
              <p className="text-white/30 text-xs">
                Full documentation coming soon. Use an invite link to generate an API key for now.
              </p>
              <button onClick={() => setShowConnect(false)} className="btn-primary w-full">Got it</button>
            </div>
          </div>
        </div>
      )}

      {/* Left: Agents list */}
      <div className="w-80 flex-shrink-0 border-r border-white/[0.08] flex flex-col bg-black/10 overflow-hidden">
        <div className="p-4 border-b border-white/[0.08]">
          <div className="flex items-center justify-between mb-3">
            <h1 className="text-lg font-bold text-white">Team</h1>
            <span className="text-white/30 text-xs">{agents.length} members</span>
          </div>
          <div className="relative mb-2">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30" />
            <input
              type="text"
              value={capSearch}
              onChange={(e) => handleCapSearch(e.target.value)}
              placeholder="Search by capability..."
              className="input-base w-full pl-8 text-xs"
            />
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowInvite(true)}
              className="btn-ghost border border-white/10 flex items-center gap-1.5 text-xs flex-1"
            >
              <UserPlus className="w-3.5 h-3.5 text-violet-400" />
              Invite
            </button>
            <button
              onClick={() => setShowConnect(true)}
              className="btn-ghost border border-white/10 flex items-center gap-1.5 text-xs flex-1"
            >
              <Plug className="w-3.5 h-3.5 text-violet-400" />
              Connect Agent
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
          {loading ? (
            [...Array(4)].map((_, i) => <div key={i} className="skeleton h-20 mb-1.5" />)
          ) : filteredAgents.length === 0 ? (
            <div className="text-center py-16 fade-in">
              <div className="w-16 h-16 mx-auto mb-4 rounded-2xl bg-violet-500/10 border border-violet-500/20 flex items-center justify-center">
                <Users className="w-8 h-8 text-violet-400/50" />
              </div>
              <p className="text-white/50 text-sm font-medium mb-1">No team members yet</p>
              <p className="text-white/25 text-xs mb-4">Invite your first collaborator</p>
              <button onClick={() => setShowInvite(true)} className="btn-primary text-sm">
                <UserPlus className="w-3.5 h-3.5 inline mr-1.5" />
                Invite someone
              </button>
            </div>
          ) : (
            filteredAgents.map((agent, idx) => {
              const health = getHealthStatus(agent.id, healthMap, statuses);
              const hEntry = healthMap[agent.id];
              const trust = getTrust(agent);
              const isSelected = selectedAgent === agent.id;

              return (
                <button
                  key={agent.id}
                  onClick={() => setSelectedAgent(isSelected ? null : agent.id)}
                  className={`w-full text-left card p-3 transition-all fade-in-stagger ${
                    isSelected
                      ? 'border-violet-500/30 bg-violet-500/5'
                      : 'hover:bg-white/[0.03] hover:border-white/[0.12]'
                  }`}
                  style={{ animationDelay: `${idx * 50}ms` }}
                >
                  <div className="flex items-start gap-3">
                    <div className="relative flex-shrink-0">
                      <div className="w-9 h-9 bg-white/10 rounded-xl flex items-center justify-center text-sm font-medium text-white/60">
                        {(agent.display_name || agent.id)[0].toUpperCase()}
                      </div>
                      <div className={`absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-[#0a0a0f] ${health.dotClass}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <span className="text-white/90 text-sm font-medium truncate">{agent.display_name}</span>
                        {hEntry && (hEntry.consecutive_failures ?? 0) > 0 && (
                          <span className="inline-flex items-center gap-0.5 text-xs text-yellow-400/80 bg-yellow-400/10 px-1.5 py-0.5 rounded-md border border-yellow-400/20">
                            <AlertTriangle className="w-2.5 h-2.5" />
                            {hEntry.consecutive_failures}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`badge text-xs ${ROLE_COLORS[agent.role] || 'text-white/40 bg-white/5 border-white/10'}`}>
                          {agent.role}
                        </span>
                        <span className={`badge text-xs ${trust.badge}`}>
                          {trust.label}
                        </span>
                      </div>
                      <div className="flex items-center gap-1 mt-1">
                        <span className={`text-xs ${
                          health.label === 'online' || health.label === 'working'
                            ? 'text-green-400'
                            : health.label === 'idle' ? 'text-yellow-400' : 'text-white/25'
                        }`}>
                          {health.label}
                        </span>
                        {hEntry?.current_task && (
                          <span className="text-white/30 text-xs truncate ml-1">
                            · {hEntry.current_task}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>

      {/* Right: Agent detail */}
      <div className="flex-1 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full">
            <div className="text-center">
              <Users className="w-12 h-12 text-white/10 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Select a team member to view details</p>
            </div>
          </div>
        ) : (
          <div className="p-6 max-w-2xl page-enter">
            {/* Agent header */}
            <div className="flex items-start gap-4 mb-6">
              <div className="relative">
                <div className="w-14 h-14 bg-white/10 rounded-2xl flex items-center justify-center text-xl font-bold text-white/60">
                  {(selected.display_name || selected.id)[0].toUpperCase()}
                </div>
                {(() => {
                  const health = getHealthStatus(selected.id, healthMap, statuses);
                  return <div className={`absolute -bottom-1 -right-1 w-4 h-4 rounded-full border-2 border-[#0a0a0f] ${health.dotClass}`} />;
                })()}
              </div>
              <div>
                <h2 className="text-xl font-bold text-white">{selected.display_name}</h2>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`badge ${ROLE_COLORS[selected.role] || 'text-white/40 bg-white/5 border-white/10'}`}>
                    {selected.role}
                  </span>
                  <span className={`badge ${getTrust(selected).badge}`}>
                    {getTrust(selected).label}
                  </span>
                  {(() => {
                    const health = getHealthStatus(selected.id, healthMap, statuses);
                    return (
                      <span className={`badge text-xs ${
                        health.isOnline
                          ? 'text-green-400 bg-green-400/10 border-green-400/20'
                          : health.label === 'idle'
                          ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20'
                          : 'text-gray-400 bg-gray-400/10 border-gray-400/20'
                      }`}>
                        {health.label}
                      </span>
                    );
                  })()}
                </div>
                {healthMap[selected.id]?.current_task && (
                  <div className="flex items-center gap-1.5 mt-2 text-xs text-violet-300/80">
                    <Zap className="w-3 h-3" />
                    Working on: {healthMap[selected.id].current_task}
                  </div>
                )}
                {(healthMap[selected.id]?.consecutive_failures ?? 0) > 0 && (
                  <div className="flex items-center gap-1.5 mt-1.5 text-xs text-yellow-400/80">
                    <AlertTriangle className="w-3 h-3" />
                    ⚠️ {healthMap[selected.id].consecutive_failures} consecutive failures
                  </div>
                )}
                {selected.owner && (
                  <p className="text-white/30 text-xs mt-2">Owner: {selected.owner}</p>
                )}
                <p className="text-white/20 text-xs font-mono mt-1">{selected.id}</p>
              </div>
            </div>

            {/* Capabilities */}
            {selected.capabilities && selected.capabilities.length > 0 && (
              <div className="mb-6 fade-in">
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Capabilities</h3>
                <div className="flex flex-wrap gap-1.5">
                  {selected.capabilities.map(c => (
                    <span key={c} className="badge text-white/50 bg-white/5 border-white/10">{c}</span>
                  ))}
                </div>
              </div>
            )}

            {/* Capability Card */}
            <div className="mb-6">
              {capCardLoading ? (
                <div className="skeleton h-32" />
              ) : (
                <CapabilityCard data={capCard} />
              )}
            </div>

            {/* Contributions */}
            <div className="mb-6">
              {contribLoading ? (
                <div className="skeleton h-48" />
              ) : (
                <ContributionStats data={contributions} />
              )}
            </div>

            {/* Model */}
            {selected.model && (
              <div className="mb-6 fade-in">
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Model</h3>
                <span className="flex items-center gap-1.5 text-white/60 text-sm">
                  <Cpu className="w-3.5 h-3.5" />
                  {selected.model}
                </span>
              </div>
            )}

            {/* Scorecard */}
            <div className="mb-6 fade-in" style={{ animationDelay: '100ms' }}>
              <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Performance</h3>
              {scorecardLoading ? (
                <div className="skeleton h-24" />
              ) : scorecard ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                  <div className="card p-3 text-center">
                    <div className="text-white font-semibold text-lg">{scorecard.tasks_completed ?? 0}</div>
                    <div className="text-white/40 text-xs">Completed</div>
                  </div>
                  <div className="card p-3 text-center">
                    <div className="text-white font-semibold text-lg">{scorecard.tasks_failed ?? 0}</div>
                    <div className="text-white/40 text-xs">Failed</div>
                  </div>
                  <div className="card p-3 text-center">
                    <div className="text-white font-semibold text-lg">
                      {scorecard.total_tokens ? `${(scorecard.total_tokens / 1000).toFixed(0)}k` : '—'}
                    </div>
                    <div className="text-white/40 text-xs">Tokens</div>
                  </div>
                  <div className="card p-3 text-center">
                    <div className="text-white font-semibold text-lg">
                      {scorecard.total_cost_usd != null ? `$${scorecard.total_cost_usd.toFixed(2)}` : '—'}
                    </div>
                    <div className="text-white/40 text-xs">Cost</div>
                  </div>
                </div>
              ) : (
                <div className="card p-4 text-center text-white/30 text-sm">No performance data available</div>
              )}
            </div>

            {/* Recent tasks */}
            {scorecard?.recent_tasks && scorecard.recent_tasks.length > 0 && (
              <div className="fade-in" style={{ animationDelay: '150ms' }}>
                <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2">Recent Tasks</h3>
                <div className="space-y-1.5">
                  {scorecard.recent_tasks.map(task => (
                    <div key={task.id} className="card p-3 flex items-center gap-3">
                      <span className={`badge text-xs ${
                        task.status === 'done' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                        task.status === 'in_progress' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                        'text-white/40 bg-white/5 border-white/10'
                      }`}>
                        {task.status}
                      </span>
                      <span className="text-white/70 text-sm truncate flex-1">{task.title}</span>
                      {task.completed_at && (
                        <span className="text-white/25 text-xs">{formatRelative(task.completed_at)}</span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
