'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listMerges, requestMerge, voteMerge, getAgentInfo } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative, STATUS_COLORS } from '@/lib/utils';
import { GitMerge, Plus, CheckCircle, XCircle, Clock } from 'lucide-react';

interface Merge {
  id: string;
  source: string;
  summary: string;
  status: string;
  requested_by?: string;
  created_at: string;
  feedback?: string;
  votes?: Array<{ agent_id: string; vote: string; feedback?: string }>;
}

export default function MergesPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const agentInfo = typeof window !== 'undefined' ? getAgentInfo(workspaceId) : null;
  const myRole = agentInfo?.role as string | undefined;

  const [merges, setMerges] = useState<Merge[]>([]);
  const [loading, setLoading] = useState(true);
  const [showNew, setShowNew] = useState(false);
  const [source, setSource] = useState('');
  const [summary, setSummary] = useState('');
  const [creating, setCreating] = useState(false);
  const [showVote, setShowVote] = useState<string | null>(null);
  const [feedback, setFeedback] = useState('');

  async function load() {
    try {
      const data = await listMerges(workspaceId);
      const list = Array.isArray(data) ? data : data?.merges || [];
      setMerges(list.sort((a: Merge, b: Merge) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally {
      setLoading(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!source.trim() || !summary.trim()) return;
    setCreating(true);
    try {
      await requestMerge(workspaceId, { source: source.trim(), summary: summary.trim() });
      setSource(''); setSummary('');
      setShowNew(false);
      await load();
    } finally {
      setCreating(false);
    }
  }

  async function handleVote(mergeId: string, status: 'approved' | 'rejected') {
    await voteMerge(workspaceId, mergeId, { status, feedback: feedback.trim() || undefined });
    setShowVote(null); setFeedback('');
    await load();
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (['merge_requested', 'merge_voted'].includes(e.type)) load();
    });
    return () => { unsub(); };
  }, [workspaceId]);

  const canVote = myRole === 'lead' || myRole === 'reviewer';

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Merges</h1>
          <p className="text-white/40 text-sm">{merges.length} total • {merges.filter((m) => m.status === 'pending').length} pending</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Request Merge
        </button>
      </div>

      {/* New merge modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-4">Request Merge</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <div>
                <label className="text-white/50 text-xs mb-1 block">Source Branch / Work Item</label>
                <input className="input-base font-mono" placeholder="feature/my-feature" value={source} onChange={(e) => setSource(e.target.value)} autoFocus required />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Summary</label>
                <textarea className="input-base h-24 resize-none" placeholder="Describe what's being merged and why..." value={summary} onChange={(e) => setSummary(e.target.value)} required />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={creating || !source || !summary} className="btn-primary flex-1">
                  {creating ? 'Requesting...' : 'Request Merge'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Vote modal */}
      {showVote && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-md">
            <h2 className="text-white font-semibold text-lg mb-4">Vote on Merge</h2>
            <textarea
              className="input-base h-20 resize-none mb-4"
              placeholder="Feedback (optional)"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              autoFocus
            />
            <div className="flex gap-2">
              <button onClick={() => setShowVote(null)} className="btn-ghost flex-1">Cancel</button>
              <button onClick={() => handleVote(showVote, 'rejected')} className="btn-danger flex-1">
                <XCircle className="w-4 h-4 mr-1.5 inline" />Reject
              </button>
              <button onClick={() => handleVote(showVote, 'approved')} className="btn-success flex-1">
                <CheckCircle className="w-4 h-4 mr-1.5 inline" />Approve
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <div key={i} className="card p-5 animate-pulse h-28" />)}</div>
      ) : merges.length === 0 ? (
        <div className="card p-12 text-center">
          <GitMerge className="w-12 h-12 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 mb-2">No merge requests</p>
          <button onClick={() => setShowNew(true)} className="btn-primary mt-2">Request first merge</button>
        </div>
      ) : (
        <div className="space-y-3">
          {merges.map((merge) => (
            <div key={merge.id} className="card p-5">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <code className="text-violet-400 font-mono text-sm bg-violet-500/10 px-2 py-0.5 rounded">
                      {merge.source}
                    </code>
                    <span className={`badge ${STATUS_COLORS[merge.status] || 'text-white/40 bg-white/5 border-white/10'}`}>
                      {merge.status}
                    </span>
                  </div>
                  <p className="text-white/60 text-sm">{merge.summary}</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className="text-white/25 text-xs flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatRelative(merge.created_at)}
                  </span>
                  {merge.requested_by && (
                    <span className="text-white/25 text-xs">by {merge.requested_by}</span>
                  )}
                </div>
              </div>

              {/* Votes */}
              {merge.votes && merge.votes.length > 0 && (
                <div className="mb-3">
                  <p className="text-white/30 text-xs mb-1.5 uppercase tracking-wide">Votes</p>
                  <div className="space-y-1">
                    {merge.votes.map((v, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs">
                        {v.vote === 'approved'
                          ? <CheckCircle className="w-3.5 h-3.5 text-green-400" />
                          : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                        <span className="text-white/50">{v.agent_id}</span>
                        {v.feedback && <span className="text-white/30">— {v.feedback}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {merge.feedback && (
                <p className="text-white/40 text-xs mb-3 italic">"{merge.feedback}"</p>
              )}

              {/* Vote button */}
              {merge.status === 'pending' && canVote && (
                <button
                  onClick={() => { setShowVote(merge.id); setFeedback(''); }}
                  className="btn-primary text-xs py-1.5"
                >
                  <GitMerge className="w-3.5 h-3.5 mr-1.5 inline" />
                  Vote on Merge
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
