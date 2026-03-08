'use client';

import { useEffect, useState } from 'react';
import { useRouter, useParams, usePathname } from 'next/navigation';
import Link from 'next/link';
import { hasApiKey, getAgentInfo, clearApiKey } from '@/lib/api';
import { wsClient } from '@/lib/ws';
import {
  Zap, CheckSquare, FolderOpen, MessageSquare, Users, GitMerge,
  BookOpen, LogOut, Menu, X, Wifi, WifiOff, Home
} from 'lucide-react';

const NAV = [
  { href: '', label: 'Overview', icon: Home },
  { href: '/tasks', label: 'Tasks', icon: CheckSquare },
  { href: '/files', label: 'Files', icon: FolderOpen },
  { href: '/messages', label: 'Messages', icon: MessageSquare },
  { href: '/agents', label: 'Agents', icon: Users },
  { href: '/decisions', label: 'Decisions', icon: BookOpen },
  { href: '/merges', label: 'Merges', icon: GitMerge },
];

export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const router = useRouter();
  const pathname = usePathname();
  const workspaceId = params.id as string;

  const [agent, setAgent] = useState<Record<string, unknown> | null>(null);
  const [wsConnected, setWsConnected] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    if (!hasApiKey(workspaceId)) {
      router.replace(`/join/${workspaceId}`);
      return;
    }
    const info = getAgentInfo(workspaceId);
    setAgent(info);

    wsClient.connect(workspaceId);
    const unsub = wsClient.subscribe(() => setWsConnected(wsClient.connected));
    const interval = setInterval(() => setWsConnected(wsClient.connected), 2000);

    return () => {
      unsub();
      clearInterval(interval);
    };
  }, [workspaceId]);

  function handleLeave() {
    if (!confirm('Leave this workspace?')) return;
    clearApiKey(workspaceId);
    localStorage.removeItem(`forge_agent_${workspaceId}`);
    wsClient.disconnect();
    router.push('/');
  }

  const base = `/workspace/${workspaceId}`;

  function isActive(href: string) {
    const full = base + href;
    if (href === '') return pathname === base;
    return pathname.startsWith(full);
  }

  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div className="p-4 border-b border-white/[0.08]">
        <Link href="/" className="flex items-center gap-2 mb-3">
          <div className="w-7 h-7 bg-violet-600 rounded-lg flex items-center justify-center">
            <Zap className="w-3.5 h-3.5 text-white" />
          </div>
          <span className="font-semibold text-white text-sm">Forge</span>
        </Link>
        {/* WS status */}
        <div className={`flex items-center gap-1.5 text-xs ${wsConnected ? 'text-green-400' : 'text-red-400/70'}`}>
          {wsConnected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {wsConnected ? 'Live' : 'Reconnecting...'}
        </div>
      </div>

      {/* Nav */}
      <nav className="p-3 flex-1">
        {NAV.map(({ href, label, icon: Icon }) => (
          <Link
            key={href}
            href={base + href}
            onClick={() => setMobileOpen(false)}
            className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-all mb-0.5 ${
              isActive(href)
                ? 'bg-violet-600/20 text-violet-300 border border-violet-500/20'
                : 'text-white/50 hover:text-white hover:bg-white/5'
            }`}
          >
            <Icon className="w-4 h-4 flex-shrink-0" />
            {label}
          </Link>
        ))}
      </nav>

      {/* Agent info */}
      <div className="p-3 border-t border-white/[0.08]">
        {agent && (
          <div className="px-3 py-2 mb-2">
            <div className="text-white/70 text-sm font-medium truncate">
              {String(agent.display_name || agent.id || 'Agent')}
            </div>
            <div className="text-white/30 text-xs truncate">
              {String(agent.role || '')}
            </div>
          </div>
        )}
        <button
          onClick={handleLeave}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-400/70 hover:text-red-400 hover:bg-red-500/10 transition-all w-full"
        >
          <LogOut className="w-4 h-4" />
          Leave workspace
        </button>
      </div>
    </>
  );

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-52 bg-black/30 border-r border-white/[0.08] flex-shrink-0">
        <SidebarContent />
      </aside>

      {/* Mobile Sidebar */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 md:hidden">
          <div className="absolute inset-0 bg-black/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute left-0 top-0 bottom-0 w-52 bg-[#0d0d14] border-r border-white/[0.08] flex flex-col">
            <SidebarContent />
          </aside>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Mobile top bar */}
        <div className="md:hidden flex items-center gap-3 px-4 py-3 border-b border-white/[0.08] bg-black/20">
          <button onClick={() => setMobileOpen(true)} className="text-white/60">
            <Menu className="w-5 h-5" />
          </button>
          <div className="w-5 h-5 bg-violet-600 rounded flex items-center justify-center">
            <Zap className="w-3 h-3 text-white" />
          </div>
          <span className="text-white font-medium text-sm">Forge</span>
        </div>

        {/* Page content */}
        <main className="flex-1 overflow-y-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
