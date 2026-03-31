import type {
  AuthLoginRequest,
  AuthLogoutRequest,
  AuthRefreshRequest,
  AdminRoomUpdateRequest,
  AdminRoomsResponse,
  AdminUserUpdateRequest,
  AdminUsersResponse,
  AuthRegisterRequest,
  AuthSession,
  HealthResponse,
  FileStatusResponse,
  UploadResponse,
  QueryRequest,
  QueryResponse,
  DeepQueryRequest,
  DeepQueryResponse,
  SummarizeRequest,
  SummarizeResponse,
  GenerateRequest,
  FAQResponse,
  QuizRequest,
  QuizResponse,
  FlashcardResponse,
  OutlineRequest,
  OutlineResponse,
  DeleteRequest,
  DeleteResponse,
  ApiError,
  Room,
  RoomActionRequest,
  RoomArtifactsResponse,
  RoomCanvasSnapshotRequest,
  RoomCanvasSnapshotResponse,
  RoomContextFilesRequest,
  RoomContextFilesResponse,
  RoomContextRemoveRequest,
  RoomCreateRequest,
  RoomInviteActionResponse,
  RoomInviteRequest,
  RoomInviteRespondRequest,
  RoomInvitesResponse,
  RoomJoinRequest,
  RoomKickRequest,
  RoomDeepQueryRequest,
  RoomListResponse,
  RoomMessage,
  RoomMessageRequest,
  RoomMessagesResponse,
  RoomQueryRequest,
  RoomUpdateRequest,
} from '@/types/api';

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
const AUTH_STORAGE_KEY = 'kb-auth-session';
const AUTH_STORAGE_PREFERENCE_KEY = 'kb-auth-storage-preference';
let refreshPromise: Promise<AuthSession> | null = null;

function isBrowser(): boolean {
  return typeof window !== 'undefined';
}

type SessionStoragePreference = 'local' | 'session';

function getStoragePreference(): SessionStoragePreference | null {
  if (!isBrowser()) {
    return null;
  }

  const preference = window.localStorage.getItem(AUTH_STORAGE_PREFERENCE_KEY);
  if (preference === 'local' || preference === 'session') {
    return preference;
  }
  return null;
}

function getStorageByPreference(preference: SessionStoragePreference) {
  return preference === 'local' ? window.localStorage : window.sessionStorage;
}

export function getStoredSession(): AuthSession | null {
  if (!isBrowser()) {
    return null;
  }

  const preferred = getStoragePreference();
  const storages = preferred
    ? [getStorageByPreference(preferred), getStorageByPreference(preferred === 'local' ? 'session' : 'local')]
    : [window.sessionStorage, window.localStorage];

  for (const storage of storages) {
    const raw = storage.getItem(AUTH_STORAGE_KEY);
    if (!raw) {
      continue;
    }
    try {
      return JSON.parse(raw) as AuthSession;
    } catch {
      storage.removeItem(AUTH_STORAGE_KEY);
    }
  }
  return null;
}

export function persistSession(session: AuthSession, remember: boolean = true): void {
  if (!isBrowser()) {
    return;
  }
  const primaryStorage = remember ? window.localStorage : window.sessionStorage;
  const secondaryStorage = remember ? window.sessionStorage : window.localStorage;
  secondaryStorage.removeItem(AUTH_STORAGE_KEY);
  primaryStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(session));
  window.localStorage.setItem(
    AUTH_STORAGE_PREFERENCE_KEY,
    remember ? 'local' : 'session',
  );
}

export function clearSession(): void {
  if (!isBrowser()) {
    return;
  }
  window.localStorage.removeItem(AUTH_STORAGE_KEY);
  window.sessionStorage.removeItem(AUTH_STORAGE_KEY);
  window.localStorage.removeItem(AUTH_STORAGE_PREFERENCE_KEY);
}

export function getAccessToken(): string | null {
  return getStoredSession()?.access_token ?? null;
}

export function getCurrentUser() {
  return getStoredSession()?.user ?? null;
}

export function getRoomWebSocketUrl(roomId: string, accessToken: string): string {
  const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
  const socketBase = baseUrl.startsWith('https://')
    ? baseUrl.replace('https://', 'wss://')
    : baseUrl.replace('http://', 'ws://');
  return `${socketBase}/rooms/${roomId}/ws?token=${encodeURIComponent(accessToken)}`;
}

