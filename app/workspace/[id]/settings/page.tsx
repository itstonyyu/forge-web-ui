'use client';

import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { getWorkspace, updateSettings, createInvite } from '@/lib/api';
import { Settings, Archive, GitMerge, Bell, Link2, Copy, Check, X, Save, Share2, AlertTriangle } from 'lucide-react';

const INVITE_BASE = 'https://web-alpha-lilac-58.vercel.app/invite';

interface Workspace {
  id: string;
  name: string;
  description?: string;
  owner?: string;
  merge_policy?: {
    require_different_agent_review?: boolean;
    require_human_approval?: boolean;
    auto_merge_on_pass?: boolean;
  };
}

function SavedToast({ show, message }: { show: boolean; message: string }) {
  return (
    <div className={`fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg bg-green-500/20 border border-green-500/30 text-green-400 text-sm font-medium backdrop-blur-sm shadow-lg ${show ? 'toast-enter' : 'toast-exit pointer-events-none'}`} style={{ display: show ? 'flex' : 'none' }}>
      <Check className="w-4 h-4" />
      {message}
    </div>
  );
}

function DeleteConfirmDialog({ open, onClose, onConfirm, workspaceName }: { open: boolean; onClose: () => void; onConfirm: () => void; workspaceName: string }) {
  const [confirmText, setConfirmText] = useState('');
  if (!open) return null;
  
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative card p-6 w-full max-w-sm mx-4 bg-[#0d0d14] border border-red-500/20">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-red-500/15 border border-red-500/20">
            <AlertTriangle className="w-5 h-5 text-red-400" />
          </div>
          <div>
            <h3 className="text-white font-semibold text-sm">Delete Workspace</h3>
            <p className="text-white/40 text-xs mt-0.5">This action cannot be undone</p>
          </div>
        </div>
        <p className="text-white/60 text-sm mb-3">Type <strong className="text-white font-mono">{workspaceName}</strong> to confirm deletion:</p>
        <input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder={workspaceName} className="input-base mb-4" autoFocus />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="btn-ghost border border-white/10 text-sm">Cancel</button>
          <button onClick={() => { onConfirm(); onClose(); }} disabled={confirmText !== workspaceName} className="btn-danger text-sm disabled:opacity-40">Delete Workspace</button>
        </div>
      </div>
    </div>
  );
}

function InviteModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const [role, setRole] = useState('builder');
  const [loading, setLoading] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  async function handleGenerate() {
    setLoading(true);
    try {
      const result = await createInvite(workspaceId, { role });
      setLink(`${INVITE_BASE}/${result.token}`);
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
            <h2 className="text-white font-semibold">Generate Invite Link</h2>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white/70"><X className="w-4 h-4" /></button>
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
            <button onClick={handleGenerate} disabled={loading} className="btn-primary w-full">{loading ? 'Generating...' : 'Generate Invite Link'}</button>
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
              <button onClick={() => setLink(null)} className="btn-ghost text-sm">New Link</button>
              <button onClick={onClose} className="btn-ghost text-sm ml-auto">Done</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (val: boolean) => void; label: string }) {
  return (
    <label className="flex items-center justify-between py-3 cursor-pointer group">
      <span className="text-white/70 text-sm group-hover:text-white/90 transition-colors">{label}</span>
      <button type="button" role="switch" aria-checked={checked} onClick={() => onChange(!checked)} className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${checked ? 'bg-violet-600' : 'bg-white/15'}`}>
        <span className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${checked ? 'translate-x-4' : 'translate-x-0.5'}`} />
      </button>
    </label>
  );
}

