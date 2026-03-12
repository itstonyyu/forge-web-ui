const BASE_URL = 'https://forge-server-production-059b.up.railway.app';

function getApiKey(workspaceId: string): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem(`forge_key_${workspaceId}`);
}

function getHeaders(workspaceId?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };
  if (workspaceId) {
    const key = getApiKey(workspaceId);
    if (key) headers['Authorization'] = `Bearer ${key}`;
  }
  return headers;
}

async function apiFetch(path: string, options: RequestInit = {}, workspaceId?: string) {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers: { ...getHeaders(workspaceId), ...(options.headers || {}) },
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(err || res.statusText);
  }
  const text = await res.text();
  return text ? JSON.parse(text) : null;
}

// Workspaces
export const listWorkspaces = () => apiFetch('/api/workspaces');
export const getWorkspace = (id: string) => apiFetch(`/api/workspaces/${id}`, {}, id);
export const createWorkspace = (name: string, description?: string) =>
  apiFetch('/api/workspaces', { method: 'POST', body: JSON.stringify({ name, description }) });

// Agents
export const joinWorkspace = (id: string, data: {
  id: string; display_name: string; role: string; owner: string; model?: string; capabilities?: string[];
}) => apiFetch(`/api/workspaces/${id}/join`, { method: 'POST', body: JSON.stringify(data) });
export const leaveWorkspace = (id: string) =>
  apiFetch(`/api/workspaces/${id}/leave`, { method: 'POST' }, id);
export const listAgents = (id: string) => apiFetch(`/api/workspaces/${id}/agents`, {}, id);

// Tasks
export const listTasks = (id: string, blocked?: boolean) =>
  apiFetch(`/api/workspaces/${id}/tasks${blocked !== undefined ? `?blocked=${blocked}` : ''}`, {}, id);
export const createTask = (id: string, data: {
  title: string; priority: string; description?: string; dependencies?: string[]; requires_plan_approval?: boolean;
}) => apiFetch(`/api/workspaces/${id}/tasks`, { method: 'POST', body: JSON.stringify(data) }, id);
export const updateTask = (id: string, taskId: string, data: { status: string; completion_summary?: string }) =>
  apiFetch(`/api/workspaces/${id}/tasks/${taskId}`, { method: 'PATCH', body: JSON.stringify(data) }, id);
export const submitPlan = (id: string, taskId: string, data: { plan: string; steps: string[] }) =>
  apiFetch(`/api/workspaces/${id}/tasks/${taskId}/plan`, { method: 'POST', body: JSON.stringify(data) }, id);
export const approveTask = (id: string, taskId: string, data: { approved: boolean; feedback?: string }) =>
  apiFetch(`/api/workspaces/${id}/tasks/${taskId}/approve`, { method: 'POST', body: JSON.stringify(data) }, id);
export const reviewTask = (id: string, taskId: string, data: { approved: boolean; feedback?: string }) =>
  apiFetch(`/api/workspaces/${id}/tasks/${taskId}/review`, { method: 'POST', body: JSON.stringify(data) }, id);

// Files
export const listFileTree = (id: string) => apiFetch(`/api/workspaces/${id}/tree`, {}, id);
export const readFile = (id: string, path: string) =>
  apiFetch(`/api/workspaces/${id}/files/${encodeURIComponent(path)}`, {}, id);
export const writeFile = (id: string, path: string, content: string) =>
  apiFetch(`/api/workspaces/${id}/files/${encodeURIComponent(path)}`, {
    method: 'PUT', body: JSON.stringify({ content }),
  }, id);

// Messages
export const sendMessage = (id: string, data: { to: string; content: string; type?: string }) =>
  apiFetch(`/api/workspaces/${id}/messages`, { method: 'POST', body: JSON.stringify(data) }, id);
export const getMessages = (id: string, params?: { unread?: boolean; since?: string }) => {
  const q = new URLSearchParams();
  if (params?.unread) q.set('unread', 'true');
  if (params?.since) q.set('since', params.since);
  const qs = q.toString();
  return apiFetch(`/api/workspaces/${id}/messages${qs ? `?${qs}` : ''}`, {}, id);
};
export const markRead = (id: string, msgId: string) =>
  apiFetch(`/api/workspaces/${id}/messages/${msgId}`, { method: 'PATCH', body: JSON.stringify({ read: true }) }, id);

