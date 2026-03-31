'use client';

import KnowledgeGraphVisualization from '@/components/KnowledgeGraphVisualization';
import MarkdownRenderer from '@/components/MarkdownRenderer';
import type { Flashcard, GraphData, QuizQuestion, RoomArtifact, SummarizeItem, FAQItem } from '@/types/api';

interface RoomArtifactViewerProps {
  artifact: RoomArtifact | null;
}

function renderJsonBlock(value: unknown) {
  return (
    <pre className="overflow-x-auto rounded-xl border border-gray-800 bg-black/30 p-4 text-xs text-gray-300">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}

export default function RoomArtifactViewer({ artifact }: RoomArtifactViewerProps) {
  if (!artifact) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-700 bg-black/20 p-6 text-sm text-gray-400">
        Select an artifact to inspect generated outputs, graph data, and study materials.
      </div>
    );
  }

  const payload = artifact.payload as Record<string, unknown>;

  return (
    <div className="h-full space-y-4 rounded-2xl border border-gray-800 bg-[#111111] p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h3 className="text-lg font-semibold text-white">{artifact.title}</h3>
          <p className="text-xs uppercase tracking-[0.2em] text-emerald-400">{artifact.artifact_type}</p>
        </div>
        <div className="text-right text-xs text-gray-500">
          <div>{artifact.created_by_name}</div>
          <div>{new Date(artifact.created_at).toLocaleString()}</div>
        </div>
      </div>

      {'answer' in payload && typeof payload.answer === 'string' && (
        <div className="rounded-xl border border-gray-800 bg-black/20 p-4">
          <p className="mb-2 text-xs uppercase tracking-[0.2em] text-gray-500">Answer</p>
          <MarkdownRenderer content={payload.answer} />
        </div>
      )}

      {((('graph_data' in payload && Boolean(payload.graph_data)) ||
        ('graph_location' in payload && typeof payload.graph_location === 'string' && payload.graph_location.length > 0))) && (
        <KnowledgeGraphVisualization
          graphData={payload.graph_data as GraphData}
          htmlFallbackUrl={
            typeof payload.graph_location === 'string'
              ? `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}${payload.graph_location}`
              : null
          }
          title="Room Knowledge Graph"
        />
      )}

      {Array.isArray(payload.summaries) && (
        <div className="space-y-3">
          {(payload.summaries as SummarizeItem[]).map((summary) => (
            <div key={summary.filename} className="rounded-xl border border-gray-800 bg-black/20 p-4">
              <p className="mb-2 text-sm font-semibold text-white">{summary.filename}</p>
              <MarkdownRenderer content={summary.summary} />
            </div>
          ))}
        </div>
      )}

      {Array.isArray(payload.faqs) && (
        <div className="space-y-3">
          {(payload.faqs as FAQItem[]).map((faq, index) => (
            <div key={`${faq.question}-${index}`} className="rounded-xl border border-gray-800 bg-black/20 p-4">
              <p className="font-semibold text-white">{faq.question}</p>
              <p className="mt-2 text-sm text-gray-300">{faq.answer}</p>
              <p className="mt-2 text-xs text-gray-500">Source: {faq.source}</p>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(payload.quiz) && (
        <div className="space-y-3">
          {(payload.quiz as QuizQuestion[]).map((item, index) => (
            <div key={`${item.question}-${index}`} className="rounded-xl border border-gray-800 bg-black/20 p-4">
              <p className="font-semibold text-white">{index + 1}. {item.question}</p>
              {item.options && (
                <ul className="mt-2 space-y-1 text-sm text-gray-300">
                  {item.options.map((option) => (
                    <li key={option}>- {option}</li>
                  ))}
                </ul>
              )}
              <p className="mt-3 text-sm text-emerald-300">Answer: {item.answer}</p>
              <p className="mt-1 text-xs text-gray-500">Source: {item.source}</p>
            </div>
          ))}
        </div>
      )}

      {Array.isArray(payload.flashcards) && (
        <div className="grid gap-3 md:grid-cols-2">
          {(payload.flashcards as Flashcard[]).map((card, index) => (
            <div key={`${card.front}-${index}`} className="rounded-xl border border-gray-800 bg-black/20 p-4">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Front</p>
              <p className="mt-2 font-semibold text-white">{card.front}</p>
              <p className="mt-4 text-xs uppercase tracking-[0.2em] text-gray-500">Back</p>
              <p className="mt-2 text-sm text-gray-300">{card.back}</p>
              <p className="mt-3 text-xs text-gray-500">Source: {card.source}</p>
            </div>
          ))}
        </div>
      )}

      {typeof payload.combined_outline === 'string' && (
        <div className="rounded-xl border border-gray-800 bg-black/20 p-4">
          <MarkdownRenderer content={payload.combined_outline as string} />
        </div>
      )}

      {Boolean(payload.individual_outlines) && (
        <div className="space-y-3">
          {Object.entries(payload.individual_outlines as Record<string, string>).map(([filename, outline]) => (
            <div key={filename} className="rounded-xl border border-gray-800 bg-black/20 p-4">
              <p className="mb-2 text-sm font-semibold text-white">{filename}</p>
              <MarkdownRenderer content={String(outline)} />
            </div>
          ))}
        </div>
      )}

      {!('answer' in payload) &&
        !Array.isArray(payload.summaries) &&
        !Array.isArray(payload.faqs) &&
        !Array.isArray(payload.quiz) &&
        !Array.isArray(payload.flashcards) &&
        !payload.combined_outline &&
        !payload.individual_outlines &&
        !payload.graph_data &&
        renderJsonBlock(payload)}
    </div>
  );
}