export default function SettingsPage() {
  const params = useParams();
  const workspaceId = params.id as string;
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [savingProject, setSavingProject] = useState(false);
  const [requireDifferentAgent, setRequireDifferentAgent] = useState(false);
  const [requireHumanApproval, setRequireHumanApproval] = useState(false);
  const [autoMergeOnPass, setAutoMergeOnPass] = useState(false);
  const [savingPolicy, setSavingPolicy] = useState(false);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2500);
  }, []);

  async function loadWorkspace() {
    try {
      const data = await getWorkspace(workspaceId);
      const ws: Workspace = data?.workspace || data;
      setWorkspace(ws);
      setName(ws.name || '');
      setDescription(ws.description || '');
      if (ws.merge_policy) {
        setRequireDifferentAgent(ws.merge_policy.require_different_agent_review ?? false);
        setRequireHumanApproval(ws.merge_policy.require_human_approval ?? false);
        setAutoMergeOnPass(ws.merge_policy.auto_merge_on_pass ?? false);
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadWorkspace(); }, [workspaceId]);

  async function handleSaveProject() {
    setSavingProject(true);
    try {
      await updateSettings(workspaceId, { name, description });
      showToast('Project settings saved');
      await loadWorkspace();
    } finally {
      setSavingProject(false);
    }
  }

  async function handleSavePolicy() {
    setSavingPolicy(true);
    try {
      await updateSettings(workspaceId, { merge_policy: { require_different_agent_review: requireDifferentAgent, require_human_approval: requireHumanApproval, auto_merge_on_pass: autoMergeOnPass } });
      showToast('Merge policies saved');
    } finally {
      setSavingPolicy(false);
    }
  }

  if (loading) return <div className="p-6 space-y-6">{[...Array(3)].map((_, i) => <div key={i} className="skeleton h-32" />)}</div>;

  return (
    <div className="p-6 max-w-2xl page-enter">
      {showInvite && <InviteModal workspaceId={workspaceId} onClose={() => setShowInvite(false)} />}
      <DeleteConfirmDialog open={showDeleteConfirm} onClose={() => setShowDeleteConfirm(false)} onConfirm={() => showToast('Delete functionality coming soon')} workspaceName={name} />
      <SavedToast show={!!toast} message={toast || ''} />

      <h1 className="text-xl font-bold text-white mb-6 flex items-center gap-2"><Settings className="w-5 h-5 text-violet-400" />Settings</h1>

      <section className="card p-5 mb-6 fade-in">
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-4">Project</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Name</label>
            <input className="input-base" value={name} onChange={(e) => setName(e.target.value)} placeholder="Workspace name" />
          </div>
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Description</label>
            <textarea className="input-base resize-none h-20" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="What is this workspace for?" />
          </div>
          <div>
            <label className="block text-white/50 text-xs uppercase tracking-wide mb-1.5">Owner</label>
            <input className="input-base bg-white/[0.02]" value={workspace?.owner || '—'} disabled />
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSaveProject} disabled={savingProject} className="btn-primary flex items-center gap-1.5">
              <Save className="w-4 h-4" />{savingProject ? 'Saving...' : 'Save'}
            </button>
            <button onClick={() => setShowDeleteConfirm(true)} className="btn-danger flex items-center gap-1.5 ml-auto">
              <Archive className="w-4 h-4" />Delete Workspace
            </button>
          </div>
        </div>
      </section>

      <section className="card p-5 mb-6 fade-in" style={{ animationDelay: '50ms' }}>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-2 flex items-center gap-2">
          <GitMerge className="w-3.5 h-3.5" />Merge Policies
        </h2>
        <div className="divide-y divide-white/[0.06]">
          <Toggle checked={requireDifferentAgent} onChange={setRequireDifferentAgent} label="Require review from a different agent" />
          <Toggle checked={requireHumanApproval} onChange={setRequireHumanApproval} label="Require human approval" />
          <Toggle checked={autoMergeOnPass} onChange={setAutoMergeOnPass} label="Auto-merge when all checks pass" />
        </div>
        <button onClick={handleSavePolicy} disabled={savingPolicy} className="btn-primary flex items-center gap-1.5 mt-4">
          <Save className="w-4 h-4" />{savingPolicy ? 'Saving...' : 'Save Policies'}
        </button>
      </section>

      <section className="card p-5 mb-6 fade-in" style={{ animationDelay: '100ms' }}>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Link2 className="w-3.5 h-3.5" />Invites
        </h2>
        <p className="text-white/40 text-sm mb-3">Generate invite links to let others join this workspace.</p>
        <button onClick={() => setShowInvite(true)} className="btn-primary flex items-center gap-1.5">
          <Link2 className="w-4 h-4" />Generate Invite
        </button>
      </section>

      <section className="card p-5 fade-in" style={{ animationDelay: '150ms' }}>
        <h2 className="text-sm font-medium text-white/60 uppercase tracking-wide mb-3 flex items-center gap-2">
          <Bell className="w-3.5 h-3.5" />Notifications
        </h2>
        <div className="text-center py-6">
          <Bell className="w-8 h-8 text-white/15 mx-auto mb-2" />
          <p className="text-white/30 text-sm">Coming soon</p>
        </div>
      </section>
    </div>
  );
}
