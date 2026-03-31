'use client';

import { useState } from 'react';
import { query, deepQuery } from '@/lib/api';
import type { QueryResponse, DeepQueryResponse } from '@/types/api';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import BackButton from '@/components/BackButton';
import KnowledgeGraphVisualization from '@/components/KnowledgeGraphVisualization';
import MarkdownRenderer from '@/components/MarkdownRenderer';

export default function QueryPage() {
  const [activeTab, setActiveTab] = useState<'simple' | 'deep'>('simple');
  const [queryText, setQueryText] = useState('');
  const [topK, setTopK] = useState(5);
  const [createGraph, setCreateGraph] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [simpleResponse, setSimpleResponse] = useState<QueryResponse | null>(null);
  const [deepResponse, setDeepResponse] = useState<DeepQueryResponse | null>(null);
  const [showGraph, setShowGraph] = useState(false);


  const handleSimpleQuery = async () => {
    if (!queryText.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setSimpleResponse(null);

    try {
      const response = await query(queryText, topK);
      setSimpleResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const handleDeepQuery = async () => {
    if (!queryText.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setDeepResponse(null);

    try {
      const response = await deepQuery(queryText, topK, createGraph);
      setDeepResponse(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to perform deep query');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (activeTab === 'simple') {
      handleSimpleQuery();
    } else {
      handleDeepQuery();
    }
  };

  const renderGraph = (graphLocation: string | null, graphData: any) => {
    if (!graphLocation && !graphData) return null;

    const baseUrl = process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000';
    const graphUrl = graphLocation?.startsWith('http')
      ? graphLocation
      : graphLocation ? `${baseUrl}${graphLocation}` : null;

    return (
      <div className="border-t border-gray-800 pt-6">
        <KnowledgeGraphVisualization
          graphData={graphData}
          htmlFallbackUrl={graphUrl}
          title="Knowledge Graph Visualization"
        />
      </div>
    );
  };


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <BackButton />
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-white mb-2">Query Knowledge Base</h1>
        <p className="text-gray-400">
          Ask questions and get answers from your uploaded documents
        </p>
      </div>

      <div className="bg-gray-900 border border-gray-800 rounded-lg shadow">
        {/* Tabs */}
        <div className="border-b border-gray-800">
          <nav className="flex -mb-px">
            <button
              onClick={() => {
                setActiveTab('simple');
                setError(null);
                setSimpleResponse(null);
                setDeepResponse(null);
              }}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'simple'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              Simple Query
            </button>
            <button
              onClick={() => {
                setActiveTab('deep');
                setError(null);
                setSimpleResponse(null);
                setDeepResponse(null);
              }}
              className={`py-4 px-6 border-b-2 font-medium text-sm ${
                activeTab === 'deep'
                  ? 'border-emerald-400 text-white'
                  : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-600'
              }`}
            >
              Deep Query
            </button>
          </nav>
        </div>

        <div className="p-6">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label
                htmlFor="query"
                className="block text-sm font-medium text-white mb-2"
              >
                Your Question
              </label>
              <textarea
                id="query"
                value={queryText}
                onChange={(e) => setQueryText(e.target.value)}
                rows={4}
                className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                placeholder="Enter your question here..."
              />
            </div>

            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Top K:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                  className="w-20 px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg"
                />
              </label>

              {activeTab === 'deep' && (
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={createGraph}
                    onChange={(e) => setCreateGraph(e.target.checked)}
                    className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500"
                  />
                  <span className="text-sm text-white">Create Knowledge Graph</span>
                </label>
              )}
            </div>

            <button
              type="submit"
              disabled={loading}
                className="w-full bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
            >
              {loading ? (
                <>
                  <LoadingSpinner size="sm" />
                  <span className="ml-2">Querying...</span>
                </>
              ) : (
                'Submit Query'
              )}
            </button>
          </form>

          {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

          {/* Simple Query Results */}
          {activeTab === 'simple' && simpleResponse && (
            <div className="mt-6 space-y-4">
              <div className="border-t border-gray-800 pt-6">
                <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-gray-200">
                  <MarkdownRenderer content={simpleResponse.answer} />
                </div>
              </div>

              {simpleResponse.context.length > 0 && (
                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Context ({simpleResponse.context.length} chunks)
                  </h3>
                  <div className="space-y-3">
                    {simpleResponse.context.map((chunk, index) => (
                      <div
                        key={index}
                        className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                      >
                        <p className="text-sm text-gray-200 whitespace-pre-wrap">{chunk}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Deep Query Results */}
          {activeTab === 'deep' && deepResponse && (
            <div className="mt-6 space-y-4">
              {deepResponse.sub_queries.length > 0 && (
                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-2">Sub-queries</h3>
                  <ul className="list-disc list-inside space-y-1">
                    {deepResponse.sub_queries.map((subQuery, index) => (
                      <li key={index} className="text-gray-300">
                        {subQuery}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <div className="border-t border-gray-800 pt-6">
                <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
                <div className="bg-gray-800 rounded-lg p-4 border border-gray-700 text-gray-200">
                  <MarkdownRenderer content={deepResponse.answer} />
                </div>
              </div>

              {deepResponse.context.length > 0 && (
                <div className="border-t border-gray-800 pt-6">
                  <h3 className="text-lg font-semibold text-white mb-2">
                    Context ({deepResponse.context.length} chunks)
                  </h3>
                  <div className="space-y-3">
                    {deepResponse.context.map((chunk, index) => (
                      <div
                        key={index}
                        className="bg-gray-800 rounded-lg p-4 border border-gray-700"
                      >
                        <p className="text-sm text-gray-200 whitespace-pre-wrap">{chunk}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {deepResponse.graph_location && (
                <div className="border-t border-gray-800 pt-6">
                  <button
                    onClick={() => setShowGraph(!showGraph)}
                    className="bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    {showGraph ? "Hide Knowledge Graph" : "Show Knowledge Graph"}
                  </button>

                  {showGraph && renderGraph(deepResponse.graph_location, deepResponse.graph_data)}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

