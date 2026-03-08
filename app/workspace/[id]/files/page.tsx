'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { listFileTree, readFile, writeFile } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import { formatRelative } from '@/lib/utils';
import { FolderOpen, FileText, Plus, Save, X, ChevronRight, Loader2 } from 'lucide-react';

interface FileEntry {
  path: string;
  size?: number;
  updated_at?: string;
  type?: string;
}

export default function FilesPage() {
  const params = useParams();
  const workspaceId = params.id as string;

  const [files, setFiles] = useState<FileEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState('');
  const [loadingFile, setLoadingFile] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);
  const [showNewFile, setShowNewFile] = useState(false);
  const [newPath, setNewPath] = useState('');
  const [newContent, setNewContent] = useState('');
  const [creating, setCreating] = useState(false);

  async function load() {
    try {
      const data = await listFileTree(workspaceId);
      setFiles(Array.isArray(data) ? data : data?.files || data?.tree || []);
    } finally {
      setLoading(false);
    }
  }

  async function openFile(path: string) {
    setSelectedFile(path);
    setLoadingFile(true);
    setEditing(false);
    try {
      const data = await readFile(workspaceId, path);
      const content = typeof data === 'string' ? data : data?.content || JSON.stringify(data, null, 2);
      setFileContent(content);
      setEditContent(content);
    } catch {
      setFileContent('Error reading file');
    } finally {
      setLoadingFile(false);
    }
  }

  async function handleSave() {
    if (!selectedFile) return;
    setSaving(true);
    try {
      await writeFile(workspaceId, selectedFile, editContent);
      setFileContent(editContent);
      setEditing(false);
      await load();
    } finally {
      setSaving(false);
    }
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!newPath.trim()) return;
    setCreating(true);
    try {
      await writeFile(workspaceId, newPath.trim(), newContent);
      setShowNewFile(false); setNewPath(''); setNewContent('');
      await load();
      await openFile(newPath.trim());
    } finally {
      setCreating(false);
    }
  }

  useEffect(() => {
    load();
    const unsub = wsClient.subscribe((e) => {
      if (e.type === 'file_written') {
        load();
        if (selectedFile && (e as { path?: string }).path === selectedFile) openFile(selectedFile);
      }
    });
    return () => { unsub(); };
  }, [workspaceId]);

  // Group files by directory
  const grouped: Record<string, FileEntry[]> = {};
  files.forEach((f) => {
    const parts = f.path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    if (!grouped[dir]) grouped[dir] = [];
    grouped[dir].push(f);
  });

  return (
    <div className="flex h-full">
      {/* Sidebar: file tree */}
      <div className="w-64 flex-shrink-0 border-r border-white/[0.08] flex flex-col bg-black/20">
        <div className="p-3 border-b border-white/[0.08] flex items-center justify-between">
          <span className="text-white/60 text-xs uppercase tracking-wide font-medium">Files</span>
          <button onClick={() => setShowNewFile(true)} className="text-violet-400 hover:text-violet-300">
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-2">
          {loading ? (
            <div className="space-y-1.5 p-2">
              {[...Array(6)].map((_, i) => <div key={i} className="h-7 bg-white/5 rounded animate-pulse" />)}
            </div>
          ) : files.length === 0 ? (
            <div className="p-4 text-center">
              <FolderOpen className="w-8 h-8 text-white/20 mx-auto mb-2" />
              <p className="text-white/30 text-xs">No files yet</p>
              <button onClick={() => setShowNewFile(true)} className="text-violet-400 text-xs mt-2 hover:text-violet-300">
                + Create file
              </button>
            </div>
          ) : (
            Object.entries(grouped).map(([dir, dirFiles]) => (
              <div key={dir} className="mb-2">
                {dir !== '/' && (
                  <div className="flex items-center gap-1 px-2 py-1 text-white/30 text-xs">
                    <FolderOpen className="w-3 h-3" />
                    {dir}
                  </div>
                )}
                {dirFiles.map((f) => {
                  const name = f.path.split('/').pop() || f.path;
                  return (
                    <button
                      key={f.path}
                      onClick={() => openFile(f.path)}
                      className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-xs text-left transition-all ${
                        selectedFile === f.path
                          ? 'bg-violet-600/20 text-violet-300'
                          : 'text-white/50 hover:text-white hover:bg-white/5'
                      }`}
                    >
                      <FileText className="w-3 h-3 flex-shrink-0" />
                      <span className="truncate">{dir !== '/' ? name : f.path}</span>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>

      {/* Main: file content */}
      <div className="flex-1 flex flex-col min-w-0">
        {selectedFile ? (
          <>
            {/* File header */}
            <div className="flex items-center justify-between px-4 py-3 border-b border-white/[0.08] bg-black/10">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-violet-400" />
                <span className="font-mono text-sm text-white/80">{selectedFile}</span>
              </div>
              <div className="flex items-center gap-2">
                {editing ? (
                  <>
                    <button onClick={() => setEditing(false)} className="btn-ghost text-xs py-1.5">
                      <X className="w-3.5 h-3.5 mr-1 inline" />Cancel
                    </button>
                    <button onClick={handleSave} disabled={saving} className="btn-primary text-xs py-1.5">
                      {saving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5 mr-1 inline" />}
                      Save
                    </button>
                  </>
                ) : (
                  <button onClick={() => setEditing(true)} className="btn-ghost text-xs py-1.5">
                    Edit
                  </button>
                )}
              </div>
            </div>

            {/* File content */}
            <div className="flex-1 overflow-hidden">
              {loadingFile ? (
                <div className="flex items-center justify-center h-full">
                  <Loader2 className="w-6 h-6 text-violet-400 animate-spin" />
                </div>
              ) : editing ? (
                <textarea
                  className="w-full h-full bg-transparent text-white/80 font-mono text-sm p-4 resize-none focus:outline-none"
                  value={editContent}
                  onChange={(e) => setEditContent(e.target.value)}
                  spellCheck={false}
                  autoFocus
                />
              ) : (
                <pre className="p-4 text-white/70 font-mono text-sm overflow-auto h-full whitespace-pre-wrap break-words">
                  {fileContent}
                </pre>
              )}
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center">
              <FileText className="w-12 h-12 text-white/15 mx-auto mb-3" />
              <p className="text-white/30 text-sm">Select a file to view</p>
              <button onClick={() => setShowNewFile(true)} className="btn-primary mt-4 text-sm">
                + New File
              </button>
            </div>
          </div>
        )}
      </div>

      {/* New file modal */}
      {showNewFile && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="card p-6 w-full max-w-lg">
            <h2 className="text-white font-semibold text-lg mb-4">New File</h2>
            <form onSubmit={handleCreate} className="space-y-4">
              <input
                className="input-base font-mono"
                placeholder="path/to/file.md"
                value={newPath}
                onChange={(e) => setNewPath(e.target.value)}
                autoFocus
              />
              <textarea
                className="input-base h-40 resize-none font-mono text-xs"
                placeholder="File content..."
                value={newContent}
                onChange={(e) => setNewContent(e.target.value)}
              />
              <div className="flex gap-2">
                <button type="button" onClick={() => setShowNewFile(false)} className="btn-ghost flex-1">Cancel</button>
                <button type="submit" disabled={creating || !newPath.trim()} className="btn-primary flex-1">
                  {creating ? 'Creating...' : 'Create File'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
