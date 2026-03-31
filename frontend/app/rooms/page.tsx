'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import {
  createRoom,
  joinRoom,
  listReceivedRoomInvites,
  listRooms,
  respondRoomInvite,
} from '@/lib/api';
import { useAuth } from '@/components/AuthProvider';
import type { Room, RoomInvite } from '@/types/api';

export default function RoomsPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [rooms, setRooms] = useState<Room[]>([]);
  const [invites, setInvites] = useState<RoomInvite[]>([]);
  const [roomName, setRoomName] = useState('');
  const [roomPassword, setRoomPassword] = useState('');
  const [maxMembers, setMaxMembers] = useState(5);
  const [joinPasswords, setJoinPasswords] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!authLoading && !user) {
      router.replace('/login');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const loadRoomsAndInvites = async () => {
      try {
        const [roomsResponse, invitesResponse] = await Promise.all([
          listRooms(),
          listReceivedRoomInvites(),
        ]);
        setRooms(roomsResponse.rooms);
        setInvites(invitesResponse.invites);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load rooms');
      } finally {
        setLoading(false);
      }
    };

    void loadRoomsAndInvites();
  }, [user]);

  const refreshRoomsAndInvites = async () => {
    const [roomsResponse, invitesResponse] = await Promise.all([
      listRooms(),
      listReceivedRoomInvites(),
    ]);
    setRooms(roomsResponse.rooms);
    setInvites(invitesResponse.invites);
  };

  const handleCreateRoom = async () => {
    if (!roomName.trim()) {
      setError('Enter a room name.');
      return;
    }

    try {
      setWorking(true);
      const room = await createRoom(
        roomName.trim(),
        maxMembers,
        roomPassword,
      );
      setRoomName('');
      setRoomPassword('');
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create room');
    } finally {
      setWorking(false);
    }
  };

  const handleJoinRoom = async (room: Room) => {
    try {
      setWorking(true);
      await joinRoom(room.id, joinPasswords[room.id]?.trim() || undefined);
      router.push(`/rooms/${room.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setWorking(false);
    }
  };

  const handleRespondInvite = async (inviteId: string, accept: boolean, roomId?: string) => {
    try {
      setWorking(true);
      await respondRoomInvite(inviteId, accept);
      await refreshRoomsAndInvites();
      if (accept && roomId) {
        router.push(`/rooms/${roomId}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to respond to invite');
    } finally {
      setWorking(false);
    }
  };

  if (authLoading || !user) {
    return (
      <main className="min-h-[calc(100vh-4rem)] bg-[linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
        <div className="mx-auto flex min-h-[calc(100vh-4rem)] max-w-7xl items-center justify-center px-4">
          <LoadingSpinner />
        </div>
      </main>
    );
  }

  return (
    <>
      <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,rgba(16,185,129,0.12),transparent_30%),linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
          <section className="rounded-4xl border border-gray-800 bg-[#101010] p-6">
            <p className="text-xs uppercase tracking-[0.35em] text-emerald-400">Collaborative Study</p>
            <h1 className="mt-3 text-4xl font-semibold text-white">Study Rooms</h1>
            <p className="mt-3 max-w-3xl text-sm text-gray-400">
              Create persistent rooms for shared context, room-level model interactions, live artifacts, and collaborative knowledge graph exploration.
            </p>
          </section>

          {error && <div className="mt-6"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

          <div className="mt-6 grid gap-6 lg:grid-cols-[420px_1fr]">
            <section className="rounded-[28px] border border-gray-800 bg-[#111111] p-6">
              <h2 className="text-lg font-semibold text-white">Create A Room</h2>
              <p className="mt-2 text-sm text-gray-500">
                Signed in as {user.display_name ?? user.name}
              </p>
              <div className="mt-5 space-y-4">
                <input
                  value={roomName}
                  onChange={(event) => setRoomName(event.target.value)}
                  placeholder="Room name"
                  className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
                <label className="block text-sm text-gray-400">
                  Max members
                  <input
                    type="number"
                    min="2"
                    max="5"
                    value={maxMembers}
                    onChange={(event) => setMaxMembers(Number.parseInt(event.target.value, 10) || 5)}
                    className="mt-2 w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                  />
                </label>
                <input
                  type="password"
                  value={roomPassword}
                  onChange={(event) => setRoomPassword(event.target.value)}
                  placeholder="Room password"
                  className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-white outline-none focus:border-emerald-500"
                />
                <button
                  onClick={handleCreateRoom}
                  disabled={working}
                  className="w-full rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                >
                  Create Room
                </button>
              </div>
            </section>

            <section className="rounded-[28px] border border-gray-800 bg-[#111111] p-6">
              <div className="space-y-6">
                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Your Invites</h2>
                  </div>
                  <div className="grid gap-3">
                    {invites.filter((invite) => invite.status === 'pending').map((invite) => (
                      <article key={invite.id} className="rounded-[20px] border border-gray-800 bg-black/20 p-4">
                        <p className="text-sm font-medium text-white">{invite.room_name ?? 'Room'}</p>
                        <p className="mt-1 text-xs text-gray-400">
                          Invited by {invite.inviter_name}
                        </p>
                        <div className="mt-3 flex gap-2">
                          <button
                            onClick={() => handleRespondInvite(invite.id, true, invite.room_id)}
                            disabled={working}
                            className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                          >
                            Accept
                          </button>
                          <button
                            onClick={() => handleRespondInvite(invite.id, false)}
                            disabled={working}
                            className="rounded-xl border border-gray-700 px-3 py-2 text-xs font-medium text-gray-200 hover:border-gray-500 disabled:opacity-60"
                          >
                            Decline
                          </button>
                        </div>
                      </article>
                    ))}

                    {!loading && invites.filter((invite) => invite.status === 'pending').length === 0 && (
                      <div className="rounded-[20px] border border-dashed border-gray-700 bg-black/20 p-4 text-center text-xs text-gray-500">
                        No pending invites.
                      </div>
                    )}
                  </div>
                </div>

                <div>
                  <div className="mb-3 flex items-center justify-between">
                    <h2 className="text-lg font-semibold text-white">Available Rooms</h2>
                    {loading && <LoadingSpinner size="sm" />}
                  </div>

                  <div className="grid gap-4">
                    {rooms.map((room) => (
                      (() => {
                        const isOwner = room.owner_user_id === user.id;
                        return (
                      <article key={room.id} className="rounded-3xl border border-gray-800 bg-black/20 p-5">
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <h3 className="text-xl font-semibold text-white">{room.name}</h3>
                            <p className="mt-1 text-sm text-gray-400">Owner: {isOwner ? 'YOU' : room.owner_name}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">
                              {room.member_count}/{room.max_members} members
                            </p>
                            {room.has_password && !isOwner && (
                              <p className="mt-1 text-xs text-amber-300">Password protected</p>
                            )}
                            {isOwner && (
                              <p className="mt-1 text-xs text-emerald-300">Your room</p>
                            )}
                          </div>
                          <button
                            onClick={() => handleJoinRoom(room)}
                            disabled={working}
                            className="rounded-2xl border border-emerald-600 px-4 py-2 text-sm font-medium text-emerald-300 hover:bg-emerald-950/30 disabled:opacity-50"
                          >
                            {isOwner ? 'Open' : 'Join'}
                          </button>
                        </div>

                        {room.has_password && !isOwner && (
                          <input
                            type="password"
                            value={joinPasswords[room.id] ?? ''}
                            onChange={(event) => setJoinPasswords((prev) => ({ ...prev, [room.id]: event.target.value }))}
                            placeholder="Enter room password"
                            className="mt-3 w-full rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                          />
                        )}
                      </article>
                        );
                      })()
                    ))}

                    {!loading && rooms.length === 0 && (
                      <div className="rounded-3xl border border-dashed border-gray-700 bg-black/20 p-8 text-center text-sm text-gray-500">
                        No rooms yet. Create the first one.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </main>
    </>
  );
}
