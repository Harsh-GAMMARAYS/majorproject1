// API Request Types
export interface QueryRequest {
  query: string;
  top_k: number;
}

export interface DeepQueryRequest extends QueryRequest {
  create_graph: boolean;
}

export interface SummarizeRequest {
  filenames: string[];
}

export interface GenerateRequest {
  filenames: string[];
}

export interface QuizRequest extends GenerateRequest {
  question_type: 'mcq' | 'short';
  count: number;
}

export interface OutlineRequest extends GenerateRequest {
  combine: boolean;
}

export interface DeleteRequest {
  filenames: string[];
}

export interface RoomCreateRequest {
  name: string;
  max_members: number;
  password: string;
}

export interface RoomJoinRequest {
  password?: string;
}

export interface RoomUpdateRequest {
  name?: string;
  max_members?: number;
  password?: string;
  clear_password?: boolean;
}

export interface RoomInviteRequest {
  username: string;
}

export interface RoomInviteRespondRequest {
  accept: boolean;
}

export interface RoomKickRequest {
  user_id: string;
}

export interface AdminUserUpdateRequest {
  display_name?: string;
  email?: string;
  is_active?: boolean;
}

export interface AdminRoomUpdateRequest {
  name?: string;
  max_members?: number;
}

export interface AuthRegisterRequest {
  email: string;
  display_name: string;
  password: string;
}

export interface AuthLoginRequest {
  email: string;
  password: string;
}

export interface AuthRefreshRequest {
  refresh_token: string;
}

export interface AuthLogoutRequest {
  refresh_token: string;
}

export interface RoomMessageRequest {
  content: string;
  message_type?: string;
}

export interface RoomContextFilesRequest {
  filenames: string[];
}

export interface RoomContextRemoveRequest {
  filename: string;
}

export interface RoomActionRequest {
  filenames?: string[];
  combine?: boolean;
  question_type?: 'mcq' | 'short';
  count?: number;
}

export interface RoomQueryRequest {
  query: string;
  top_k: number;
}

export interface RoomDeepQueryRequest extends RoomQueryRequest {
  create_graph: boolean;
}

export interface RoomCanvasSnapshotRequest {
  board: Record<string, unknown>;
  title?: string;
}

// API Response Types
export interface HealthResponse {
  status: 'healthy';
}

export interface FileStatusItem {
  status: 'processed' | 'pending' | 'error';
  timestamp?: string;
  message?: string;
}

export type FileStatusResponse = Record<string, FileStatusItem>;

export interface UploadResponse {
  message: string;
  detail: string;
}

export interface QueryResponse {
  answer: string;
  context: string[];
  filenames?: string[];
}

export interface GraphNode {
  id: string;
  label: string;
  title: string;
}

export interface GraphEdge {
  from: string;
  to: string;
  label: string;
  title: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DeepQueryResponse extends QueryResponse {
  sub_queries: string[];
  graph_location: string | null;
  graph_data?: GraphData | null;
}

export interface RoomUser {
  id: string;
  name?: string;
  display_name?: string;
  email?: string;
  is_active?: boolean;
  is_admin?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface AdminCreatedRoomSummary {
  id: string;
  name: string;
}

export interface AdminUserSummary extends RoomUser {
  created_room_count: number;
  created_rooms: AdminCreatedRoomSummary[];
  joined_room_count: number;
  context_file_count: number;
  message_count: number;
  artifact_count: number;
  uploaded_file_count: number;
  last_seen_at?: string;
  is_online?: boolean;
}

export interface AdminRoomSummary extends Room {
  owner_email?: string;
  context_file_count: number;
  message_count: number;
  artifact_count: number;
}

export interface RoomMember {
  id: string;
  name: string;
  joined_at: string;
}

export interface RoomContextFile {
  filename: string;
  added_at: string;
  added_by_name: string;
}

export interface RoomInvite {
  id: string;
  room_id: string;
  room_name?: string;
  owner_user_id?: string;
  owner_name?: string;
  inviter_user_id: string;
  inviter_name: string;
  invitee_user_id: string;
  invitee_name: string;
  status: 'pending' | 'accepted' | 'declined' | 'cancelled';
  created_at: string;
  responded_at?: string | null;
  room_has_password?: boolean;
}

export interface RoomMessage {
  id: string;
  room_id: string;
  user_id: string;
  user_name: string;
  message_type: string;
  content: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface RoomArtifact {
  id: string;
  room_id: string;
  artifact_type: string;
  title: string;
  payload: Record<string, unknown>;
  created_by: string;
  created_by_name: string;
  created_at: string;
}

export interface Room {
  id: string;
  name: string;
  owner_user_id: string;
  owner_name: string;
  max_members: number;
  member_count: number;
  created_at: string;
  updated_at?: string;
  has_password?: boolean;
  password?: string | null;
  members?: RoomMember[];
  context_files?: RoomContextFile[];
  artifacts?: RoomArtifact[];
  pending_invites?: RoomInvite[];
}

export interface AuthSession {
  access_token: string;
  refresh_token: string;
  token_type: 'bearer';
  user: RoomUser;
}

export interface RoomPresenceMemberState {
  in_call?: boolean;
  screen_sharing?: boolean;
  video_enabled?: boolean;
  audio_enabled?: boolean;
}

export interface RoomPresence {
  room_id: string;
  active_user_ids: string[];
  active_count: number;
  active_connection_count?: number;
  active_user_states?: Record<string, RoomPresenceMemberState>;
}

export interface RoomSnapshotEvent {
  room: Room;
  messages: RoomMessage[];
  artifacts: RoomArtifact[];
  presence: RoomPresence;
}

export interface RoomEventEnvelope<T = Record<string, unknown>> {
  event: string;
  payload: T;
}

export interface RoomListResponse {
  rooms: Room[];
}

export interface RoomInvitesResponse {
  invites: RoomInvite[];
}

export interface RoomInviteActionResponse {
  invite: RoomInvite;
  room: Room;
}

export interface AdminUsersResponse {
  users: AdminUserSummary[];
}

export interface AdminRoomsResponse {
  rooms: AdminRoomSummary[];
}

export interface RoomMessagesResponse {
  messages: RoomMessage[];
}

export interface RoomArtifactsResponse {
  artifacts: RoomArtifact[];
}

export interface RoomCanvasSnapshotResponse {
  artifact: RoomArtifact | null;
}

export interface RoomContextFilesResponse {
  files: RoomContextFile[];
}

export interface SummarizeItem {
  filename: string;
  summary: string;
}

export interface SummarizeResponse {
  summaries: SummarizeItem[];
}

export interface FAQItem {
  question: string;
  answer: string;
  source: string;
}

export interface FAQResponse {
  faqs: FAQItem[];
}

export interface QuizQuestion {
  question: string;
  options?: string[];
  answer: string;
  source: string;
}

export interface QuizResponse {
  quiz: QuizQuestion[];
}

export interface Flashcard {
  front: string;
  back: string;
  source: string;
}

export interface FlashcardResponse {
  flashcards: Flashcard[];
}

export interface OutlineResponse {
  individual_outlines?: Record<string, string>;
  combined_outline?: string;
}

export interface DeleteResponse {
  message: string;
  deleted_files?: number;
  errors?: string[];
}

// API Error Types
export interface ApiError {
  detail: string;
}
