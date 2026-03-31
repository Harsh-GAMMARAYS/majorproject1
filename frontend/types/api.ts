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

