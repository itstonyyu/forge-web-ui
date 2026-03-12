'use client';

import { useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';

export default function WorkspaceIndex() {
  const params = useParams();
  const router = useRouter();
  const workspaceId = params.id as string;

  useEffect(() => {
    router.replace(`/workspace/${workspaceId}/command`);
  }, [workspaceId, router]);

  return (
    <div className="flex items-center justify-center h-full">
      <div className="text-white/30 text-sm">Redirecting...</div>
    </div>
  );
}
