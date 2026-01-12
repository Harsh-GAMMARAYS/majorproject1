'use client';

import { useState, useEffect } from 'react';
import { deepQuery } from '@/lib/api';
import type { DeepQueryResponse } from '@/types/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import BackButton from '@/components/BackButton';
import KnowledgeGraphVisualization from '@/components/KnowledgeGraphVisualization';
import MarkdownRenderer from '@/components/MarkdownRenderer';

export default function GraphPage() {
  const [queryText, setQueryText] = useState('');
  const [topK, setTopK] = useState(5);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [response, setResponse] = useState<DeepQueryResponse | null>(null);

  const handleGenerateGraph = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!queryText.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setResponse(null);

    try {
      const result = await deepQuery(queryText, topK, true);
      setResponse(result);
      
      if (!result.graph_data && !result.graph_location) {
        setError('No knowledge graph could be generated from the query results');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate knowledge graph');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Knowledge Graph Explorer</h1>
        <p className="text-gray-400">
          Generate interactive knowledge graphs from your queries to explore entity relationships
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Input Panel */}
        <div className="lg:col-span-1">
          <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 sticky top-8">
            <h2 className="text-lg font-semibold text-white mb-4">Generate Graph</h2>

            <form onSubmit={handleGenerateGraph} className="space-y-4">
              <div>
                <label
                  htmlFor="query"
                  className="block text-sm font-medium text-white mb-2"
                >
                  Query
                </label>
                <textarea
                  id="query"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  rows={6}
                  className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg focus:ring-emerald-500 focus:border-emerald-500 text-sm"
                  placeholder="Enter your query to generate a knowledge graph..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-white mb-2">
                  Top K Results: {topK}
                </label>
                <input
                  type="range"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value))}
                  className="w-full"
                />
              </div>

              <button
                type="submit"
                disabled={loading || !queryText.trim()}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
              >
                {loading ? (
                  <>
                    <LoadingSpinner size="sm" />
                    <span className="ml-2">Generating...</span>
                  </>
                ) : (
                  'Generate Graph'
                )}
              </button>
            </form>

            {error && (
              <div className="mt-4">
                <ErrorAlert message={error} onDismiss={() => setError(null)} />
              </div>
            )}

            {response && (
              <div className="mt-6 pt-6 border-t border-gray-700 space-y-3">
                <div>
                  <h3 className="text-sm font-semibold text-white mb-2">Stats</h3>
                  <div className="bg-gray-800 rounded p-3 space-y-1 text-xs text-gray-300">
                    <p>
                      <span className="font-semibold">Nodes:</span>{' '}
                      {response.graph_data?.nodes.length || 0}
                    </p>
                    <p>
                      <span className="font-semibold">Edges:</span>{' '}
                      {response.graph_data?.edges.length || 0}
                    </p>
                    <p>
                      <span className="font-semibold">Sub-queries:</span>{' '}
                      {response.sub_queries.length}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Visualization Panel */}
        <div className="lg:col-span-3">
          {response && response.graph_data ? (
            <div className="space-y-6">
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6">
                <KnowledgeGraphVisualization
                  graphData={response.graph_data}
                  htmlFallbackUrl={
                    response.graph_location
                      ? `${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}${response.graph_location}`
                      : undefined
                  }
                  title="Interactive Knowledge Graph"
                />
              </div>

              {/* Sub-queries and Answer */}
              <div className="bg-gray-900 border border-gray-800 rounded-lg p-6 space-y-4">
                {response.sub_queries.length > 0 && (
                  <div>
                    <h3 className="text-sm font-semibold text-white mb-2">Sub-Queries</h3>
                    <ul className="space-y-2">
                      {response.sub_queries.map((subQuery, index) => (
                        <li
                          key={index}
                          className="text-sm text-gray-300 bg-gray-800 p-2 rounded border border-gray-700"
                        >
                          {index + 1}. {subQuery}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="border-t border-gray-700 pt-4">
                  <h3 className="text-sm font-semibold text-white mb-2">Answer</h3>
                  <div className="text-sm text-gray-300">
                    <MarkdownRenderer content={response.answer} />
                  </div>
                </div>

                {response.context.length > 0 && (
                  <div className="border-t border-gray-700 pt-4">
                    <h3 className="text-sm font-semibold text-white mb-2">
                      Source Chunks ({response.context.length})
                    </h3>
                    <div className="max-h-40 overflow-y-auto space-y-2">
                      {response.context.map((chunk, index) => (
                        <div
                          key={index}
                          className="text-xs text-gray-400 bg-gray-800 p-2 rounded border border-gray-700 italic"
                        >
                          {chunk.substring(0, 150)}...
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-gray-900 border border-gray-800 rounded-lg p-12 text-center">
              <div className="text-gray-400 space-y-4">
                <div className="text-4xl">📊</div>
                <p>Enter a query and click "Generate Graph" to explore entity relationships</p>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
