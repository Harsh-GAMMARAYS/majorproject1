'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import RoomArtifactViewer from '@/components/RoomArtifactViewer';
import CollaborativeCanvas, { type CanvasCursor, type CanvasStroke } from '@/components/CollaborativeCanvas';
import { useAuth } from '@/components/AuthProvider';
import {
  addRoomContextFiles,
  getRoom,
  getAccessToken,
  getRoomCanvasSnapshot,
  getRoomWebSocketUrl,
  inviteToRoom,
  joinRoom,
  kickRoomMember,
  listRoomArtifacts,
  listRoomMessages,
  postRoomMessage,
  removeRoomContextFile,
  deleteRoom,
  roomDeepQuery,
  roomFAQ,
  roomFlashcards,
  roomOutline,
  roomQuery,
  roomQuiz,
  roomSummarize,
  saveRoomCanvasSnapshot,
  updateRoom,
} from '@/lib/api';
import type {
  Room,
  RoomArtifact,
  RoomEventEnvelope,
  RoomMessage,
  RoomPresence,
  RoomPresenceMemberState,
  RoomSnapshotEvent,
} from '@/types/api';

interface RoomWorkspaceProps {
  roomId: string;
}

type SidebarPanel = 'chat' | 'files' | 'members' | 'artifacts' | 'settings';
type CallMode = 'video' | 'audio' | 'screen';

