'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listAgents, getStatuses } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative } from '@/lib/utils';
import { Users, Cpu, Activity } from 'lucide-react';

interface Agent {
  id: string;
  display_name: string;
  role: string;
  owner?: string;
  model?: string;
  capabilities?: string[];
  joined_at?: string;
  zone?: string;
}

interface AgentStatus {
  agent_id: string;
  state: string;
  message?: string;
  updated_at: string;
}

const ROLE_COLORS: Record<string, string> = {
  lead: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  reviewer: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  worker: 'text-green-400 bg-green-400/10 border-green-400/20',
  observer: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
};

export default function AgentsPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [agents, setAgents] = useState<Agent[]>([]);
  const [statuses, setStatuses] = useState<AgentStatus[]>([]);
  const [loading, setLoading] = useState(true);

  async function load() {
    try {
      const [a, s] = await Promise.allSettled([
        listAgents(workspaceId),
        getStatuses(workspaceId),
      ]);
      if (a.status === 'fulfilled') setAgents(Array.isArray(a.value) ? a.value : a.value?.agents || []);
      if (s.status === 'fulfilled') setStatuses(Array.isArray(s.value) ? s.value : s.value?.statuses || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (['agent_joined', 'agent_left'].includes(e.type)) load();
    });
    return () => unsub();
  }, [workspaceId]);

  function getStatus(agentId: string): AgentStatus | undefined {
    return statuses.find((s) => s.agent_id === agentId);
  }

  function isOnline(agentId: string): boolean {
    const s = getStatus(agentId);
    if (!s) return false;
    const diff = Date.now() - new Date(s.updated_at).getTime();
    return diff < 5 * 60 * 1000; // 5 min
  }

  return (
    <div className="p-6 max-w-4xl">
      <div className="mb-6">
        <h1 className="text-xl font-bold text-white">Agents</h1>
        <p className="text-white/40 text-sm">{agents.length} in workspace</p>
      </div>

      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {[...Array(4)].map((_, i) => <div key={i} className="card p-5 animate-pulse h-32" />)}
        </div>
      ) : agents.length === 0 ? (
        <div className="card p-12 text-center">
          <Users className="w-12 h-12 text-white/15 mx-auto mb-3" />
          <p className="text-white/30">No agents in workspace</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {agents.map((agent) => {
            const status = getStatus(agent.id);
            const online = isOnline(agent.id);
            return (
              <div key={agent.id} className="card p-5">
                <div className="flex items-start gap-3 mb-3">
                  <div className="relative flex-shrink-0">
                    <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center text-sm font-medium text-white/60">
                      {(agent.display_name || agent.id)[0].toUpperCase()}
                    </div>
                    <div className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 rounded-full border-2 border-[#0a0a0f] ${online ? 'bg-green-400' : 'bg-gray-600'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <h3 className="text-white font-medium text-sm truncate">{agent.display_name}</h3>
                      <span className={`badge text-xs ${ROLE_COLORS[agent.role] || 'text-white/40 bg-white/5 border-white/10'}`}>
                        {agent.role}
                      </span>
                    </div>
                    {agent.owner && (
                      <p className="text-white/40 text-xs">by {agent.owner}</p>
                    )}
                  </div>
                </div>

                {/* Status */}
                {status && (
                  <div className="flex items-center gap-1.5 mb-3">
                    <Activity className="w-3 h-3 text-white/30" />
                    <span className={`text-xs ${online ? 'text-green-400' : 'text-white/30'}`}>
                      {status.state}
                    </span>
                    {status.message && (
                      <span className="text-white/30 text-xs truncate">— {status.message}</span>
                    )}
                  </div>
                )}

                {/* Meta */}
                <div className="flex flex-wrap gap-1.5 mb-3">
                  {agent.model && (
                    <span className="flex items-center gap-1 text-xs text-white/30 bg-white/5 rounded px-1.5 py-0.5">
                      <Cpu className="w-3 h-3" />
                      {agent.model}
                    </span>
                  )}
                  {agent.capabilities?.map((c) => (
                    <span key={c} className="text-xs text-white/30 bg-white/5 rounded px-1.5 py-0.5">
                      {c}
                    </span>
                  ))}
                </div>

                <div className="flex items-center justify-between text-xs text-white/25">
                  <span className="font-mono truncate">{agent.id}</span>
                  {status && <span>{formatRelative(status.updated_at)}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
