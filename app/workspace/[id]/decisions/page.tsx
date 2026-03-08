'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listDecisions, recordDecision } from '@/lib/api';
import { formatRelative } from '@/lib/utils';
import { BookOpen, Plus, ChevronDown, ChevronRight } from 'lucide-react';

interface Decision {
  id: string;
  title: string;
  decision: string;
  rationale: string;
  recorded_by?: string;
  created_at: string;
}

export default function DecisionsPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [decisions, setDecisions] = useState<Decision[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showNew, setShowNew] = useState(false);
  const [title, setTitle] = useState('');
  const [decision, setDecision] = useState('');
  const [rationale, setRationale] = useState('');
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const data = await listDecisions(workspaceId);
      const list = Array.isArray(data) ? data : data?.decisions || [];
      setDecisions(list.sort((a: Decision, b: Decision) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()));
    } finally {
      setLoading(false);
    }
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim() || !decision.trim() || !rationale.trim()) return;
    setSaving(true);
    try {
      await recordDecision(workspaceId, {
        title: title.trim(), decision: decision.trim(), rationale: rationale.trim()
      });
      setTitle(''); setDecision(''); setRationale('');
      setShowNew(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  useEffect(() => { load(); }, [workspaceId]);

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-xl font-bold text-white">Decisions</h1>
          <p className="text-white/40 text-sm">{decisions.length} recorded</p>
        </div>
        <button onClick={() => setShowNew(true)} className="btn-primary flex items-center gap-1.5">
          <Plus className="w-4 h-4" />
          Record Decision
        </button>
      </div>

      {/* New decision modal */}
      {showNew && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-4">Record Decision</h2>
            <form onSubmit={handleSave} className="space-y-4">
              <input className="input-base" placeholder="Decision title *" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus required />
              <div>
                <label className="text-white/50 text-xs mb-1 block">The Decision *</label>
                <textarea className="input-base h-20 resize-none" placeholder="What was decided?" value={decision} onChange={(e) => setDecision(e.target.value)} required />
              </div>
              <div>
                <label className="text-white/50 text-xs mb-1 block">Rationale *</label>
                <textarea className="input-base h-20 resize-none" placeholder="Why was this decided?" value={rationale} onChange={(e) => setRationale(e.target.value)} required />
              </div>
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNew(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={saving || !title || !decision || !rationale} className="btn-primary flex-1">
                  {saving ? 'Recording...' : 'Record Decision'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {loading ? (
        <div className="space-y-2">{[...Array(4)].map((_, i) => <div key={i} className="card p-4 animate-pulse h-16" />)}</div>
      ) : decisions.length === 0 ? (
        <div className="card p-12 text-center">
          <BookOpen className="w-12 h-12 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 mb-2">No decisions recorded</p>
          <p className="text-white/20 text-sm">Document key architectural and product decisions</p>
          <button onClick={() => setShowNew(true)} className="btn-primary mt-4">Record first decision</button>
        </div>
      ) : (
        <div className="space-y-2">
          {decisions.map((d) => (
            <div key={d.id} className="card overflow-hidden">
              <button
                className="w-full p-4 flex items-start gap-3 text-left hover:bg-white/[0.02] transition-colors"
                onClick={() => setExpanded(expanded === d.id ? null : d.id)}
              >
                {expanded === d.id
                  ? <ChevronDown className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />
                  : <ChevronRight className="w-4 h-4 text-white/30 flex-shrink-0 mt-0.5" />}
                <div className="flex-1 min-w-0">
                  <h3 className="text-white/90 text-sm font-medium">{d.title}</h3>
                  {!expanded && (
                    <p className="text-white/40 text-xs mt-0.5 truncate">{d.decision}</p>
                  )}
                </div>
                <span className="text-white/25 text-xs flex-shrink-0">{formatRelative(d.created_at)}</span>
              </button>
              {expanded === d.id && (
                <div className="px-4 pb-4 border-t border-white/5 pt-3 space-y-3">
                  <div>
                    <label className="text-violet-400 text-xs uppercase tracking-wide font-medium">Decision</label>
                    <p className="text-white/70 text-sm mt-1">{d.decision}</p>
                  </div>
                  <div>
                    <label className="text-blue-400 text-xs uppercase tracking-wide font-medium">Rationale</label>
                    <p className="text-white/60 text-sm mt-1">{d.rationale}</p>
                  </div>
                  {d.recorded_by && (
                    <p className="text-white/25 text-xs">Recorded by {d.recorded_by}</p>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