// Decisions
export const listDecisions = (id: string) => apiFetch(`/api/workspaces/${id}/decisions`, {}, id);
export const recordDecision = (id: string, data: { title: string; decision: string; rationale: string }) =>
  apiFetch(`/api/workspaces/${id}/decisions`, { method: 'POST', body: JSON.stringify(data) }, id);

// Status
export const getStatuses = (id: string) => apiFetch(`/api/workspaces/${id}/status`, {}, id);
export const postHeartbeat = (id: string, state: string, message?: string) =>
  apiFetch(`/api/workspaces/${id}/status`, { method: 'POST', body: JSON.stringify({ state, message }) }, id);

// Merges
export const listMerges = (id: string) => apiFetch(`/api/workspaces/${id}/merges`, {}, id);
export const requestMerge = (id: string, data: { source: string; summary: string }) =>
  apiFetch(`/api/workspaces/${id}/merge`, { method: 'POST', body: JSON.stringify(data) }, id);
export const voteMerge = (id: string, mergeId: string, data: { status: 'approved' | 'rejected'; feedback?: string }) =>
  apiFetch(`/api/workspaces/${id}/merges/${mergeId}`, { method: 'PATCH', body: JSON.stringify(data) }, id);

// WebSocket
export function createWebSocket(workspaceId: string): WebSocket {
  const proto = window.location.protocol === 'https:' ? 'wss' : 'wss';
  return new WebSocket(`${proto}://forge-server-production-059b.up.railway.app/ws?workspace=${workspaceId}`);
}

// Events
export const listEvents = (id: string, limit = 50) =>
  apiFetch(`/api/workspaces/${id}/events?limit=${limit}`, {}, id);

// Settings
export const updateSettings = (id: string, settings: Record<string, unknown>) =>
  apiFetch(`/api/workspaces/${id}/settings`, { method: 'PATCH', body: JSON.stringify(settings) }, id);

// Agent scorecard
export const getAgentScorecard = (wsId: string, agentId: string) =>
  apiFetch(`/api/workspaces/${wsId}/agents/${agentId}/scorecard`, {}, wsId);

// Invites
export const createInvite = (wsId: string, data: { role?: string; max_uses?: number; expires_hours?: number }) =>
  apiFetch(`/api/workspaces/${wsId}/invite`, { method: 'POST', body: JSON.stringify(data) }, wsId);
export const getInvite = (token: string) =>
  apiFetch(`/api/invite/${token}`);
export const acceptInvite = (token: string, data: { id: string; display_name: string; owner?: string; model?: string; capabilities?: string[] }) =>
  apiFetch(`/api/invite/${token}/accept`, { method: 'POST', body: JSON.stringify(data) });

// Capability cards
export const getCapabilityCard = (wsId: string, agentId: string) =>
  apiFetch(`/api/workspaces/${wsId}/agents/${agentId}/capability-card`, {}, wsId);
export const listCapabilityCards = (wsId: string, capability?: string) => {
  const q = capability ? `?capability=${encodeURIComponent(capability)}` : '';
  return apiFetch(`/api/workspaces/${wsId}/capability-cards${q}`, {}, wsId);
};
export const searchCapabilities = (wsId: string, query: string) =>
  apiFetch(`/api/workspaces/${wsId}/capabilities/search?q=${encodeURIComponent(query)}`, {}, wsId);

// Task claim
export const claimTask = (wsId: string, taskId: string) =>
  apiFetch(`/api/workspaces/${wsId}/tasks/${taskId}/claim`, { method: 'POST' }, wsId);

// Auth helpers
export function saveApiKey(workspaceId: string, apiKey: string) {
  localStorage.setItem(`forge_key_${workspaceId}`, apiKey);
}
export function hasApiKey(workspaceId: string): boolean {
  return !!localStorage.getItem(`forge_key_${workspaceId}`);
}
export function clearApiKey(workspaceId: string) {
  localStorage.removeItem(`forge_key_${workspaceId}`);
}
export function saveAgentInfo(workspaceId: string, agent: Record<string, unknown>) {
  localStorage.setItem(`forge_agent_${workspaceId}`, JSON.stringify(agent));
}
export function getAgentInfo(workspaceId: string): Record<string, unknown> | null {
  const raw = localStorage.getItem(`forge_agent_${workspaceId}`);
  return raw ? JSON.parse(raw) : null;
}