export default function RoomWorkspace({ roomId }: RoomWorkspaceProps) {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();
  const [room, setRoom] = useState<Room | null>(null);
  const [messages, setMessages] = useState<RoomMessage[]>([]);
  const [artifacts, setArtifacts] = useState<RoomArtifact[]>([]);
  const [selectedArtifactId, setSelectedArtifactId] = useState<string | null>(null);
  const [presence, setPresence] = useState<RoomPresence | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composerText, setComposerText] = useState('');
  const [sidebarChatText, setSidebarChatText] = useState('');
  const [activeTool, setActiveTool] = useState<'query' | 'deepquery' | 'summarize' | 'faq' | 'flashcards' | 'outline' | 'quiz'>('query');
  const [showSourcePicker, setShowSourcePicker] = useState(false);
  const [topK, setTopK] = useState(5);
  const [createGraph, setCreateGraph] = useState(true);
  const [contextSelection, setContextSelection] = useState<string[]>([]);
  const [actionFiles, setActionFiles] = useState<string[]>([]);
  const [quizType, setQuizType] = useState<'mcq' | 'short'>('mcq');
  const [quizCount, setQuizCount] = useState(10);
  const [combineOutline, setCombineOutline] = useState(false);
  const [ownerRoomName, setOwnerRoomName] = useState('');
  const [ownerMaxMembers, setOwnerMaxMembers] = useState(5);
  const [ownerPassword, setOwnerPassword] = useState('');
  const [inviteUsername, setInviteUsername] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [highlightedFeedMessageId, setHighlightedFeedMessageId] = useState<string | null>(null);
  const [rightPanel, setRightPanel] = useState<SidebarPanel>('chat');
  const [lastExpandedRightPanel, setLastExpandedRightPanel] = useState<SidebarPanel>('chat');
  const [sidebarTransitioning, setSidebarTransitioning] = useState(false);
  const [sidebarIndicatorStyle, setSidebarIndicatorStyle] = useState({
    left: 0,
    width: 0,
    opacity: 0,
  });
  const [connectionState, setConnectionState] = useState<'offline' | 'connecting' | 'connected' | 'reconnecting'>('offline');
  const [localPresenceState, setLocalPresenceState] = useState<RoomPresenceMemberState>({
    in_call: false,
    screen_sharing: false,
    video_enabled: true,
    audio_enabled: true,
  });
  const [canvasStrokes, setCanvasStrokes] = useState<CanvasStroke[]>([]);
  const [remoteCanvasCursors, setRemoteCanvasCursors] = useState<Record<string, CanvasCursor>>({});
  const [canvasSyncState, setCanvasSyncState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [recentRealtimeEvents, setRecentRealtimeEvents] = useState<string[]>([]);
  const [remoteCallCount, setRemoteCallCount] = useState(0);
  const [activeCallMode, setActiveCallMode] = useState<CallMode | null>(null);
  const [meetingSetupOpen, setMeetingSetupOpen] = useState(false);
  const [meetingSetup, setMeetingSetup] = useState({
    cameraOn: true,
    micOn: true,
    screenShare: false,
  });
  const [meetingViewMode, setMeetingViewMode] = useState<'hidden' | 'fullscreen' | 'small' | 'minimized'>('hidden');
  const [meetingLayout, setMeetingLayout] = useState<'focus' | 'grid'>('focus');
  const [pinnedParticipantId, setPinnedParticipantId] = useState<string | null>(null);
  const [vcPanelPosition, setVcPanelPosition] = useState({ x: 24, y: 96 });
  const [vcPanelDragging, setVcPanelDragging] = useState(false);
  const [localStreamVersion, setLocalStreamVersion] = useState(0);
  const [canvasModalOpen, setCanvasModalOpen] = useState(false);
  const socketRef = useRef<WebSocket | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLTextAreaElement | null>(null);
  const sidebarTabsRef = useRef<HTMLDivElement | null>(null);
  const preservedExpandedPanelRef = useRef<SidebarPanel>('chat');
  const sidebarTabItemRefs = useRef<Record<SidebarPanel, HTMLButtonElement | null>>({
    chat: null,
    files: null,
    members: null,
    artifacts: null,
    settings: null,
  });
  const feedMessageRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const reconnectTimerRef = useRef<number | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const intentionalCloseRef = useRef(false);
  const localPresenceStateRef = useRef<RoomPresenceMemberState>(localPresenceState);
  const canvasAutosaveTimerRef = useRef<number | null>(null);
  const hasLoadedCanvasSnapshotRef = useRef(false);
  const peerConnectionsRef = useRef<Map<string, RTCPeerConnection>>(new Map());
  const localStreamRef = useRef<MediaStream | null>(null);
  const canvasDirtyRef = useRef(false);
  const canvasSignatureRef = useRef('[]');
  const lastSavedCanvasSignatureRef = useRef('[]');
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const dragOffsetRef = useRef({ x: 0, y: 0 });

  const visibleArtifacts = artifacts.filter((artifact) => artifact.artifact_type !== 'canvas_snapshot');
  const selectedArtifact = visibleArtifacts.find((artifact) => artifact.id === selectedArtifactId) ?? visibleArtifacts[0] ?? null;
  const isMember = !!user && !!room?.members?.some((member) => member.id === user.id);
  const isOwner = !!user && !!room && room.owner_user_id === user.id;
  const actionTools: Array<{ id: 'query' | 'deepquery' | 'summarize' | 'faq' | 'flashcards' | 'outline' | 'quiz'; label: string }> = [
    { id: 'query', label: 'Ask' },
    { id: 'deepquery', label: 'Research' },
    { id: 'summarize', label: 'Summarize' },
    { id: 'faq', label: 'FAQ' },
    { id: 'flashcards', label: 'Flashcards' },
    { id: 'outline', label: 'Outline' },
    { id: 'quiz', label: 'Quiz' },
  ];
  const activeToolLabel = actionTools.find((tool) => tool.id === activeTool)?.label ?? 'Ask';
  const defaultCostTopK = 3;
  const composerPlaceholder =
    activeTool === 'query' || activeTool === 'deepquery'
      ? 'Ask the AI assistant about your shared materials...'
      : `Optional note for the room before running ${activeToolLabel}...`;
  const submitLabel =
    activeTool === 'query'
      ? 'Ask'
      : activeTool === 'deepquery'
        ? 'Run Research Mode'
        : `Generate ${activeToolLabel}`;
  const feedMessages = messages.filter((message) => ['question', 'answer', 'system'].includes(message.message_type));
  const sidebarChatMessages = messages.filter((message) => message.message_type === 'chat' || message.message_type === 'question');
  const sourceFilenames = actionFiles.length > 0
    ? actionFiles
    : (room?.context_files ?? []).map((file) => file.filename);
  const onlineUserIds = new Set(presence?.active_user_ids ?? []);
  const presenceUserStates = presence?.active_user_states ?? {};
  const currentUserName = (user?.display_name ?? user?.name ?? '').trim().toUpperCase();
  const sidebarTabs: Array<{ id: SidebarPanel; label: string }> = [
    { id: 'chat', label: 'Live Chat' },
    { id: 'files', label: 'Files' },
    { id: 'members', label: 'Members' },
    { id: 'artifacts', label: 'Artifacts' },
    ...(isOwner ? [{ id: 'settings' as SidebarPanel, label: 'Settings' }] : []),
  ];
  const sidebarTabIds = sidebarTabs.map((tab) => tab.id);
  const hasLocalVideoPreview = Boolean(
    localStreamRef.current?.getVideoTracks().some((track) => track.readyState === 'live'),
  );
  const meetingParticipants = (room?.members ?? []).map((member) => ({
    id: member.id,
    name: member.name,
    isLocal: member.id === user?.id,
    isOnline: onlineUserIds.has(member.id),
    inCall: Boolean(presenceUserStates[member.id]?.in_call),
    screenSharing: Boolean(presenceUserStates[member.id]?.screen_sharing),
  }));
  const resolvedPinnedParticipantId = (
    pinnedParticipantId
    && meetingParticipants.some((member) => member.id === pinnedParticipantId)
  ) ? pinnedParticipantId : (user?.id ?? meetingParticipants[0]?.id ?? null);
  const pinnedParticipant = meetingParticipants.find((member) => member.id === resolvedPinnedParticipantId) ?? null;
  const gridParticipants = meetingParticipants;
  const fallbackRightPanel = sidebarTabIds[0] ?? 'chat';
  const activeRightPanel = sidebarTabIds.includes(rightPanel) ? rightPanel : fallbackRightPanel;
  const sidebarTabClass = (tab: SidebarPanel) =>
    `relative z-10 w-full rounded-xl px-3 py-2 text-center text-xs font-semibold transition-colors duration-300 ${
      activeRightPanel === tab
        ? 'text-white'
        : 'text-gray-300 hover:text-gray-100'
    }`;

  const syncSidebarIndicator = (targetTab?: SidebarPanel) => {
    const tab = targetTab ?? activeRightPanel;
    const activeElement = sidebarTabItemRefs.current[tab];
    const container = sidebarTabsRef.current;

    if (!activeElement || !container) {
      setSidebarIndicatorStyle((current) => ({ ...current, opacity: 0 }));
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const activeRect = activeElement.getBoundingClientRect();
    setSidebarIndicatorStyle({
      left: activeRect.left - containerRect.left,
      width: activeRect.width,
      opacity: 1,
    });
  };

  const getInitials = (name: string) => {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length === 0) {
      return '?';
    }
    if (parts.length === 1) {
      return parts[0].slice(0, 2).toUpperCase();
    }
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  };

  const mergeRoomPreservingPassword = (nextRoom: Room): Room => {
    if (!room?.password) {
      return nextRoom;
    }
    if (nextRoom.password !== undefined) {
      return nextRoom;
    }
    return { ...nextRoom, password: room.password };
  };

  const appendRealtimeEvent = (message: string) => {
    const entry = `${new Date().toLocaleTimeString()} • ${message}`;
    setRecentRealtimeEvents((current) => [entry, ...current].slice(0, 8));
  };

  const emitRoomEvent = (event: string, payload: Record<string, unknown>) => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) {
      return;
    }
    socket.send(JSON.stringify({ event, payload }));
  };

  const serializeStrokes = (strokes: CanvasStroke[]) => JSON.stringify(strokes);

  const normalizeCanvasStrokes = (board: unknown): CanvasStroke[] => {
    if (!board || typeof board !== 'object') {
      return [];
    }
    const rawStrokes = (board as { strokes?: unknown }).strokes;
    if (!Array.isArray(rawStrokes)) {
      return [];
    }

    return rawStrokes
      .map((item) => {
        if (!item || typeof item !== 'object') {
          return null;
        }
        const stroke = item as Partial<CanvasStroke>;
        if (!stroke.id || !stroke.user_id || !Array.isArray(stroke.points)) {
          return null;
        }
        const points = stroke.points
          .filter((point): point is { x: number; y: number } => (
            !!point
            && typeof point === 'object'
            && typeof (point as { x?: unknown }).x === 'number'
            && typeof (point as { y?: unknown }).y === 'number'
          ))
          .map((point) => ({ x: point.x, y: point.y }));

        if (points.length < 2) {
          return null;
        }

        return {
          id: stroke.id,
          user_id: stroke.user_id,
          color: typeof stroke.color === 'string' ? stroke.color : '#10b981',
          width: typeof stroke.width === 'number' ? stroke.width : 3,
          tool: stroke.tool === 'line' || stroke.tool === 'rectangle' || stroke.tool === 'ellipse' || stroke.tool === 'eraser' || stroke.tool === 'pen'
            ? stroke.tool
            : 'pen',
          points,
        };
      })
      .filter((stroke): stroke is CanvasStroke => Boolean(stroke));
  };

  const applyCanvasStrokes = (nextStrokes: CanvasStroke[], source: 'local' | 'remote') => {
    const signature = serializeStrokes(nextStrokes);
    if (signature === canvasSignatureRef.current) {
      if (source === 'remote') {
        canvasDirtyRef.current = false;
      }
      return;
    }
    canvasSignatureRef.current = signature;
    if (source === 'local') {
      canvasDirtyRef.current = true;
    } else {
      canvasDirtyRef.current = false;
      lastSavedCanvasSignatureRef.current = signature;
    }
    setCanvasStrokes(nextStrokes);
  };

  const teardownCall = () => {
    for (const connection of peerConnectionsRef.current.values()) {
      connection.onicecandidate = null;
      connection.ontrack = null;
      connection.close();
    }
    peerConnectionsRef.current.clear();
    setRemoteCallCount(0);

    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
      localStreamRef.current = null;
      setLocalStreamVersion((current) => current + 1);
    }

    setActiveCallMode(null);
  };

  const replaceOutgoingTracks = (stream: MediaStream) => {
    for (const connection of peerConnectionsRef.current.values()) {
      const senders = connection.getSenders();
      const nextVideoTrack = stream.getVideoTracks()[0] ?? null;
      const nextAudioTrack = stream.getAudioTracks()[0] ?? null;

      for (const sender of senders) {
        if (!sender.track) {
          continue;
        }
        if (sender.track.kind === 'video') {
          void sender.replaceTrack(nextVideoTrack);
        }
        if (sender.track.kind === 'audio') {
          void sender.replaceTrack(nextAudioTrack);
        }
      }
    }
  };

  const setLocalStream = (stream: MediaStream) => {
    if (localStreamRef.current) {
      localStreamRef.current.getTracks().forEach((track) => track.stop());
    }
    localStreamRef.current = stream;
    setLocalStreamVersion((current) => current + 1);
    replaceOutgoingTracks(stream);
  };

  const ensureLocalMedia = async (mode: CallMode = 'video') => {
    if (mode === 'screen') {
      const stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: true,
      });
      setLocalStream(stream);
      const screenTrack = stream.getVideoTracks()[0];
      if (screenTrack) {
        screenTrack.addEventListener('ended', () => {
          applyPresenceState({ screen_sharing: false });
          setActiveCallMode('video');
        });
      }
      return stream;
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: mode === 'video',
    });
    setLocalStream(stream);
    return stream;
  };

  const startCallWithMode = async (mode: CallMode) => {
    await ensureLocalMedia(mode);
    setActiveCallMode(mode);
    const modeState: RoomPresenceMemberState = {
      in_call: true,
      screen_sharing: mode === 'screen',
      video_enabled: mode !== 'audio',
      audio_enabled: true,
    };
    applyPresenceState(modeState);
    emitRoomEvent('call_control', {
      kind: 'joined_call',
      mode,
    });
  };

  const startMeetingFromSetup = async () => {
    const mode: CallMode = meetingSetup.screenShare
      ? 'screen'
      : (meetingSetup.cameraOn ? 'video' : 'audio');
    await startCallWithMode(mode);
    applyPresenceState({
      in_call: true,
      screen_sharing: meetingSetup.screenShare,
      video_enabled: meetingSetup.screenShare || meetingSetup.cameraOn,
      audio_enabled: meetingSetup.micOn,
    });
    setMeetingSetupOpen(false);
    setMeetingViewMode('fullscreen');
  };

  const ensurePeerConnection = async (peerId: string) => {
    const existing = peerConnectionsRef.current.get(peerId);
    if (existing) {
      return existing;
    }

    const stream = localStreamRef.current ?? await ensureLocalMedia(activeCallMode ?? 'video');
    const connection = new RTCPeerConnection({
      iceServers: [{ urls: 'stun:stun.l.google.com:19302' }],
    });

    for (const track of stream.getTracks()) {
      connection.addTrack(track, stream);
    }

    connection.onicecandidate = (event) => {
      if (!event.candidate) {
        return;
      }
      emitRoomEvent('call_signal', {
        signal_type: 'ice_candidate',
        target_user_id: peerId,
        candidate: event.candidate,
      });
    };

    connection.ontrack = () => {
      setRemoteCallCount(peerConnectionsRef.current.size);
    };

    connection.onconnectionstatechange = () => {
      if (['closed', 'failed', 'disconnected'].includes(connection.connectionState)) {
        peerConnectionsRef.current.delete(peerId);
        setRemoteCallCount(peerConnectionsRef.current.size);
      }
    };

    peerConnectionsRef.current.set(peerId, connection);
    return connection;
  };

  const createOfferForPeer = async (peerId: string) => {
    const connection = await ensurePeerConnection(peerId);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    emitRoomEvent('call_signal', {
      signal_type: 'offer',
      target_user_id: peerId,
      sdp: offer,
    });
  };

  const handleIncomingSignal = async (payload: {
    user_id?: string;
    target_user_id?: string;
    signal_type?: string;
    sdp?: RTCSessionDescriptionInit;
    candidate?: RTCIceCandidateInit;
  }) => {
    if (!user?.id || !payload.user_id || payload.user_id === user.id) {
      return;
    }
    if (payload.target_user_id && payload.target_user_id !== user.id) {
      return;
    }

    try {
      if (payload.signal_type === 'offer' && payload.sdp) {
        const connection = await ensurePeerConnection(payload.user_id);
        await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        const answer = await connection.createAnswer();
        await connection.setLocalDescription(answer);
        emitRoomEvent('call_signal', {
          signal_type: 'answer',
          target_user_id: payload.user_id,
          sdp: answer,
        });
        appendRealtimeEvent(`accepted offer from ${payload.user_id}`);
        return;
      }

      if (payload.signal_type === 'answer' && payload.sdp) {
        const connection = peerConnectionsRef.current.get(payload.user_id);
        if (!connection) {
          return;
        }
        await connection.setRemoteDescription(new RTCSessionDescription(payload.sdp));
        appendRealtimeEvent(`connected with ${payload.user_id}`);
        return;
      }

      if (payload.signal_type === 'ice_candidate' && payload.candidate) {
        const connection = peerConnectionsRef.current.get(payload.user_id);
        if (!connection) {
          return;
        }
        await connection.addIceCandidate(new RTCIceCandidate(payload.candidate));
      }
    } catch {
      appendRealtimeEvent(`signal handling failed for ${payload.user_id}`);
    }
  };

  const applyPresenceState = (patch: RoomPresenceMemberState) => {
    setLocalPresenceState((current) => {
      const nextState = { ...current, ...patch };
      localPresenceStateRef.current = nextState;
      return nextState;
    });
    emitRoomEvent('presence_state', patch as Record<string, unknown>);
    emitRoomEvent('call_control', {
      kind: 'media_state',
      state: patch,
    });
  };

  const handleCanvasStrokeComplete = (stroke: CanvasStroke) => {
    setCanvasStrokes((current) => {
      if (current.some((item) => item.id === stroke.id)) {
        return current;
      }
      const next = [...current, stroke];
      canvasSignatureRef.current = serializeStrokes(next);
      canvasDirtyRef.current = true;
      return next;
    });

    emitRoomEvent('canvas_delta', {
      kind: 'append_stroke',
      stroke,
    });
  };

  const handleCanvasReplaceStrokes = (nextStrokes: CanvasStroke[]) => {
    applyCanvasStrokes(nextStrokes, 'local');
    emitRoomEvent('canvas_delta', {
      kind: 'replace_board',
      board: {
        strokes: nextStrokes,
        updated_at: new Date().toISOString(),
      },
    });
  };

  const handleCanvasCursorMove = (cursor: Omit<CanvasCursor, 'name'>) => {
    emitRoomEvent('canvas_cursor', {
      x: cursor.x,
      y: cursor.y,
    });
  };

  useEffect(() => {
    if (!room) {
      return;
    }
    setOwnerRoomName(room.name);
    setOwnerMaxMembers(room.max_members);
    setOwnerPassword(room.password ?? '');
  }, [room]);

  useEffect(() => {
    localPresenceStateRef.current = localPresenceState;
  }, [localPresenceState]);

  useLayoutEffect(() => {
    if (sidebarCollapsed || sidebarTransitioning) {
      setSidebarIndicatorStyle((current) => ({ ...current, opacity: 0 }));
      return;
    }

    syncSidebarIndicator(activeRightPanel);
    const handleResize = () => syncSidebarIndicator(activeRightPanel);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [activeRightPanel, sidebarCollapsed, sidebarTransitioning, isOwner]);

  useEffect(() => {
    if (rightPanel !== activeRightPanel) {
      setRightPanel(activeRightPanel);
    }
  }, [activeRightPanel, rightPanel]);

  useEffect(() => {
    if (!sidebarCollapsed) {
      preservedExpandedPanelRef.current = activeRightPanel;
      if (lastExpandedRightPanel !== activeRightPanel) {
        setLastExpandedRightPanel(activeRightPanel);
      }
    }
  }, [activeRightPanel, lastExpandedRightPanel, sidebarCollapsed]);

  const handleCollapseSidebar = () => {
    setLastExpandedRightPanel(activeRightPanel);
    preservedExpandedPanelRef.current = activeRightPanel;
    setSidebarTransitioning(true);
    setSidebarCollapsed(true);
  };

  const handleExpandSidebar = (panel?: SidebarPanel) => {
    const candidatePanel = panel ?? preservedExpandedPanelRef.current ?? lastExpandedRightPanel;
    const resolvedPanel = sidebarTabIds.includes(candidatePanel) ? candidatePanel : fallbackRightPanel;
    setRightPanel(resolvedPanel);
    setLastExpandedRightPanel(resolvedPanel);
    preservedExpandedPanelRef.current = resolvedPanel;
    setSidebarTransitioning(true);
    setSidebarCollapsed(false);
  };

  const hydrateRoom = async () => {
    const roomData = await getRoom(roomId);
    let roomMessages = { messages: [] as RoomMessage[] };
    let roomArtifacts = { artifacts: [] as RoomArtifact[] };

    const isMember = roomData.members?.some((member) => member.id === user?.id);
    if (isMember) {
      [roomMessages, roomArtifacts] = await Promise.all([
        listRoomMessages(roomId),
        listRoomArtifacts(roomId),
      ]);
    }
    setRoom(roomData);
    setMessages(roomMessages.messages);
    setArtifacts(roomArtifacts.artifacts);
    setSelectedArtifactId((current) => current ?? roomArtifacts.artifacts[0]?.id ?? null);
  };

  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [messages]);

  useEffect(() => {
    if (!authLoading && !user) {
      setLoading(false);
      router.replace('/login');
    }
  }, [authLoading, router, user]);

  useEffect(() => {
    if (!user) {
      return;
    }
    const loadRoom = async () => {
      try {
        setLoading(true);
        await hydrateRoom();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load room');
      } finally {
        setLoading(false);
      }
    };

    loadRoom();
  }, [roomId, user]);

  useEffect(() => {
    if (!user || !isMember) {
      setConnectionState('offline');
      return;
    }

    intentionalCloseRef.current = false;

    const scheduleReconnect = () => {
      if (intentionalCloseRef.current) {
        return;
      }
      reconnectAttemptsRef.current += 1;
      const delay = Math.min(1000 * 2 ** Math.min(reconnectAttemptsRef.current, 4), 15000);
      setConnectionState('reconnecting');
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
      }
      reconnectTimerRef.current = window.setTimeout(() => {
        void connectSocket();
      }, delay);
    };

    const connectSocket = async () => {
      setConnectionState(reconnectAttemptsRef.current > 0 ? 'reconnecting' : 'connecting');
      try {
        await hydrateRoom();
      } catch {
        // Keep retrying the websocket even if the snapshot refresh fails.
      }

      const accessToken = getAccessToken();
      if (!accessToken) {
        setConnectionState('offline');
        return;
      }

      const socket = new WebSocket(getRoomWebSocketUrl(roomId, accessToken));
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptsRef.current = 0;
        setConnectionState('connected');
        setError(null);
        emitRoomEvent('presence_state', localPresenceStateRef.current as Record<string, unknown>);
      };

      socket.onmessage = (event) => {
        const envelope = JSON.parse(event.data) as RoomEventEnvelope;
        switch (envelope.event) {
          case 'room_snapshot': {
            const payload = envelope.payload as unknown as RoomSnapshotEvent;
            setRoom(mergeRoomPreservingPassword(payload.room));
            setMessages(payload.messages);
            setArtifacts(payload.artifacts);
            setPresence(payload.presence);
            setSelectedArtifactId((current) => current ?? payload.artifacts[0]?.id ?? null);
            break;
          }
          case 'message_created': {
            const payload = envelope.payload as { message: RoomMessage };
            setMessages((current) => {
              if (current.some((message) => message.id === payload.message.id)) {
                return current;
              }
              return [...current, payload.message];
            });
            break;
          }
          case 'artifact_created': {
            const payload = envelope.payload as { artifact: RoomArtifact };
            setArtifacts((current) => {
              if (current.some((artifact) => artifact.id === payload.artifact.id)) {
                return current;
              }
              return [payload.artifact, ...current];
            });
            if (payload.artifact.artifact_type !== 'canvas_snapshot') {
              setSelectedArtifactId(payload.artifact.id);
            }
            break;
          }
          case 'context_updated': {
            const payload = envelope.payload as { files: Room['context_files'] };
            setRoom((current) => (current ? { ...current, context_files: payload.files ?? [] } : current));
            break;
          }
          case 'member_joined':
          case 'member_left': {
            const payload = envelope.payload as { room: Room };
            setRoom(mergeRoomPreservingPassword(payload.room));
            break;
          }
          case 'presence_updated': {
            setPresence(envelope.payload as unknown as RoomPresence);
            break;
          }
          case 'presence_state_ack': {
            break;
          }
          case 'call_signal': {
            const payload = envelope.payload as {
              user_id?: string;
              target_user_id?: string;
              signal_type?: string;
              sdp?: RTCSessionDescriptionInit;
              candidate?: RTCIceCandidateInit;
            };
            if (payload.user_id && payload.user_id !== user?.id) {
              appendRealtimeEvent(`signal from ${payload.user_id}${payload.signal_type ? ` (${payload.signal_type})` : ''}`);
            }
            void handleIncomingSignal(payload);
            break;
          }
          case 'call_control': {
            const payload = envelope.payload as { user_id?: string; kind?: string };
            if (payload.user_id && payload.user_id !== user?.id) {
              appendRealtimeEvent(`call control from ${payload.user_id}${payload.kind ? ` (${payload.kind})` : ''}`);
            }
            break;
          }
          case 'canvas_cursor': {
            const payload = envelope.payload as { user_id?: string; x?: number; y?: number };
            if (
              payload.user_id
              && payload.user_id !== user?.id
              && typeof payload.x === 'number'
              && typeof payload.y === 'number'
            ) {
              const sender = room?.members?.find((member) => member.id === payload.user_id);
              setRemoteCanvasCursors((current) => ({
                ...current,
                [payload.user_id as string]: {
                  user_id: payload.user_id as string,
                  name: sender?.name ?? 'Member',
                  x: payload.x as number,
                  y: payload.y as number,
                },
              }));
            }
            if (payload.user_id && payload.user_id !== user?.id) {
              appendRealtimeEvent(`cursor moved by ${payload.user_id}`);
            }
            break;
          }
          case 'canvas_delta': {
            const payload = envelope.payload as {
              user_id?: string;
              kind?: string;
              stroke?: CanvasStroke;
              board?: Record<string, unknown>;
            };
            if (payload.kind === 'append_stroke' && payload.stroke) {
              setCanvasStrokes((current) => {
                if (current.some((item) => item.id === payload.stroke?.id)) {
                  return current;
                }
                const next = [...current, payload.stroke as CanvasStroke];
                canvasSignatureRef.current = serializeStrokes(next);
                canvasDirtyRef.current = false;
                return next;
              });
            } else if (payload.board && typeof payload.board === 'object') {
              applyCanvasStrokes(normalizeCanvasStrokes(payload.board), 'remote');
            }
            if (payload.user_id && payload.user_id !== user?.id) {
              appendRealtimeEvent(`canvas updated by ${payload.user_id}`);
            }
            break;
          }
          case 'canvas_snapshot_updated': {
            const payload = envelope.payload as { artifact?: RoomArtifact };
            const board = payload.artifact?.payload?.board;
            if (board && typeof board === 'object') {
              applyCanvasStrokes(normalizeCanvasStrokes(board), 'remote');
            }
            break;
          }
          case 'job_failed': {
            const payload = envelope.payload as { error?: string };
            if (payload.error) {
              setError(payload.error);
            }
            setWorking(false);
            break;
          }
          case 'job_finished': {
            setWorking(false);
            break;
          }
          default:
            break;
        }
      };

      socket.onerror = () => {
        setError('Room live connection dropped. Reconnecting...');
      };

      socket.onclose = () => {
        socketRef.current = null;
        if (!intentionalCloseRef.current) {
          scheduleReconnect();
        }
      };
    };

    void connectSocket();

    return () => {
      intentionalCloseRef.current = true;
      setConnectionState('offline');
      if (reconnectTimerRef.current) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      const socket = socketRef.current;
      socketRef.current = null;
      socket?.close();
    };
  }, [isMember, roomId, user]);

  useEffect(() => {
    if (!isMember || !user) {
      hasLoadedCanvasSnapshotRef.current = false;
      return;
    }

    let cancelled = false;
    const loadCanvasSnapshot = async () => {
      try {
        const snapshot = await getRoomCanvasSnapshot(roomId);
        if (cancelled) {
          return;
        }
        const board = snapshot.artifact?.payload?.board;
        if (board && typeof board === 'object') {
          applyCanvasStrokes(normalizeCanvasStrokes(board), 'remote');
        }
      } catch {
        // Ignore missing snapshot and keep local board state.
      } finally {
        if (!cancelled) {
          hasLoadedCanvasSnapshotRef.current = true;
        }
      }
    };

    void loadCanvasSnapshot();
    return () => {
      cancelled = true;
    };
  }, [isMember, roomId, user]);

  useEffect(() => {
    if (!isMember || !hasLoadedCanvasSnapshotRef.current || !canvasDirtyRef.current) {
      return;
    }

    if (canvasAutosaveTimerRef.current) {
      window.clearTimeout(canvasAutosaveTimerRef.current);
    }
    canvasAutosaveTimerRef.current = window.setTimeout(() => {
      const persistSnapshot = async () => {
        try {
          const signature = canvasSignatureRef.current;
          if (!canvasDirtyRef.current || signature === lastSavedCanvasSignatureRef.current) {
            return;
          }
          setCanvasSyncState('saving');
          await saveRoomCanvasSnapshot(roomId, {
            title: 'Live Canvas',
            board: {
              strokes: canvasStrokes,
              updated_at: new Date().toISOString(),
            },
          });
          lastSavedCanvasSignatureRef.current = signature;
          canvasDirtyRef.current = false;
          setCanvasSyncState('saved');
        } catch {
          setCanvasSyncState('error');
        }
      };
      void persistSnapshot();
    }, 1400);

    return () => {
      if (canvasAutosaveTimerRef.current) {
        window.clearTimeout(canvasAutosaveTimerRef.current);
        canvasAutosaveTimerRef.current = null;
      }
    };
  }, [canvasStrokes, isMember, roomId]);

  useEffect(() => {
    if (!user || !presence) {
      return;
    }

    const next = presence.active_user_states?.[user.id];
    if (!next) {
      return;
    }

    setLocalPresenceState((current) => ({ ...current, ...next }));
  }, [presence, user]);

  useEffect(() => {
    if (!meetingParticipants.length) {
      setPinnedParticipantId(null);
      return;
    }
    if (!pinnedParticipantId || !meetingParticipants.some((member) => member.id === pinnedParticipantId)) {
      setPinnedParticipantId(user?.id ?? meetingParticipants[0]?.id ?? null);
    }
  }, [meetingParticipants, pinnedParticipantId, user]);

  useEffect(() => {
    if (!canvasModalOpen) {
      return;
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [canvasModalOpen]);

  useEffect(() => {
    if (!localVideoRef.current) {
      return;
    }
    localVideoRef.current.srcObject = localStreamRef.current;
  }, [localStreamVersion, localPresenceState.in_call, meetingSetupOpen, meetingViewMode]);

  useEffect(() => {
    if (!meetingSetupOpen || localPresenceState.in_call) {
      return;
    }

    const mode: CallMode = meetingSetup.screenShare
      ? 'screen'
      : (meetingSetup.cameraOn ? 'video' : 'audio');
    void ensureLocalMedia(mode)
      .then((stream) => {
        for (const track of stream.getAudioTracks()) {
          track.enabled = Boolean(meetingSetup.micOn);
        }
        for (const track of stream.getVideoTracks()) {
          track.enabled = Boolean(meetingSetup.cameraOn || meetingSetup.screenShare);
        }
      })
      .catch(() => {
        // Keep setup open and let user retry if permissions fail.
      });
  }, [
    localPresenceState.in_call,
    meetingSetup.cameraOn,
    meetingSetup.micOn,
    meetingSetup.screenShare,
    meetingSetupOpen,
  ]);

  useEffect(() => {
    if (!localPresenceState.in_call) {
      setMeetingViewMode('hidden');
      return;
    }
    const width = typeof window === 'undefined' ? 1200 : window.innerWidth;
    const preferredX = Math.max(16, width - 320);
    setVcPanelPosition((current) => ({
      x: current.x < 20 ? preferredX : current.x,
      y: current.y,
    }));
  }, [localPresenceState.in_call]);

  useEffect(() => {
    if (!vcPanelDragging || meetingViewMode !== 'small') {
      return;
    }

    const onMouseMove = (event: MouseEvent) => {
      const panelWidth = 280;
      const panelHeight = 214;
      const maxX = Math.max(12, window.innerWidth - panelWidth - 12);
      const maxY = Math.max(12, window.innerHeight - panelHeight - 12);
      const nextX = Math.min(maxX, Math.max(12, event.clientX - dragOffsetRef.current.x));
      const nextY = Math.min(maxY, Math.max(12, event.clientY - dragOffsetRef.current.y));
      setVcPanelPosition({ x: nextX, y: nextY });
    };

    const onMouseUp = () => {
      setVcPanelDragging(false);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
    return () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
  }, [vcPanelDragging, meetingViewMode]);

  useEffect(() => {
    if (localPresenceState.in_call) {
      setMeetingSetupOpen(false);
      if (meetingViewMode === 'hidden') {
        setMeetingViewMode('fullscreen');
      }
    }
  }, [localPresenceState.in_call, meetingViewMode]);

  useEffect(() => {
    if (!localPresenceState.in_call) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      const isTyping = tag === 'input' || tag === 'textarea' || target?.isContentEditable;
      if (isTyping) {
        return;
      }

      const key = event.key.toLowerCase();
      if (key === 'm') {
        event.preventDefault();
        applyPresenceState({ audio_enabled: !Boolean(localPresenceState.audio_enabled) });
      }
      if (key === 'v') {
        event.preventDefault();
        applyPresenceState({ video_enabled: !Boolean(localPresenceState.video_enabled) });
      }
      if (key === 's' && event.shiftKey) {
        event.preventDefault();
        const nextScreen = !Boolean(localPresenceState.screen_sharing);
        void startCallWithMode(nextScreen ? 'screen' : (localPresenceState.video_enabled ? 'video' : 'audio'));
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [
    localPresenceState.audio_enabled,
    localPresenceState.in_call,
    localPresenceState.screen_sharing,
    localPresenceState.video_enabled,
  ]);

  useEffect(() => {
    if (!user?.id || !presence) {
      setRemoteCallCount(0);
      return;
    }

    const inCallUsers = Object.entries(presence.active_user_states ?? {}).filter(
      ([memberId, state]) => memberId !== user.id && Boolean(state.in_call),
    );
    setRemoteCallCount(inCallUsers.length);

    const activeUsers = new Set(presence.active_user_ids ?? []);
    setRemoteCanvasCursors((current) => {
      const next: Record<string, CanvasCursor> = {};
      for (const [memberId, cursor] of Object.entries(current)) {
        if (activeUsers.has(memberId)) {
          next[memberId] = cursor;
        }
      }
      return next;
    });
  }, [presence, user]);

  useEffect(() => {
    if (localPresenceState.in_call) {
      return;
    }
    teardownCall();
  }, [localPresenceState.in_call]);

  useEffect(() => {
    if (!user?.id || !localPresenceState.in_call || !presence) {
      return;
    }

    const peersToCall = Object.entries(presence.active_user_states ?? {})
      .filter(([memberId, state]) => memberId !== user.id && Boolean(state.in_call))
      .map(([memberId]) => memberId)
      .filter((memberId) => !peerConnectionsRef.current.has(memberId));

    for (const peerId of peersToCall) {
      void createOfferForPeer(peerId);
    }
  }, [localPresenceState.in_call, presence, user]);

  useEffect(() => {
    if (!localStreamRef.current) {
      return;
    }

    for (const track of localStreamRef.current.getAudioTracks()) {
      track.enabled = Boolean(localPresenceState.audio_enabled);
    }
    for (const track of localStreamRef.current.getVideoTracks()) {
      track.enabled = Boolean(localPresenceState.video_enabled);
    }
  }, [localPresenceState.audio_enabled, localPresenceState.video_enabled]);

  useEffect(() => {
    return () => {
      teardownCall();
    };
  }, []);

  const handleJoin = async () => {
    if (!user) {
      router.push('/login');
      return;
    }

    try {
      setWorking(true);
      const joinedRoom = await joinRoom(roomId);
      setRoom(joinedRoom);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to join room');
    } finally {
      setWorking(false);
    }
  };

  const handleUpdateRoom = async () => {
    if (!isOwner || !room) {
      return;
    }

    try {
      setWorking(true);
      const updated = await updateRoom(room.id, {
        name: ownerRoomName.trim(),
        max_members: ownerMaxMembers,
        password: ownerPassword,
      });
      setRoom(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update room');
    } finally {
      setWorking(false);
    }
  };

  const handleDeleteRoom = async () => {
    if (!isOwner || !room) {
      return;
    }

    const confirmed = window.confirm('Delete this room for all members? This cannot be undone.');
    if (!confirmed) {
      return;
    }

    try {
      setWorking(true);
      await deleteRoom(room.id);
      router.push('/rooms');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete room');
      setWorking(false);
    }
  };

  const handleInvite = async () => {
    if (!isOwner || !room || !inviteUsername.trim()) {
      setError('Enter a username to invite.');
      return;
    }

    try {
      setWorking(true);
      await inviteToRoom(room.id, inviteUsername.trim());
      setInviteUsername('');
      await hydrateRoom();
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send invite');
    } finally {
      setWorking(false);
    }
  };

  const handleKick = async (memberId: string) => {
    if (!isOwner || !room) {
      return;
    }

    try {
      setWorking(true);
      const updated = await kickRoomMember(room.id, memberId);
      setRoom(updated);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove member');
    } finally {
      setWorking(false);
    }
  };

  const handleAddContext = async () => {
    if (!isMember || contextSelection.length === 0) {
      setError('Select files to add to shared room context.');
      return;
    }

    try {
      await addRoomContextFiles(roomId, contextSelection);
      setContextSelection([]);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add room files');
    }
  };

  const submitComposer = async () => {
    if (!isMember) {
      setError('Join the room before using room tools.');
      return;
    }

    const text = composerText.trim();

    try {
      setWorking(true);

      if (activeTool === 'query' || activeTool === 'deepquery') {
        if (!text) {
          setError('Ask a question before running AI actions.');
          setWorking(false);
          return;
        }
        if (activeTool === 'query') {
          await roomQuery(roomId, text, defaultCostTopK);
        } else {
          await roomDeepQuery(roomId, text, createGraph ? topK : defaultCostTopK, createGraph);
        }
        setComposerText('');
        setError(null);
        return;
      }

      if (text) {
        await postRoomMessage(roomId, `${activeToolLabel} requested: ${text}`, 'chat');
      }

      const payload = {
        filenames: actionFiles.length > 0 ? actionFiles : undefined,
        question_type: quizType,
        count: quizCount,
        combine: combineOutline,
      };

      switch (activeTool) {
        case 'summarize':
          await roomSummarize(roomId, payload);
          break;
        case 'faq':
          await roomFAQ(roomId, payload);
          break;
        case 'flashcards':
          await roomFlashcards(roomId, payload);
          break;
        case 'outline':
          await roomOutline(roomId, payload);
          break;
        case 'quiz':
          await roomQuiz(roomId, payload);
          break;
        default:
          break;
      }

      setComposerText('');
      setError(null);
    } catch (err) {
      setWorking(false);
      setError(err instanceof Error ? err.message : 'Failed to run room action');
    }
  };

  const submitSidebarChat = async () => {
    if (!isMember || !sidebarChatText.trim()) {
      return;
    }

    try {
      await postRoomMessage(roomId, sidebarChatText.trim(), 'chat');
      setSidebarChatText('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send room message');
    }
  };

  const resolveArtifactForMessage = (message: RoomMessage) => {
    const artifactId = typeof message.metadata?.artifact_id === 'string' ? message.metadata.artifact_id : null;
    if (artifactId) {
      return artifacts.find((artifact) => artifact.id === artifactId) ?? null;
    }

    if (message.message_type !== 'answer') {
      return null;
    }

    const messageTime = new Date(message.created_at).getTime();
    return (
      artifacts.find((artifact) => {
        const artifactTime = new Date(artifact.created_at).getTime();
        return (
          artifact.created_by === message.user_id
          && artifactTime >= messageTime - 5000
          && artifactTime <= messageTime + 120000
        );
      }) ?? null
    );
  };

  const resolveArtifactForQuestionMessage = (message: RoomMessage) => {
    const directArtifactId = typeof message.metadata?.artifact_id === 'string' ? message.metadata.artifact_id : null;
    if (directArtifactId) {
      return artifacts.find((artifact) => artifact.id === directArtifactId) ?? null;
    }

    const questionTime = new Date(message.created_at).getTime();
    return (
      artifacts.find((artifact) => {
        const artifactTime = new Date(artifact.created_at).getTime();
        return (
          artifact.created_by === message.user_id
          && artifactTime >= questionTime
          && artifactTime <= questionTime + 180000
        );
      }) ?? null
    );
  };

  const openQuestionContext = (message: RoomMessage) => {
    const relatedArtifact = resolveArtifactForQuestionMessage(message);
    if (relatedArtifact) {
      setSelectedArtifactId(relatedArtifact.id);
    }
    setSidebarCollapsed(false);
    setRightPanel('artifacts');
    setHighlightedFeedMessageId(message.id);

    window.setTimeout(() => {
      feedMessageRefs.current[message.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 120);

    window.setTimeout(() => {
      setHighlightedFeedMessageId((current) => (current === message.id ? null : current));
    }, 2400);
  };

  const resizeComposerInput = () => {
    const input = composerInputRef.current;
    if (!input) {
      return;
    }
    input.style.height = 'auto';
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`;
  };

  useEffect(() => {
    resizeComposerInput();
  }, [composerText]);

  if (authLoading || loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }

  return (
    <div className="h-full w-full overflow-hidden px-2 py-2 sm:px-3 sm:py-3 lg:px-3 lg:py-3 xl:px-4 xl:py-3">
      {error && <div className="mb-4"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}

      <div className="flex h-full flex-col gap-2 xl:flex-row xl:gap-3">
        <section
          className={`w-full transition-all duration-300 ease-out ${
            sidebarCollapsed ? 'xl:basis-[95%]' : 'xl:basis-[70%]'
          }`}
        >
          <div className="flex h-full w-full flex-col rounded-3xl border border-gray-800 bg-[#101010] p-4">
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div className="flex flex-wrap items-center gap-3">
                <span className="rounded-md border border-emerald-400/30 bg-emerald-500/10 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-emerald-300">
                  Active Session
                </span>
                <h1 className="text-2xl font-semibold text-white">{room?.name ?? 'Room'}</h1>
                <span className={`rounded-full px-2 py-1 text-[10px] uppercase tracking-[0.15em] ${connectionState === 'connected' ? 'bg-emerald-950/60 text-emerald-300' : 'bg-amber-950/60 text-amber-300'}`}>
                  {connectionState}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <div className="flex items-center -space-x-2">
                  {(room?.members ?? []).map((member) => {
                    const isOnline = onlineUserIds.has(member.id);
                    const memberInCall = Boolean(presenceUserStates[member.id]?.in_call);
                    return (
                      <div
                        key={member.id}
                        title={`${member.name} (${isOnline ? 'online' : 'offline'}${memberInCall ? ', in call' : ''})`}
                        className={`relative flex h-8 w-8 items-center justify-center rounded-full border-2 border-[#101010] text-[10px] font-semibold ${isOnline ? 'bg-emerald-500/20 text-emerald-100' : 'bg-gray-800 text-gray-300'}`}
                      >
                        {getInitials(member.name)}
                        <span className={`absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border border-[#101010] ${memberInCall ? 'bg-cyan-400' : 'bg-gray-600'}`} />
                      </div>
                    );
                  })}
                </div>

                {isMember && (
                  <div className="relative flex items-center gap-1.5">
                    {!localPresenceState.in_call ? (
                      <button
                        onClick={async () => {
                          setMeetingViewMode('fullscreen');
                          setMeetingSetupOpen(true);
                          try {
                            await ensureLocalMedia('video');
                          } catch {
                            // User may deny camera permission before setup choices.
                          }
                        }}
                        className="rounded-xl border border-cyan-700/70 bg-cyan-950/25 px-3 py-2 text-xs font-semibold text-cyan-100 hover:bg-cyan-900/35"
                      >
                        Start Meeting
                      </button>
                    ) : (
                      <>
                        <span className="rounded-full border border-cyan-700/70 bg-cyan-950/35 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200">
                          {activeCallMode ?? 'call'}
                        </span>
                        <button
                          onClick={() => setMeetingViewMode('fullscreen')}
                          className="rounded-lg border border-gray-700 bg-black/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-200"
                        >
                          Full
                        </button>
                        <button
                          onClick={() => setMeetingViewMode('small')}
                          className="rounded-lg border border-gray-700 bg-black/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-200"
                        >
                          Small
                        </button>
                        <button
                          onClick={() => setMeetingViewMode('minimized')}
                          className="rounded-lg border border-gray-700 bg-black/30 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gray-200"
                        >
                          Min
                        </button>
                        <button
                          onClick={() => {
                            teardownCall();
                            applyPresenceState({ in_call: false, screen_sharing: false });
                            emitRoomEvent('call_control', { kind: 'left_call' });
                            setMeetingViewMode('hidden');
                          }}
                          className="rounded-lg border border-rose-700/70 bg-rose-950/25 px-2 py-1.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-rose-200"
                        >
                          End
                        </button>
                      </>
                    )}
                  </div>
                )}

                {!isMember ? (
                  <button
                    onClick={handleJoin}
                    disabled={working}
                    className="rounded-xl bg-emerald-500 px-3 py-2 text-xs font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
                  >
                    Join Room
                  </button>
                ) : null}
              </div>
            </div>

            <div className="mb-3 flex items-center justify-between">
              <div>
                <h2 className="text-base font-semibold text-white">Room Feed</h2>
                <p className="text-sm text-gray-400">One shared stream for discussion and AI output.</p>
              </div>
              <div className="h-8" />
            </div>

            <div ref={chatScrollRef} className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              {feedMessages.map((message) => {
                const artifact = resolveArtifactForMessage(message);
                return (
                  <article
                    key={message.id}
                    ref={(element) => {
                      feedMessageRefs.current[message.id] = element;
                    }}
                    className={`rounded-2xl border p-4 ${
                      message.message_type === 'answer'
                        ? 'border-emerald-700 bg-emerald-950/20'
                        : message.message_type === 'question'
                          ? 'border-sky-800 bg-sky-950/20'
                          : message.message_type === 'system'
                            ? 'border-amber-900/60 bg-amber-950/15'
                            : message.user_id === user?.id
                              ? 'border-emerald-900 bg-emerald-950/20'
                              : 'border-gray-800 bg-black/20'
                    } ${highlightedFeedMessageId === message.id ? 'ring-2 ring-emerald-400/70' : ''}`}
                  >
                    <div className="mb-2 flex items-center justify-between gap-3 text-xs">
                      <div className="flex items-center gap-2">
                        <span className="font-medium uppercase tracking-[0.2em] text-gray-500">{message.user_name}</span>
                        <span className="rounded-full border border-gray-700 bg-black/30 px-2 py-0.5 text-[10px] uppercase tracking-[0.15em] text-gray-400">{message.message_type}</span>
                      </div>
                      <span className="text-gray-500">{new Date(message.created_at).toLocaleTimeString()}</span>
                    </div>

                    {message.message_type === 'answer' ? (
                      <MarkdownRenderer
                        content={message.content}
                        className="prose prose-invert max-w-none text-[15px] leading-7"
                      />
                    ) : (
                      <p className="whitespace-pre-wrap text-[15px] leading-7 text-gray-100">{message.content}</p>
                    )}

                    {artifact && (
                      <button
                        onClick={() => {
                          setSelectedArtifactId(artifact.id);
                          setRightPanel('artifacts');
                        }}
                        className="mt-3 rounded-xl border border-emerald-700/60 bg-emerald-950/20 px-3 py-2 text-xs font-semibold text-emerald-200 hover:bg-emerald-900/30"
                      >
                        Open Result: {artifact.title}
                      </button>
                    )}
                  </article>
                );
              })}

              {feedMessages.length === 0 && (
                <div className="rounded-2xl border border-dashed border-gray-700 bg-black/20 p-5 text-center text-sm text-gray-500">
                  No activity yet. Start with a message or an AI action below.
                </div>
              )}
              <div ref={chatEndRef} />
            </div>

            <div className="sticky bottom-0 z-10 mt-4 rounded-3xl border border-gray-700 bg-[#0d0d0d]/95 p-4 shadow-[0_8px_30px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                {actionTools.map((tool) => (
                  <button
                    key={tool.id}
                    onClick={() => setActiveTool(tool.id)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${activeTool === tool.id ? 'bg-emerald-500 text-black' : 'bg-black/30 text-gray-300'}`}
                  >
                    {tool.label}
                  </button>
                ))}
              </div>

              <div className="mb-3 flex flex-wrap items-center gap-2">

                {activeTool === 'deepquery' && createGraph && (
                  <label className="flex items-center gap-2 rounded-lg border border-gray-700 bg-black/20 px-2 py-1 text-xs text-gray-300">
                    Depth
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={topK}
                      onChange={(event) => setTopK(Number.parseInt(event.target.value, 10) || 5)}
                      className="w-14 rounded-md border border-gray-700 bg-black/30 px-1.5 py-0.5 text-xs text-white"
                    />
                  </label>
                )}

                {activeTool === 'deepquery' && (
                  <label className="flex items-center gap-1 rounded-lg border border-gray-700 bg-black/20 px-2 py-1 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={createGraph}
                      onChange={(event) => setCreateGraph(event.target.checked)}
                      className="rounded border-gray-600 bg-gray-800 text-emerald-600"
                    />
                    Knowledge Graph
                  </label>
                )}

                {activeTool === 'quiz' && (
                  <>
                    <select
                      value={quizType}
                      onChange={(event) => setQuizType(event.target.value as 'mcq' | 'short')}
                      className="rounded-lg border border-gray-700 bg-black/20 px-2 py-1 text-xs text-white"
                    >
                      <option value="mcq">MCQ</option>
                      <option value="short">Short</option>
                    </select>
                    <input
                      type="number"
                      min="1"
                      max="20"
                      value={quizCount}
                      onChange={(event) => setQuizCount(Number.parseInt(event.target.value, 10) || 10)}
                      className="w-14 rounded-lg border border-gray-700 bg-black/20 px-2 py-1 text-xs text-white"
                    />
                  </>
                )}

                {activeTool === 'outline' && (
                  <label className="flex items-center gap-1 rounded-lg border border-gray-700 bg-black/20 px-2 py-1 text-xs text-gray-300">
                    <input
                      type="checkbox"
                      checked={combineOutline}
                      onChange={(event) => setCombineOutline(event.target.checked)}
                      className="rounded border-gray-600 bg-gray-800 text-emerald-600"
                    />
                    Combine
                  </label>
                )}
              </div>

              {showSourcePicker && (
                <div className="mb-3 rounded-xl border border-gray-800 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Shared sources</p>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => setActionFiles((room?.context_files ?? []).map((file) => file.filename))}
                        className="text-xs text-emerald-300 hover:text-emerald-200"
                      >
                        Use all
                      </button>
                      <button
                        onClick={() => setActionFiles([])}
                        className="text-xs text-gray-400 hover:text-gray-200"
                      >
                        Clear
                      </button>
                    </div>
                  </div>

                  <div className="max-h-40 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {(room?.context_files ?? []).map((file) => {
                      const selected = actionFiles.includes(file.filename);
                      return (
                        <label key={file.filename} className="flex items-center justify-between rounded-lg border border-gray-800 bg-black/20 px-3 py-2 text-sm text-gray-200">
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={selected}
                              onChange={(event) => {
                                setActionFiles((prev) => {
                                  if (event.target.checked) {
                                    return [...prev, file.filename];
                                  }
                                  return prev.filter((name) => name !== file.filename);
                                });
                              }}
                              className="rounded border-gray-600 bg-gray-800 text-emerald-600"
                            />
                            <span>{file.filename}</span>
                          </div>
                          <span className="text-xs text-gray-500">{file.added_by_name}</span>
                        </label>
                      );
                    })}

                    {(room?.context_files ?? []).length === 0 && (
                      <div className="rounded-xl border border-dashed border-gray-700 p-3 text-center text-xs text-gray-500">
                        No shared files yet. Add files in the Files panel.
                      </div>
                    )}
                  </div>
                </div>
              )}

              <div className="relative">
                <textarea
                  ref={composerInputRef}
                  value={composerText}
                  onChange={(event) => setComposerText(event.target.value)}
                  rows={1}
                  className="max-h-44 min-h-12 w-full resize-none overflow-y-auto rounded-2xl border border-gray-700 bg-black/30 px-4 py-3 pr-48 text-sm text-white outline-none focus:border-emerald-500 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                  placeholder={composerPlaceholder}
                />

                <div className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-2">
                  <button
                    onClick={() => setShowSourcePicker((current) => !current)}
                    className="rounded-full border border-gray-700 bg-black/30 px-2.5 py-1 text-[11px] text-gray-300 hover:text-white"
                  >
                    Files
                  </button>

                  <span className="text-[11px] text-gray-400">
                    {sourceFilenames.length} src
                  </span>

                  <button
                    onClick={submitComposer}
                    disabled={!isMember || working}
                    title={working ? 'Running...' : submitLabel}
                    aria-label={working ? 'Running action' : submitLabel}
                    className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                  >
                    {working ? (
                      <svg viewBox="0 0 24 24" className="h-4 w-4 animate-spin" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 12a9 9 0 1 1-6.2-8.6" />
                      </svg>
                    ) : (
                      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="5" y1="12" x2="19" y2="12" />
                        <polyline points="12 5 19 12 12 19" />
                      </svg>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          onTransitionEnd={(event) => {
            if (event.target !== event.currentTarget) {
              return;
            }
            if (!sidebarTransitioning) {
              return;
            }
            setSidebarTransitioning(false);
            if (!sidebarCollapsed) {
              syncSidebarIndicator(activeRightPanel);
            }
          }}
          className={`w-full overflow-hidden transition-all duration-300 ease-out ${
            sidebarCollapsed
              ? 'xl:basis-[5%] xl:min-w-16 xl:max-w-none xl:translate-x-0 xl:opacity-100'
              : 'xl:basis-[30%] xl:max-w-none xl:translate-x-0 xl:opacity-100'
          }`}
        >
              <div className={`flex h-full flex-col rounded-3xl border border-gray-800 bg-[#111111] ${sidebarCollapsed ? 'p-2' : 'p-4'}`}>
          {sidebarCollapsed ? (
            <div className="flex h-full flex-col items-center justify-between py-3">
              <button
                onClick={handleExpandSidebar}
                title="Open studio panel"
                aria-label="Open studio panel"
                className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
              >
                <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="4" y1="7" x2="20" y2="7" />
                  <line x1="4" y1="12" x2="20" y2="12" />
                  <line x1="4" y1="17" x2="20" y2="17" />
                </svg>
              </button>

              <div className="flex flex-col items-center gap-3">
                <button
                  onClick={() => {
                    handleExpandSidebar('chat');
                  }}
                  title="Live Chat"
                  aria-label="Live Chat"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H8l-5 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    handleExpandSidebar('files');
                  }}
                  title="Files"
                  aria-label="Files"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    handleExpandSidebar('members');
                  }}
                  title="Members"
                  aria-label="Members"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="8.5" cy="7" r="3" />
                    <path d="M20 8v6" />
                    <path d="M23 11h-6" />
                  </svg>
                </button>
                <button
                  onClick={() => {
                    handleExpandSidebar('artifacts');
                  }}
                  title="Artifacts"
                  aria-label="Artifacts"
                  className="flex h-11 w-11 items-center justify-center rounded-xl border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
                >
                  <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="16" rx="2" />
                    <path d="M7 8h10" />
                    <path d="M7 12h10" />
                    <path d="M7 16h6" />
                  </svg>
                </button>
              </div>

              <div className="h-11 w-11 rounded-xl border border-transparent" />
            </div>
          ) : (
          <>
          <div className="mb-4 flex items-center gap-2">
            <div
              ref={sidebarTabsRef}
              className="relative flex flex-1 items-center gap-1 rounded-2xl border border-white/6 bg-white/2 p-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
            >
              <div
                aria-hidden="true"
                className="absolute inset-y-1 rounded-xl bg-linear-to-r from-emerald-400/16 to-cyan-400/10 ring-1 ring-emerald-300/16 shadow-[0_6px_24px_rgba(16,185,129,0.08)] transition-all duration-300 ease-out"
                style={{
                  left: `${sidebarIndicatorStyle.left}px`,
                  width: `${sidebarIndicatorStyle.width}px`,
                  opacity: sidebarIndicatorStyle.opacity,
                }}
              />
              {sidebarTabs.map((tab) => (
                <button
                  key={tab.id}
                  ref={(element) => {
                    sidebarTabItemRefs.current[tab.id] = element;
                  }}
                  onClick={() => {
                    setRightPanel(tab.id);
                    setLastExpandedRightPanel(tab.id);
                    preservedExpandedPanelRef.current = tab.id;
                  }}
                  className={`${sidebarTabClass(tab.id)} flex-1`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <button
              onClick={handleCollapseSidebar}
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-gray-700 bg-black/20 text-gray-300 transition hover:text-white"
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <line x1="15" y1="4" x2="15" y2="20" />
                <polyline points="11 8 8 12 11 16" />
              </svg>
            </button>
          </div>

          {activeRightPanel === 'chat' && (
            <div className="flex min-h-0 flex-1 flex-col">
              <h2 className="mb-3 text-lg font-semibold text-white">Live Chat</h2>

              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {sidebarChatMessages.map((message) => (
                  <div
                    key={message.id}
                    onClick={() => {
                      if (message.message_type === 'question') {
                        openQuestionContext(message);
                      }
                    }}
                    className={`flex items-center gap-2 rounded-lg px-2 py-2 transition ${
                      message.user_id === user?.id ? 'justify-start' : 'justify-end'
                    } ${
                      message.message_type === 'question'
                        ? 'cursor-pointer bg-sky-950/20 hover:bg-sky-900/20'
                        : message.user_id === user?.id
                          ? 'bg-emerald-950/20'
                          : 'bg-indigo-950/20'
                    }`}
                    title={message.message_type === 'question' ? 'Open AI answer context' : message.content}
                  >
                    {message.user_id === user?.id ? (
                      <>
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-gray-700 bg-black/30 text-[10px] font-semibold text-gray-300">
                          {getInitials(message.user_name)}
                        </div>
                        <p className="min-w-0 flex-1 truncate text-sm text-gray-200">
                          {message.message_type === 'question'
                            ? `${message.user_name} asked AI: ${message.content}`
                            : message.content}
                        </p>
                        <span className="shrink-0 text-[10px] text-gray-500">{new Date(message.created_at).toLocaleTimeString()}</span>
                      </>
                    ) : (
                      <>
                        <span className="shrink-0 text-[10px] text-gray-500">{new Date(message.created_at).toLocaleTimeString()}</span>
                        <p className="min-w-0 flex-1 truncate text-right text-sm text-indigo-100">
                          {message.message_type === 'question'
                            ? `${message.user_name} asked AI: ${message.content}`
                            : message.content}
                        </p>
                        <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-indigo-700 bg-indigo-900/40 text-[10px] font-semibold text-indigo-100">
                          {getInitials(message.user_name)}
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {sidebarChatMessages.length === 0 && (
                  <div className="rounded-xl border border-dashed border-gray-700 bg-black/20 p-4 text-center text-sm text-gray-500">
                    No chat messages yet.
                  </div>
                )}
              </div>

              <div className="mt-3">
                <div className="relative">
                  <textarea
                    value={sidebarChatText}
                    onChange={(event) => setSidebarChatText(event.target.value)}
                    rows={1}
                    className="max-h-28 min-h-11 w-full resize-none overflow-y-auto rounded-xl border border-gray-700 bg-black/30 px-3 py-2 pr-12 text-sm text-white outline-none focus:border-emerald-500 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
                    placeholder="Message room..."
                  />
                  <button
                    onClick={submitSidebarChat}
                    disabled={!isMember || !sidebarChatText.trim()}
                    title="Send message"
                    aria-label="Send message"
                    className="absolute right-2 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full bg-white text-black transition hover:bg-gray-200 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                  >
                    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="5" y1="12" x2="19" y2="12" />
                      <polyline points="12 5 19 12 12 19" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeRightPanel === 'files' && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <h2 className="text-lg font-semibold text-white">Shared Files</h2>

              <div className="rounded-2xl border border-gray-800 bg-black/20 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gray-500">Add your files</p>
                <FileSelector selectedFiles={contextSelection} onSelectionChange={setContextSelection} />
                <button
                  onClick={handleAddContext}
                  disabled={!isMember}
                  className="mt-3 w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
                >
                  Add To Shared Files
                </button>
              </div>

              <div className="space-y-2">
                {(room?.context_files ?? []).map((file) => {
                  const canRemove = isOwner || file.added_by_name.trim().toUpperCase() === currentUserName;
                  return (
                    <div key={file.filename} className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/20 px-3 py-3">
                      <div>
                        <p className="text-sm text-white">{file.filename}</p>
                        <p className="mt-1 text-xs text-gray-500">Uploaded by {file.added_by_name}</p>
                      </div>
                      {canRemove && (
                        <button
                          onClick={async () => {
                            await removeRoomContextFile(roomId, file.filename);
                            await hydrateRoom();
                          }}
                          className="text-xs text-red-300 hover:text-red-200"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  );
                })}

                {(room?.context_files ?? []).length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-700 bg-black/20 p-4 text-center text-sm text-gray-500">
                    No shared files yet.
                  </div>
                )}
              </div>
            </div>
          )}

          {activeRightPanel === 'members' && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <h2 className="mb-3 text-lg font-semibold text-white">Members</h2>
              <div className="space-y-2">
                {(room?.members ?? []).map((member) => {
                  const isOnline = onlineUserIds.has(member.id);
                  const memberPresenceState = presenceUserStates[member.id] ?? {};
                  const inCall = Boolean(memberPresenceState.in_call);
                  const screenSharing = Boolean(memberPresenceState.screen_sharing);
                  return (
                    <div
                      key={member.id}
                      className="flex items-center justify-between rounded-2xl border border-gray-800 bg-black/20 px-3 py-3"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-full border text-xs font-semibold ${
                            isOnline
                              ? 'border-emerald-400 bg-emerald-500/15 text-emerald-100'
                              : 'border-gray-600 bg-gray-800/40 text-gray-300'
                          }`}
                        >
                          {getInitials(member.name)}
                        </div>
                        <div>
                          <p className="text-sm text-white">
                            {member.name}
                            {room?.owner_user_id === member.id ? ' (owner)' : ''}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1.5">
                            <span className={`rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] ${isOnline ? 'border-emerald-700/70 bg-emerald-950/40 text-emerald-300' : 'border-gray-700 bg-gray-900/40 text-gray-400'}`}>
                              {isOnline ? 'online' : 'offline'}
                            </span>
                            {inCall && (
                              <span className="rounded-full border border-cyan-700/70 bg-cyan-950/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-cyan-300">
                                in call
                              </span>
                            )}
                            {screenSharing && (
                              <span className="rounded-full border border-violet-700/70 bg-violet-950/40 px-2 py-0.5 text-[10px] uppercase tracking-[0.12em] text-violet-300">
                                screen sharing
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {isMember && (
                <div className="mt-4 rounded-2xl border border-gray-800 bg-black/20 p-3">
                  <div className="mb-2 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Canvas</p>
                    <span className="text-[10px] uppercase tracking-[0.12em] text-gray-400">
                      {canvasSyncState === 'saving'
                        ? 'canvas saving'
                        : canvasSyncState === 'saved'
                          ? 'canvas saved'
                          : canvasSyncState === 'error'
                            ? 'save failed'
                            : 'idle'}
                    </span>
                  </div>

                  <div className="mb-3 rounded-xl border border-gray-700 bg-black/30 p-2 text-xs text-gray-300">
                    Draw in fullscreen canvas for the best experience. Header contains call controls.
                  </div>

                  <div className="mb-1 flex items-center justify-between">
                    <label className="text-xs uppercase tracking-[0.15em] text-gray-500">Collaborative canvas</label>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] uppercase tracking-[0.12em] text-cyan-300">{remoteCallCount} peers in call</span>
                      <button
                        onClick={() => setCanvasModalOpen(true)}
                        className="rounded-lg border border-cyan-700/70 bg-cyan-950/25 px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-cyan-200 hover:bg-cyan-900/35"
                      >
                        Fullscreen
                      </button>
                    </div>
                  </div>
                  <CollaborativeCanvas
                    strokes={canvasStrokes}
                    currentUserId={user?.id ?? 'local'}
                    currentUserName={currentUserName || 'You'}
                    remoteCursors={remoteCanvasCursors}
                    showToolbar={false}
                    disabled
                    onStrokeComplete={handleCanvasStrokeComplete}
                    onReplaceStrokes={handleCanvasReplaceStrokes}
                    onCursorMove={handleCanvasCursorMove}
                  />
                </div>
              )}
            </div>
          )}

          {activeRightPanel === 'artifacts' && (
            <div className="min-h-0 flex-1 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-white">Artifacts</h2>
                <div className="text-xs text-gray-500">{visibleArtifacts.length} saved</div>
              </div>
              <div className="max-h-[300px] space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                {visibleArtifacts.map((artifact) => (
                  <button
                    key={artifact.id}
                    onClick={() => setSelectedArtifactId(artifact.id)}
                    className={`w-full rounded-2xl border px-3 py-3 text-left ${
                      selectedArtifactId === artifact.id
                        ? 'border-emerald-500 bg-emerald-950/20'
                        : 'border-gray-800 bg-black/20'
                    }`}
                  >
                    <p className="text-sm font-semibold text-white">{artifact.title}</p>
                    <p className="mt-1 text-xs uppercase tracking-[0.2em] text-gray-500">{artifact.artifact_type}</p>
                  </button>
                ))}
                {visibleArtifacts.length === 0 && (
                  <div className="rounded-2xl border border-dashed border-gray-700 bg-black/20 p-4 text-center text-sm text-gray-500">
                    No artifacts yet.
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-gray-800 bg-black/20 p-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gray-500">Preview</p>
                <RoomArtifactViewer artifact={selectedArtifact} />
              </div>
            </div>
          )}

          {activeRightPanel === 'settings' && isOwner && (
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
              <h2 className="text-lg font-semibold text-white">Room Settings</h2>
              <input
                value={ownerRoomName}
                onChange={(event) => setOwnerRoomName(event.target.value)}
                placeholder="Room name"
                className="w-full rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  type="number"
                  min={2}
                  max={100}
                  value={ownerMaxMembers}
                  onChange={(event) => setOwnerMaxMembers(Number.parseInt(event.target.value, 10) || 5)}
                  className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
                <input
                  type="text"
                  value={ownerPassword}
                  onChange={(event) => setOwnerPassword(event.target.value)}
                  placeholder="Room password"
                  className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                />
              </div>
              <button
                onClick={handleUpdateRoom}
                disabled={working}
                className="w-full rounded-xl bg-emerald-500 px-3 py-2 text-sm font-semibold text-black hover:bg-emerald-400 disabled:opacity-60"
              >
                Update Room Settings
              </button>

              <div className="border-t border-gray-800 pt-3">
                <div className="flex gap-2">
                  <input
                    value={inviteUsername}
                    onChange={(event) => setInviteUsername(event.target.value)}
                    placeholder="Invite by unique username"
                    className="flex-1 rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <button
                    onClick={handleInvite}
                    disabled={working}
                    className="rounded-xl border border-emerald-700 px-3 py-2 text-sm text-emerald-300 hover:bg-emerald-950/40 disabled:opacity-60"
                  >
                    Invite
                  </button>
                </div>
              </div>

              <div className="border-t border-gray-800 pt-3">
                <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gray-500">Owner Member Controls</p>
                <div className="space-y-2">
                  {(room?.members ?? []).map((member) => (
                    <div key={member.id} className="flex items-center justify-between rounded-xl border border-gray-800 bg-black/20 px-3 py-2">
                      <span className="text-sm text-white">
                        {member.name}
                        {room?.owner_user_id === member.id ? ' (owner)' : ''}
                      </span>
                      {room?.owner_user_id !== member.id && (
                        <button
                          onClick={() => handleKick(member.id)}
                          disabled={working}
                          className="text-xs text-red-300 hover:text-red-200 disabled:opacity-60"
                        >
                          Kick
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <button
                onClick={handleDeleteRoom}
                disabled={working}
                className="w-full rounded-xl border border-red-900 bg-red-950/30 px-3 py-2 text-sm font-medium text-red-200 hover:bg-red-950/50 disabled:opacity-60"
              >
                Delete Room
              </button>
            </div>
          )}
          </>
          )}
        </div>
        </section>
      </div>

      {(meetingSetupOpen || (localPresenceState.in_call && meetingViewMode === 'fullscreen')) && (
        <div className="fixed inset-0 z-60 bg-[#050505]/95 p-4 sm:p-6">
          <div className="relative flex h-full w-full flex-col overflow-hidden rounded-3xl border border-gray-700 bg-[#080808] p-3 sm:p-4">
            <div className="mb-3 flex items-center justify-between">
              <div>
                <p className="text-[10px] uppercase tracking-[0.14em] text-gray-500">Meeting Room</p>
                <h3 className="text-lg font-semibold text-white">{room?.name ?? 'Study Room'}</h3>
              </div>
              <div className="flex items-center gap-2">
                {localPresenceState.in_call && (
                  <>
                    <button
                      onClick={() => setMeetingLayout('focus')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${meetingLayout === 'focus' ? 'border-cyan-700/70 bg-cyan-950/35 text-cyan-100' : 'border-gray-700 bg-black/30 text-gray-200'}`}
                    >
                      Focus
                    </button>
                    <button
                      onClick={() => setMeetingLayout('grid')}
                      className={`rounded-xl border px-3 py-2 text-xs font-semibold ${meetingLayout === 'grid' ? 'border-cyan-700/70 bg-cyan-950/35 text-cyan-100' : 'border-gray-700 bg-black/30 text-gray-200'}`}
                    >
                      Grid
                    </button>
                    <button
                      onClick={() => setMeetingViewMode('small')}
                      className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-xs font-semibold text-gray-200"
                    >
                      Small
                    </button>
                    <button
                      onClick={() => setMeetingViewMode('minimized')}
                      className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-xs font-semibold text-gray-200"
                    >
                      Minimize
                    </button>
                  </>
                )}
                <button
                  onClick={() => {
                    if (localPresenceState.in_call) {
                      setMeetingViewMode('minimized');
                    } else {
                      setMeetingSetupOpen(false);
                      setMeetingViewMode('hidden');
                    }
                  }}
                  className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-xs font-semibold text-gray-200"
                >
                  {localPresenceState.in_call ? 'Hide' : 'Close'}
                </button>
              </div>
            </div>

            <div className={`grid min-h-0 flex-1 gap-4 ${localPresenceState.in_call ? 'lg:grid-cols-[1fr_300px]' : 'lg:grid-cols-1'}`}>
              <div className="min-h-[280px] overflow-hidden rounded-2xl border border-gray-700 bg-black">
                {localPresenceState.in_call ? (
                  meetingLayout === 'focus' ? (
                    <div className="relative h-full w-full">
                      {pinnedParticipant?.isLocal ? (
                        <video
                          ref={localVideoRef}
                          autoPlay
                          muted
                          playsInline
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-zinc-900 to-zinc-800">
                          <div className="text-center">
                            <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-xl font-semibold text-gray-200">
                              {getInitials(pinnedParticipant?.name ?? 'Member')}
                            </div>
                            <p className="mt-3 text-sm text-gray-200">{pinnedParticipant?.name ?? 'Member'}</p>
                          </div>
                        </div>
                      )}
                      <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/20 to-transparent p-3">
                        <span className="rounded-full border border-gray-700 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-200">
                          {pinnedParticipant?.name ?? 'Participant'}
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="grid h-full gap-2 p-2 sm:grid-cols-2 lg:grid-cols-3">
                      {gridParticipants.map((member) => (
                        <button
                          key={`grid-${member.id}`}
                          onClick={() => {
                            setPinnedParticipantId(member.id);
                            setMeetingLayout('focus');
                          }}
                          className="group relative overflow-hidden rounded-xl border border-gray-700 bg-black text-left"
                        >
                          {member.isLocal ? (
                            <video
                              ref={localVideoRef}
                              autoPlay
                              muted
                              playsInline
                              className="h-full w-full object-cover"
                            />
                          ) : (
                            <div className="flex h-full min-h-32 w-full items-center justify-center bg-linear-to-br from-zinc-900 to-zinc-800">
                              <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-sm font-semibold text-gray-200">
                                {getInitials(member.name)}
                              </div>
                            </div>
                          )}
                          <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-gray-200">
                            {member.name}
                          </span>
                        </button>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="relative h-full w-full">
                    {hasLocalVideoPreview ? (
                      <video
                        ref={localVideoRef}
                        autoPlay
                        muted
                        playsInline
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center bg-linear-to-br from-zinc-900 to-zinc-800">
                        <p className="text-sm text-gray-400">Enable camera in setup to preview before joining.</p>
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-linear-to-t from-black/85 via-black/20 to-transparent p-3">
                      <span className="rounded-full border border-gray-700 bg-black/50 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-gray-200">
                        You (preview)
                      </span>
                    </div>
                  </div>
                )}
              </div>

              {localPresenceState.in_call && (
                <div className="flex min-h-0 flex-col rounded-2xl border border-gray-700 bg-black/30 p-3">
                  <h4 className="text-sm font-semibold text-white">Participants</h4>
                  <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                    {meetingParticipants.map((member) => (
                      <button
                        key={`strip-${member.id}`}
                        onClick={() => {
                          setPinnedParticipantId(member.id);
                          setMeetingLayout('focus');
                        }}
                        className={`w-full rounded-xl border px-2 py-2 text-left ${resolvedPinnedParticipantId === member.id ? 'border-cyan-600/70 bg-cyan-950/25' : 'border-gray-700 bg-black/30'}`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <div className="flex h-7 w-7 items-center justify-center rounded-full border border-gray-600 bg-gray-800 text-[10px] font-semibold text-gray-100">
                              {getInitials(member.name)}
                            </div>
                            <div>
                              <p className="text-xs font-semibold text-white">{member.name}</p>
                              <p className="text-[10px] uppercase tracking-[0.12em] text-gray-500">{member.isLocal ? 'you' : 'member'}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className={`h-2 w-2 rounded-full ${member.isOnline ? 'bg-emerald-400' : 'bg-gray-500'}`} />
                            {member.inCall && <span className="h-2 w-2 rounded-full bg-cyan-400" />}
                            {member.screenSharing && <span className="h-2 w-2 rounded-full bg-violet-400" />}
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {(meetingSetupOpen || localPresenceState.in_call) && (
              <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center">
                <div className="pointer-events-auto flex items-center gap-2 rounded-full border border-gray-700 bg-black/70 px-3 py-2 shadow-2xl backdrop-blur">
                  {localPresenceState.in_call ? (
                    <>
                      <button
                        onClick={() => applyPresenceState({ audio_enabled: !Boolean(localPresenceState.audio_enabled) })}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${localPresenceState.audio_enabled ? 'bg-emerald-900/35 text-emerald-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Mic
                      </button>
                      <button
                        onClick={() => applyPresenceState({ video_enabled: !Boolean(localPresenceState.video_enabled) })}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${localPresenceState.video_enabled ? 'bg-emerald-900/35 text-emerald-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Camera
                      </button>
                      <button
                        onClick={async () => {
                          const nextScreen = !Boolean(localPresenceState.screen_sharing);
                          try {
                            await startCallWithMode(nextScreen ? 'screen' : (localPresenceState.video_enabled ? 'video' : 'audio'));
                          } catch {
                            setError(nextScreen ? 'Unable to start screen sharing.' : 'Unable to stop screen sharing.');
                          }
                        }}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${localPresenceState.screen_sharing ? 'bg-violet-900/35 text-violet-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Share
                      </button>
                      <button
                        onClick={() => {
                          teardownCall();
                          applyPresenceState({ in_call: false, screen_sharing: false });
                          emitRoomEvent('call_control', { kind: 'left_call' });
                          setMeetingSetupOpen(false);
                          setMeetingViewMode('hidden');
                        }}
                        className="rounded-full bg-rose-900/45 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-rose-200"
                      >
                        End
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => setMeetingSetup((current) => ({ ...current, micOn: !current.micOn }))}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${meetingSetup.micOn ? 'bg-emerald-900/35 text-emerald-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Mic
                      </button>
                      <button
                        onClick={() => setMeetingSetup((current) => ({ ...current, cameraOn: !current.cameraOn }))}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${meetingSetup.cameraOn ? 'bg-emerald-900/35 text-emerald-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Camera
                      </button>
                      <button
                        onClick={() => setMeetingSetup((current) => ({ ...current, screenShare: !current.screenShare }))}
                        className={`rounded-full px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] ${meetingSetup.screenShare ? 'bg-violet-900/35 text-violet-200' : 'bg-gray-800 text-gray-300'}`}
                      >
                        Share
                      </button>
                      <button
                        onClick={async () => {
                          try {
                            await startMeetingFromSetup();
                          } catch {
                            setError('Unable to start meeting with selected options.');
                          }
                        }}
                        className="rounded-full border border-cyan-700/70 bg-cyan-950/35 px-3 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-100"
                      >
                        Join
                      </button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {localPresenceState.in_call && meetingViewMode === 'small' && (
        <div
          className="fixed z-60"
          style={{ left: `${vcPanelPosition.x}px`, top: `${vcPanelPosition.y}px` }}
        >
          <div className="w-72 overflow-hidden rounded-2xl border border-gray-700 bg-[#050505]/95 shadow-2xl">
            <div
              className="flex cursor-move items-center justify-between border-b border-gray-800 bg-black/40 px-3 py-2"
              onMouseDown={(event) => {
                if ((event.target as HTMLElement).closest('button')) {
                  return;
                }
                setVcPanelDragging(true);
                dragOffsetRef.current = {
                  x: event.clientX - vcPanelPosition.x,
                  y: event.clientY - vcPanelPosition.y,
                };
              }}
            >
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-cyan-200">Meeting</span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setMeetingViewMode('fullscreen')}
                  className="rounded-md border border-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-800"
                >
                  Full
                </button>
                <button
                  onClick={() => setMeetingViewMode('minimized')}
                  className="rounded-md border border-gray-700 px-2 py-1 text-[10px] text-gray-200 hover:bg-gray-800"
                >
                  Min
                </button>
              </div>
            </div>

            <div className="p-2">
              <div className="relative h-36 overflow-hidden rounded-xl border border-gray-700 bg-black">
                <video
                  ref={localVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                <span className="absolute bottom-1 left-1 rounded bg-black/75 px-1.5 py-0.5 text-[10px] text-gray-200">
                  You ({activeCallMode ?? 'call'})
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {localPresenceState.in_call && meetingViewMode === 'minimized' && (
        <button
          onClick={() => setMeetingViewMode('small')}
          className="fixed bottom-4 right-4 z-60 rounded-full border border-cyan-700/70 bg-black/85 px-4 py-2 text-xs font-semibold uppercase tracking-[0.12em] text-cyan-200 shadow-2xl"
        >
          Meeting ({remoteCallCount})
        </button>
      )}

      {canvasModalOpen && (
        <div
          className="fixed inset-0 z-70 flex items-center justify-center bg-black/80 p-3 sm:p-6"
          onClick={() => setCanvasModalOpen(false)}
        >
          <div
            className="flex h-[92vh] w-[96vw] max-w-[1600px] flex-col rounded-3xl border border-gray-700 bg-[#050505] p-4"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-white">Collaborative Canvas</h3>
                <p className="text-xs uppercase tracking-[0.12em] text-gray-500">Realtime shared whiteboard</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="rounded-full border border-gray-700 bg-black/40 px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cyan-300">
                  {canvasSyncState}
                </span>
                <button
                  onClick={() => setCanvasModalOpen(false)}
                  className="rounded-xl border border-gray-700 bg-black/30 px-3 py-2 text-xs font-semibold text-gray-200 hover:bg-gray-800"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="min-h-0 flex-1 rounded-2xl border border-gray-800 bg-black/30 p-3">
              <CollaborativeCanvas
                strokes={canvasStrokes}
                currentUserId={user?.id ?? 'local'}
                currentUserName={currentUserName || 'You'}
                remoteCursors={remoteCanvasCursors}
                className="relative h-full w-full overflow-hidden rounded-xl border border-gray-700 bg-[#0a0a0a]"
                disabled={!isMember}
                onStrokeComplete={handleCanvasStrokeComplete}
                onReplaceStrokes={handleCanvasReplaceStrokes}
                onCursorMove={handleCanvasCursorMove}
              />
            </div>

            <div className="mt-3 rounded-xl border border-gray-800 bg-black/30 p-2">
              <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gray-500">Realtime activity</p>
              {recentRealtimeEvents.length > 0 ? (
                <div className="grid gap-1 sm:grid-cols-2">
                  {recentRealtimeEvents.map((item, index) => (
                    <p key={`modal-${index}-${item}`} className="text-xs text-gray-300">{item}</p>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-gray-500">No recent call/canvas events yet.</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