async function refreshSession(): Promise<AuthSession> {
  if (refreshPromise) {
    return refreshPromise;
  }

  const session = getStoredSession();
  if (!session?.refresh_token) {
    throw new Error('Authentication required.');
  }

  refreshPromise = fetch(`${API_BASE_URL}/auth/refresh`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: session.refresh_token } satisfies AuthRefreshRequest),
  })
    .then(async (response) => {
      if (!response.ok) {
        clearSession();
        let errorMessage = 'Session refresh failed.';
        try {
          const errorData: ApiError = await response.json();
          errorMessage = errorData.detail || errorMessage;
        } catch {}
        throw new Error(errorMessage);
      }
      const nextSession = (await response.json()) as AuthSession;
      persistSession(nextSession, getStoragePreference() !== 'session');
      return nextSession;
    })
    .finally(() => {
      refreshPromise = null;
    });

  return refreshPromise;
}

/**
 * Generic API request handler with error handling
 */
async function apiRequest<T>(
  endpoint: string,
  options: RequestInit = {},
  retryOnAuthError: boolean = true,
): Promise<T> {
  const url = `${API_BASE_URL}${endpoint}`;
  const accessToken = getAccessToken();
  
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
        ...options.headers,
      },
    });

    if (response.status === 401 && retryOnAuthError && !endpoint.startsWith('/auth/')) {
      const refreshed = await refreshSession();
      return apiRequest<T>(
        endpoint,
        {
          ...options,
          headers: {
            ...(options.headers || {}),
            Authorization: `Bearer ${refreshed.access_token}`,
          },
        },
        false,
      );
    }

    if (!response.ok) {
      let errorMessage = `HTTP error! status: ${response.status}`;
      try {
        const errorData: ApiError = await response.json();
        errorMessage = errorData.detail || errorMessage;
      } catch {
        // If error response is not JSON, use status text
        errorMessage = response.statusText || errorMessage;
      }

      // Handle specific error codes
      if (response.status === 404) {
        throw new Error(`Not found: ${errorMessage}`);
      } else if (response.status === 503) {
        throw new Error(`Service unavailable: ${errorMessage}`);
      } else if (response.status === 500) {
        throw new Error(`Server error: ${errorMessage}`);
      } else {
        throw new Error(errorMessage);
      }
    }

    return await response.json();
  } catch (error) {
    if (error instanceof Error) {
      throw error;
    }
    throw new Error('An unexpected error occurred');
  }
}

export async function register(
  email: string,
  display_name: string,
  password: string,
): Promise<AuthSession> {
  const payload: AuthRegisterRequest = { email, display_name, password };
  const session = await apiRequest<AuthSession>('/auth/register', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, false);
  persistSession(session, true);
  return session;
}

export async function login(
  email: string,
  password: string,
  remember: boolean = true,
): Promise<AuthSession> {
  const payload: AuthLoginRequest = { email, password };
  const session = await apiRequest<AuthSession>('/auth/login', {
    method: 'POST',
    body: JSON.stringify(payload),
  }, false);
  persistSession(session, remember);
  return session;
}

export function updateSessionPersistence(remember: boolean): void {
  const session = getStoredSession();
  if (!session || !isBrowser()) {
    return;
  }
  persistSession(session, remember);
}

export async function fetchCurrentUser() {
  return apiRequest<AuthSession['user']>('/auth/me');
}

export async function logout(): Promise<void> {
  const session = getStoredSession();
  if (!session) {
    clearSession();
    return;
  }

  const payload: AuthLogoutRequest = { refresh_token: session.refresh_token };
  try {
    await apiRequest<{ ok: boolean }>('/auth/logout', {
      method: 'POST',
      body: JSON.stringify(payload),
    }, false);
  } finally {
    clearSession();
  }
}

export async function listAdminUsers(): Promise<AdminUsersResponse> {
  return apiRequest<AdminUsersResponse>('/admin/users');
}

