import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatTime(iso: string): string {
  return new Date(iso).toLocaleString();
}

export function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export const STATUS_COLORS: Record<string, string> = {
  unclaimed: 'text-gray-400 bg-gray-400/10 border-gray-400/20',
  claimed: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  in_progress: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  done: 'text-green-400 bg-green-400/10 border-green-400/20',
  blocked: 'text-red-400 bg-red-400/10 border-red-400/20',
  approved: 'text-green-400 bg-green-400/10 border-green-400/20',
  rejected: 'text-red-400 bg-red-400/10 border-red-400/20',
  pending: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  online: 'text-green-400',
  offline: 'text-gray-500',
};

export const ROLES = ['worker', 'lead', 'reviewer', 'observer'];
export const CAPABILITIES = ['coding', 'research', 'writing', 'design', 'testing', 'architecture', 'planning', 'review'];
export const PRIORITIES = ['low', 'medium', 'high', 'critical'];
