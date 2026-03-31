'use client';

import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/components/AuthProvider';
import ErrorAlert from '@/components/ErrorAlert';
import LoadingSpinner from '@/components/LoadingSpinner';
import {
  deleteAdminRoom,
  deleteAdminUser,
  listAdminRooms,
  listAdminUsers,
  updateAdminRoom,
  updateAdminUser,
} from '@/lib/api';
import type { AdminRoomSummary, AdminUserSummary } from '@/types/api';

function formatTimestamp(value?: string): string {
  if (!value) {
    return 'Never';
  }

  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) {
    return 'Never';
  }

  return timestamp.toLocaleString();
}

export default function AdminPage() {
  const { user, logout } = useAuth();
  const [users, setUsers] = useState<AdminUserSummary[]>([]);
  const [rooms, setRooms] = useState<AdminRoomSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [workingKey, setWorkingKey] = useState<string | null>(null);

  const [userDrafts, setUserDrafts] = useState<Record<string, { display_name: string; email: string; is_active: boolean }>>({});
  const [roomDrafts, setRoomDrafts] = useState<Record<string, { name: string; max_members: number }>>({});

  const loadAdminData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [usersResponse, roomsResponse] = await Promise.all([
        listAdminUsers(),
        listAdminRooms(),
      ]);
      setUsers(usersResponse.users);
      setRooms(roomsResponse.rooms);
      setUserDrafts(
        Object.fromEntries(
          usersResponse.users.map((member) => [
            member.id,
            {
              display_name: member.display_name ?? member.name ?? '',
              email: member.email ?? '',
              is_active: member.is_active ?? true,
            },
          ]),
        ),
      );
      setRoomDrafts(
        Object.fromEntries(
          roomsResponse.rooms.map((room) => [
            room.id,
            { name: room.name, max_members: room.max_members },
          ]),
        ),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load admin data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAdminData();
  }, []);

  const saveUser = async (userId: string) => {
    try {
      setWorkingKey(`user:${userId}`);
      await updateAdminUser(userId, userDrafts[userId]);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update user');
    } finally {
      setWorkingKey(null);
    }
  };

  const removeUser = async (userId: string) => {
    try {
      setWorkingKey(`delete-user:${userId}`);
      await deleteAdminUser(userId);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setWorkingKey(null);
    }
  };

  const saveRoom = async (roomId: string) => {
    try {
      setWorkingKey(`room:${roomId}`);
      await updateAdminRoom(roomId, roomDrafts[roomId]);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update room');
    } finally {
      setWorkingKey(null);
    }
  };

  const removeRoom = async (roomId: string) => {
    try {
      setWorkingKey(`delete-room:${roomId}`);
      await deleteAdminRoom(roomId);
      await loadAdminData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
    } finally {
      setWorkingKey(null);
    }
  };

  const activeUserCount = useMemo(
    () => users.filter((member) => member.is_online).length,
    [users],
  );

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
        <LoadingSpinner />
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.1),_transparent_20%),linear-gradient(180deg,#0d0d0d_0%,#060606_100%)] px-5 py-6 sm:px-6 lg:px-8 xl:px-10">
      <div className="space-y-6">
        <header className="flex flex-col gap-4 border-b border-white/10 pb-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl border border-emerald-400/30 bg-gradient-to-br from-emerald-400/12 to-cyan-400/8 text-sm font-semibold uppercase tracking-[0.24em] text-emerald-300">
              KB
            </div>
            <div>
              <h1 className="text-2xl font-semibold tracking-tight text-white">Admin</h1>
              <p className="text-sm text-gray-400">User, room, and activity management.</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-sm text-gray-300">
              {user?.display_name ?? user?.name ?? 'Admin'}
            </span>
            <button
              onClick={() => void logout()}
              className="rounded-full border border-white/10 px-3 py-1.5 text-sm text-gray-400 transition-colors hover:border-white/20 hover:text-white"
            >
              Log out
            </button>
          </div>
        </header>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        <section className="grid gap-4 md:grid-cols-4">
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Active Now</p>
            <p className="mt-2 text-3xl font-semibold text-white">{activeUserCount}</p>
            <p className="mt-1 text-sm text-gray-500">users active in the last 5 minutes</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Registered Users</p>
            <p className="mt-2 text-3xl font-semibold text-white">{users.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Rooms</p>
            <p className="mt-2 text-3xl font-semibold text-white">{rooms.length}</p>
          </div>
          <div className="rounded-2xl border border-gray-800 bg-black/20 px-4 py-4">
            <p className="text-xs uppercase tracking-[0.22em] text-gray-500">Live Rooms</p>
            <p className="mt-2 text-3xl font-semibold text-white">
              {rooms.filter((room) => room.member_count > 0).length}
            </p>
            <p className="mt-1 text-sm text-gray-500">rooms with active membership</p>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-gray-800 bg-[#111111]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Users</h2>
              <p className="mt-1 text-sm text-gray-500">Account control, activity, and usage.</p>
            </div>
            <div className="text-sm text-gray-500">{users.length} total</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">User</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Email</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Account</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Presence</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Last active</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Usage</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((member) => {
                  const draft = userDrafts[member.id];
                  const isAdminAccount = Boolean(member.is_admin);

                  return (
                    <tr key={member.id} className="border-b border-white/6 align-top last:border-b-0">
                      <td className="px-5 py-4">
                        <input
                          type="text"
                          value={draft?.display_name ?? ''}
                          disabled={isAdminAccount}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], display_name: event.target.value },
                            }))
                          }
                          className="w-full min-w-[180px] rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <input
                          type="email"
                          value={draft?.email ?? ''}
                          disabled={isAdminAccount}
                          onChange={(event) =>
                            setUserDrafts((current) => ({
                              ...current,
                              [member.id]: { ...current[member.id], email: event.target.value },
                            }))
                          }
                          className="w-full min-w-[220px] rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-sm text-white disabled:cursor-not-allowed disabled:opacity-60"
                        />
                      </td>
                      <td className="px-5 py-4">
                        <label className="inline-flex items-center gap-2 text-sm text-gray-300">
                          <input
                            type="checkbox"
                            checked={draft?.is_active ?? true}
                            disabled={isAdminAccount}
                            onChange={(event) =>
                              setUserDrafts((current) => ({
                                ...current,
                                [member.id]: { ...current[member.id], is_active: event.target.checked },
                              }))
                            }
                            className="rounded border-gray-600 bg-black/20 text-emerald-500"
                          />
                          <span>{draft?.is_active ? 'Active' : 'Disabled'}</span>
                        </label>
                      </td>
                      <td className="px-5 py-4">
                        <span
                          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${
                            member.is_online
                              ? 'bg-emerald-500/12 text-emerald-300 ring-1 ring-emerald-400/25'
                              : 'bg-white/[0.04] text-gray-300 ring-1 ring-white/10'
                          }`}
                        >
                          {member.is_online ? 'Online' : 'Offline'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-400">
                        {formatTimestamp(member.last_seen_at)}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-300">
                        <div>{member.uploaded_file_count} uploads</div>
                        <div>{member.created_room_count} rooms</div>
                        <div>{member.context_file_count} context files</div>
                        <div>{member.message_count} msgs / {member.artifact_count} arts</div>
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex min-w-[180px] flex-col gap-2">
                          <button
                            onClick={() => void saveUser(member.id)}
                            disabled={isAdminAccount || workingKey === `user:${member.id}`}
                            className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {workingKey === `user:${member.id}` ? 'Saving...' : 'Save'}
                          </button>
                          {!isAdminAccount ? (
                            <button
                              onClick={() => void removeUser(member.id)}
                              disabled={workingKey === `delete-user:${member.id}`}
                              className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {workingKey === `delete-user:${member.id}` ? 'Deleting...' : 'Delete'}
                            </button>
                          ) : (
                            <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-sm text-gray-500">
                              Primary admin account
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>

        <section className="overflow-hidden rounded-[28px] border border-gray-800 bg-[#111111]">
          <div className="flex items-center justify-between border-b border-white/10 px-5 py-4">
            <div>
              <h2 className="text-xl font-semibold text-white">Rooms</h2>
              <p className="mt-1 text-sm text-gray-500">Rename, resize, and remove rooms.</p>
            </div>
            <div className="text-sm text-gray-500">{rooms.length} total</div>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full border-collapse">
              <thead>
                <tr className="border-b border-white/10 bg-white/[0.02] text-left">
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Room</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Owner</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Capacity</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Context files</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Messages / Artifacts</th>
                  <th className="px-5 py-3 text-xs font-medium uppercase tracking-[0.18em] text-gray-500">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rooms.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-5 py-6 text-sm text-gray-500">
                      No rooms created yet.
                    </td>
                  </tr>
                ) : (
                  rooms.map((room) => {
                    const draft = roomDrafts[room.id];
                    return (
                      <tr key={room.id} className="border-b border-white/6 align-top last:border-b-0">
                        <td className="px-5 py-4">
                          <div className="flex min-w-[220px] gap-3">
                            <input
                              type="text"
                              value={draft?.name ?? ''}
                              onChange={(event) =>
                                setRoomDrafts((current) => ({
                                  ...current,
                                  [room.id]: { ...current[room.id], name: event.target.value },
                                }))
                              }
                              className="w-full rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-sm text-white"
                            />
                            <input
                              type="number"
                              min="2"
                              max="5"
                              value={draft?.max_members ?? room.max_members}
                              onChange={(event) =>
                                setRoomDrafts((current) => ({
                                  ...current,
                                  [room.id]: {
                                    ...current[room.id],
                                    max_members: Number.parseInt(event.target.value, 10) || room.max_members,
                                  },
                                }))
                              }
                              className="w-20 rounded-lg border border-gray-700 bg-black/20 px-3 py-2 text-sm text-white"
                            />
                          </div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">
                          <div>{room.owner_name}</div>
                          <div className="text-gray-500">{room.owner_email || 'No email'}</div>
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">
                          {room.member_count} / {room.max_members}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">
                          {room.context_file_count}
                        </td>
                        <td className="px-5 py-4 text-sm text-gray-300">
                          {room.message_count} / {room.artifact_count}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex min-w-[160px] flex-col gap-2">
                            <button
                              onClick={() => void saveRoom(room.id)}
                              disabled={workingKey === `room:${room.id}`}
                              className="rounded-lg bg-emerald-500 px-3 py-2 text-sm font-semibold text-black disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {workingKey === `room:${room.id}` ? 'Saving...' : 'Save'}
                            </button>
                            <button
                              onClick={() => void removeRoom(room.id)}
                              disabled={workingKey === `delete-room:${room.id}`}
                              className="rounded-lg border border-red-900 bg-red-950/40 px-3 py-2 text-sm font-medium text-red-200 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              {workingKey === `delete-room:${room.id}` ? 'Deleting...' : 'Delete'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </main>
  );
}
