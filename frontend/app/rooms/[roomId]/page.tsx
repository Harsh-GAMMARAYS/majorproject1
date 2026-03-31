'use client';

import { useParams } from 'next/navigation';
import RoomWorkspace from '@/components/RoomWorkspace';

export default function RoomDetailPage() {
  const params = useParams<{ roomId: string }>();
  const roomId = Array.isArray(params.roomId) ? params.roomId[0] : params.roomId;

  if (!roomId) {
    return null;
  }

  return (
    <>
      <main className="h-[calc(100vh-4rem)] w-full overflow-hidden bg-[linear-gradient(180deg,#090909_0%,#050505_100%)]">
        <RoomWorkspace roomId={roomId} />
      </main>
    </>
  );
}