export async function updateAdminUser(
  userId: string,
  payload: AdminUserUpdateRequest,
) {
  return apiRequest(`/admin/users/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminUser(userId: string) {
  return apiRequest<{ ok: boolean; user_id: string }>(`/admin/users/${userId}`, {
    method: 'DELETE',
  });
}

export async function listAdminRooms(): Promise<AdminRoomsResponse> {
  return apiRequest<AdminRoomsResponse>('/admin/rooms');
}

export async function updateAdminRoom(
  roomId: string,
  payload: AdminRoomUpdateRequest,
) {
  return apiRequest(`/admin/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteAdminRoom(roomId: string) {
  return apiRequest<{ ok: boolean; room_id: string }>(`/admin/rooms/${roomId}`, {
    method: 'DELETE',
  });
}

/**
 * Upload files to the knowledge base
 */
export async function uploadFiles(files: File[]): Promise<UploadResponse> {
  const formData = new FormData();
  files.forEach((file) => {
    formData.append('files', file);
  });

  const url = `${API_BASE_URL}/upload`;
  const accessToken = getAccessToken();
  const response = await fetch(url, {
    method: 'POST',
    body: formData,
    headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : undefined,
  });

  if (!response.ok) {
    let errorMessage = `HTTP error! status: ${response.status}`;
    try {
      const errorData: ApiError = await response.json();
      errorMessage = errorData.detail || errorMessage;
    } catch {
      errorMessage = response.statusText || errorMessage;
    }
    throw new Error(errorMessage);
  }

  return await response.json();
}

/**
 * Check API health status
 */
export async function checkHealth(): Promise<HealthResponse> {
  return apiRequest<HealthResponse>('/health');
}

/**
 * Get file processing status
 */
export async function getFileStatus(): Promise<FileStatusResponse> {
  const cacheBust = Date.now();
  return apiRequest<FileStatusResponse>(`/file_status?_t=${cacheBust}`, {
    cache: 'no-store',
    headers: {
      'Cache-Control': 'no-cache, no-store, must-revalidate',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}

/**
 * Query the knowledge base
 */
export async function query(query: string, top_k: number = 5): Promise<QueryResponse> {
  const payload: QueryRequest = { query, top_k };
  return apiRequest<QueryResponse>('/query', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Deep query the knowledge base with multi-turn reasoning
 */
export async function deepQuery(
  query: string,
  top_k: number = 5,
  create_graph: boolean = false
): Promise<DeepQueryResponse> {
  const payload: DeepQueryRequest = { query, top_k, create_graph };
  return apiRequest<DeepQueryResponse>('/deepquery', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Generate outline(s) for documents
 */
export async function generateOutline(
  filenames: string[],
  combine: boolean = false
): Promise<OutlineResponse> {
  const payload: OutlineRequest = { filenames, combine };
  return apiRequest<OutlineResponse>('/generate_outline', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Summarize documents
 */
export async function summarize(filenames: string[]): Promise<SummarizeResponse> {
  const payload: SummarizeRequest = { filenames };
  return apiRequest<SummarizeResponse>('/summarize', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Generate FAQ for documents
 */
export async function generateFAQ(filenames: string[]): Promise<FAQResponse> {
  const payload: GenerateRequest = { filenames };
  return apiRequest<FAQResponse>('/generate_faq', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Generate quiz for documents
 */
export async function generateQuiz(
  filenames: string[],
  question_type: 'mcq' | 'short' = 'mcq',
  count: number = 10
): Promise<QuizResponse> {
  const payload: QuizRequest = { filenames, question_type, count };
  return apiRequest<QuizResponse>('/generate_quiz', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Generate flashcards for documents
 */
export async function generateFlashcards(filenames: string[]): Promise<FlashcardResponse> {
  const payload: GenerateRequest = { filenames };
  return apiRequest<FlashcardResponse>('/generate_flashcards', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

/**
 * Delete files from the knowledge base
 */
export async function deleteFiles(filenames: string[]): Promise<DeleteResponse> {
  const payload: DeleteRequest = { filenames };
  return apiRequest<DeleteResponse>('/delete', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listRooms(): Promise<RoomListResponse> {
  return apiRequest<RoomListResponse>('/rooms');
}

export async function createRoom(
  name: string,
  max_members: number = 5,
  password: string,
): Promise<Room> {
  const payload: RoomCreateRequest = { name, max_members, password };
  return apiRequest<Room>('/rooms', {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function getRoom(roomId: string): Promise<Room> {
  return apiRequest<Room>(`/rooms/${roomId}`);
}

export async function joinRoom(roomId: string, password?: string): Promise<Room> {
  const payload: RoomJoinRequest = password ? { password } : {};
  return apiRequest<Room>(`/rooms/${roomId}/join`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function leaveRoom(roomId: string): Promise<Room> {
  return apiRequest<Room>(`/rooms/${roomId}/leave`, {
    method: 'POST',
  });
}

export async function updateRoom(
  roomId: string,
  payload: RoomUpdateRequest,
): Promise<Room> {
  return apiRequest<Room>(`/rooms/${roomId}`, {
    method: 'PATCH',
    body: JSON.stringify(payload),
  });
}

export async function deleteRoom(roomId: string): Promise<{ ok: boolean; room_id: string }> {
  return apiRequest<{ ok: boolean; room_id: string }>(`/rooms/${roomId}`, {
    method: 'DELETE',
  });
}

export async function kickRoomMember(roomId: string, userId: string): Promise<Room> {
  const payload: RoomKickRequest = { user_id: userId };
  return apiRequest<Room>(`/rooms/${roomId}/kick`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function inviteToRoom(roomId: string, username: string): Promise<RoomInviteActionResponse> {
  const payload: RoomInviteRequest = { username };
  return apiRequest<RoomInviteActionResponse>(`/rooms/${roomId}/invite`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listReceivedRoomInvites(): Promise<RoomInvitesResponse> {
  return apiRequest<RoomInvitesResponse>('/rooms/invites/received');
}

export async function respondRoomInvite(
  inviteId: string,
  accept: boolean,
): Promise<RoomInviteActionResponse> {
  const payload: RoomInviteRespondRequest = { accept };
  return apiRequest<RoomInviteActionResponse>(`/rooms/invites/${inviteId}/respond`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listRoomMessages(roomId: string): Promise<RoomMessagesResponse> {
  return apiRequest<RoomMessagesResponse>(`/rooms/${roomId}/messages`);
}

export async function postRoomMessage(
  roomId: string,
  content: string,
  message_type: string = 'chat'
): Promise<RoomMessage> {
  const payload: RoomMessageRequest = { content, message_type };
  return apiRequest<RoomMessage>(`/rooms/${roomId}/messages`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listRoomContextFiles(roomId: string): Promise<RoomContextFilesResponse> {
  return apiRequest<RoomContextFilesResponse>(`/rooms/${roomId}/context/files`);
}

export async function addRoomContextFiles(
  roomId: string,
  filenames: string[]
): Promise<RoomContextFilesResponse> {
  const payload: RoomContextFilesRequest = { filenames };
  return apiRequest<RoomContextFilesResponse>(`/rooms/${roomId}/context/files`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function removeRoomContextFile(
  roomId: string,
  filename: string
): Promise<RoomContextFilesResponse> {
  const payload: RoomContextRemoveRequest = { filename };
  return apiRequest<RoomContextFilesResponse>(`/rooms/${roomId}/context/files/remove`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function listRoomArtifacts(roomId: string): Promise<RoomArtifactsResponse> {
  return apiRequest<RoomArtifactsResponse>(`/rooms/${roomId}/artifacts`);
}

export async function getRoomCanvasSnapshot(roomId: string): Promise<RoomCanvasSnapshotResponse> {
  return apiRequest<RoomCanvasSnapshotResponse>(`/rooms/${roomId}/canvas/snapshot`);
}

export async function saveRoomCanvasSnapshot(
  roomId: string,
  payload: RoomCanvasSnapshotRequest,
): Promise<RoomCanvasSnapshotResponse> {
  return apiRequest<RoomCanvasSnapshotResponse>(`/rooms/${roomId}/canvas/snapshot`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function roomQuery(
  roomId: string,
  query: string,
  top_k: number = 5
): Promise<DeepQueryResponse | QueryResponse> {
  const payload: RoomQueryRequest = { query, top_k };
  return apiRequest<QueryResponse>(`/rooms/${roomId}/actions/query`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function roomDeepQuery(
  roomId: string,
  query: string,
  top_k: number = 5,
  create_graph: boolean = false
): Promise<DeepQueryResponse> {
  const payload: RoomDeepQueryRequest = { query, top_k, create_graph };
  return apiRequest<DeepQueryResponse>(`/rooms/${roomId}/actions/deepquery`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

async function roomAction<T>(
  roomId: string,
  action: string,
  payload: RoomActionRequest
): Promise<T> {
  return apiRequest<T>(`/rooms/${roomId}/actions/${action}`, {
    method: 'POST',
    body: JSON.stringify(payload),
  });
}

export async function roomSummarize(
  roomId: string,
  payload: RoomActionRequest
): Promise<SummarizeResponse> {
  return roomAction<SummarizeResponse>(roomId, 'summarize', payload);
}

export async function roomFAQ(roomId: string, payload: RoomActionRequest): Promise<FAQResponse> {
  return roomAction<FAQResponse>(roomId, 'faq', payload);
}

export async function roomFlashcards(
  roomId: string,
  payload: RoomActionRequest
): Promise<FlashcardResponse> {
  return roomAction<FlashcardResponse>(roomId, 'flashcards', payload);
}

export async function roomQuiz(roomId: string, payload: RoomActionRequest): Promise<QuizResponse> {
  return roomAction<QuizResponse>(roomId, 'quiz', payload);
}

export async function roomOutline(
  roomId: string,
  payload: RoomActionRequest
): Promise<OutlineResponse> {
  return roomAction<OutlineResponse>(roomId, 'outline', payload);
}
