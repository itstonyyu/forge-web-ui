'use client';

import { Shield, CheckCircle, XOctagon, ArrowRight } from 'lucide-react';

export interface CapabilityCardData {
  can_do?: string[];
  inputs_accepted?: string[];
  inputs_rejected?: string[];
  outputs_returned?: Array<{ name: string; type: string }> | string[];
  policy?: string[];
}

export default function CapabilityCard({ data }: { data: CapabilityCardData | null }) {
  if (!data) return null;

  const hasContent =
    (data.can_do && data.can_do.length > 0) ||
    (data.inputs_accepted && data.inputs_accepted.length > 0) ||
    (data.inputs_rejected && data.inputs_rejected.length > 0) ||
    (data.outputs_returned && data.outputs_returned.length > 0) ||
    (data.policy && data.policy.length > 0);

  if (!hasContent) return null;

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-medium text-white/60 uppercase tracking-wide">Capability Card</h3>
      <div className="card p-4 space-y-4">
        {/* can_do badges */}
        {data.can_do && data.can_do.length > 0 && (
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-2">Can Do</p>
            <div className="flex flex-wrap gap-1.5">
              {data.can_do.map((item) => (
                <span
                  key={item}
                  className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium text-violet-300 bg-violet-500/15 border border-violet-500/25"
                >
                  {item}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* inputs_accepted */}
        {data.inputs_accepted && data.inputs_accepted.length > 0 && (
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1.5">Accepts</p>
            <div className="space-y-1">
              {data.inputs_accepted.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-green-400/80">
                  <CheckCircle className="w-3.5 h-3.5 text-green-400/60 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* inputs_rejected */}
        {data.inputs_rejected && data.inputs_rejected.length > 0 && (
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1.5">Rejects</p>
            <div className="space-y-1">
              {data.inputs_rejected.map((item) => (
                <div key={item} className="flex items-center gap-2 text-sm text-red-400/80">
                  <XOctagon className="w-3.5 h-3.5 text-red-400/60 flex-shrink-0" />
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* outputs_returned */}
        {data.outputs_returned && data.outputs_returned.length > 0 && (
          <div>
            <p className="text-white/40 text-xs uppercase tracking-wide mb-1.5">Returns</p>
            <div className="space-y-1">
              {data.outputs_returned.map((item, i) => {
                const name = typeof item === 'string' ? item : item.name;
                const type = typeof item === 'string' ? null : item.type;
                return (
                  <div key={i} className="flex items-center gap-2 text-sm text-white/60">
                    <ArrowRight className="w-3.5 h-3.5 text-white/25 flex-shrink-0" />
                    <span>{name}</span>
                    {type && (
                      <code className="text-xs font-mono text-white/30 bg-white/5 px-1.5 py-0.5 rounded">
                        {type}
                      </code>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* policy */}
        {data.policy && data.policy.length > 0 && (
          <div className="pt-2 border-t border-white/[0.06]">
            <div className="flex items-center gap-1.5 text-white/25 text-xs">
              <Shield className="w-3 h-3" />
              <span>Policy:</span>
              <span>{data.policy.join(' · ')}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
