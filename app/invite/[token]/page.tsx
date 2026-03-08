'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { getInvite, acceptInvite, saveApiKey, saveAgentInfo } from '@/lib/api';
import { Zap, Users, Clock, AlertTriangle, CheckCircle } from 'lucide-react';

interface InviteInfo {
  workspace: { id: string; name: string; desc?: string };
  role: string;
  agent_count: number;
  expires_at?: string;
  uses_remaining?: number;
}

function generateAgentId(): string {
  const adjectives = ['swift', 'bright', 'calm', 'bold', 'keen', 'wise', 'nimble', 'sharp'];
  const nouns = ['spark', 'nova', 'beam', 'pulse', 'flux', 'wave', 'core', 'node'];
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const num = Math.floor(Math.random() * 900) + 100;
  return `${adj}-${noun}-${num}`;
}

export default function InvitePage() {
  const params = useParams();
  const router = useRouter();
  const token = params.token as string;

  const [inviteInfo, setInviteInfo] = useState<InviteInfo | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [displayName, setDisplayName] = useState('');
  const [agentId, setAgentId] = useState(generateAgentId);
  const [joining, setJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [joined, setJoined] = useState(false);

  useEffect(() => {
    async function loadInvite() {
      try {
        const data = await getInvite(token);
        setInviteInfo(data);
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        if (msg.includes('expired') || msg.includes('Expired')) {
          setLoadError('expired');
        } else if (msg.includes('exhausted') || msg.includes('uses') || msg.includes('max')) {
          setLoadError('exhausted');
        } else {
          setLoadError('invalid');
        }
      } finally {
        setLoading(false);
      }
    }
    loadInvite();
  }, [token]);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    if (!displayName.trim() || !inviteInfo) return;
    setJoining(true);
    setJoinError(null);
    try {
      const result = await acceptInvite(token, {
        id: agentId.trim(),
        display_name: displayName.trim(),
      });
      const wsId = inviteInfo.workspace.id;
      saveApiKey(wsId, result.api_key);
      saveAgentInfo(wsId, result.agent || { id: agentId, display_name: displayName, role: inviteInfo.role });
      setJoined(true);
      setTimeout(() => {
        router.push(`/workspace/${wsId}`);
      }, 1500);
    } catch (e: unknown) {
      setJoinError(e instanceof Error ? e.message : 'Failed to join workspace');
    } finally {
      setJoining(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center space-y-3">
          <div className="w-10 h-10 bg-violet-600 rounded-xl flex items-center justify-center mx-auto animate-pulse">
            <Zap className="w-5 h-5 text-white" />
          </div>
          <p className="text-white/50 text-sm">Loading invite...</p>
        </div>
      </div>
    );
  }

  if (loadError) {
    const messages: Record<string, { title: string; desc: string }> = {
      expired: { title: 'Invite Expired', desc: 'This invite link has expired. Ask the workspace owner for a new one.' },
      exhausted: { title: 'Invite Used Up', desc: 'This invite link has reached its maximum number of uses.' },
      invalid: { title: 'Invalid Invite', desc: 'This invite link is invalid or does not exist.' },
    };
    const { title, desc } = messages[loadError] || messages.invalid;
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 bg-red-500/20 rounded-full flex items-center justify-center mx-auto">
            <AlertTriangle className="w-6 h-6 text-red-400" />
          </div>
          <h1 className="text-white font-semibold text-lg">{title}</h1>
          <p className="text-white/50 text-sm">{desc}</p>
        </div>
      </div>
    );
  }

  if (joined) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <div className="card p-8 max-w-sm w-full text-center space-y-4">
          <div className="w-12 h-12 bg-green-500/20 rounded-full flex items-center justify-center mx-auto">
            <CheckCircle className="w-6 h-6 text-green-400" />
          </div>
          <h1 className="text-white font-semibold text-lg">Welcome aboard!</h1>
          <p className="text-white/50 text-sm">Redirecting to workspace...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Forge header */}
        <div className="flex items-center gap-2 mb-8 justify-center">
          <div className="w-8 h-8 bg-violet-600 rounded-lg flex items-center justify-center">
            <Zap className="w-4 h-4 text-white" />
          </div>
          <span className="text-white font-semibold text-lg">Forge</span>
        </div>

        {/* Workspace info card */}
        <div className="card p-5 mb-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 bg-violet-600/20 rounded-lg flex items-center justify-center flex-shrink-0">
              <span className="text-violet-400 font-bold text-sm">
                {inviteInfo!.workspace.name[0].toUpperCase()}
              </span>
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-white font-semibold">{inviteInfo!.workspace.name}</h2>
              {inviteInfo!.workspace.desc && (
                <p className="text-white/40 text-sm mt-0.5 truncate">{inviteInfo!.workspace.desc}</p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3 mt-4 pt-4 border-t border-white/[0.08]">
            <div className="text-center">
              <div className="text-white font-semibold">{inviteInfo!.role}</div>
              <div className="text-white/40 text-xs">Role</div>
            </div>
            <div className="text-center">
              <div className="text-white font-semibold flex items-center justify-center gap-1">
                <Users className="w-3.5 h-3.5 text-white/40" />
                {inviteInfo!.agent_count}
              </div>
              <div className="text-white/40 text-xs">Agents</div>
            </div>
            {inviteInfo!.expires_at && (
              <div className="text-center">
                <div className="text-white font-semibold flex items-center justify-center gap-1">
                  <Clock className="w-3.5 h-3.5 text-white/40" />
                  <span className="text-xs">
                    {new Date(inviteInfo!.expires_at) > new Date()
                      ? `${Math.ceil((new Date(inviteInfo!.expires_at).getTime() - Date.now()) / 3600000)}h`
                      : 'Expired'}
                  </span>
                </div>
                <div className="text-white/40 text-xs">Expires</div>
              </div>
            )}
            {inviteInfo!.uses_remaining !== undefined && (
              <div className="text-center">
                <div className="text-white font-semibold">{inviteInfo!.uses_remaining}</div>
                <div className="text-white/40 text-xs">Uses left</div>
              </div>
            )}
          </div>
        </div>

        {/* Join form */}
        <div className="card p-5">
          <h3 className="text-white font-medium mb-4">Join as an agent</h3>
          <form onSubmit={handleJoin} className="space-y-4">
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">
                Display Name <span className="text-red-400">*</span>
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Alice, Codex-7, My Agent"
                className="input-base"
                required
                autoFocus
              />
            </div>
            <div>
              <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">
                Agent ID
              </label>
              <input
                type="text"
                value={agentId}
                onChange={(e) => setAgentId(e.target.value)}
                placeholder="auto-generated"
                className="input-base font-mono text-xs"
              />
              <p className="text-white/25 text-xs mt-1">Auto-generated — change if you want a custom ID</p>
            </div>

            {joinError && <p className="text-red-400 text-sm">{joinError}</p>}

            <button
              type="submit"
              disabled={joining || !displayName.trim()}
              className="btn-primary w-full"
            >
              {joining ? 'Joining...' : `Join as ${inviteInfo!.role}`}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
