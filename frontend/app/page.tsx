'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import FileUpload from '@/components/FileUpload';
import FileSystem from '@/components/FileSystem';
import FileSelector from '@/components/FileSelector';
import StudioGrid from '@/components/StudioGrid';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import { getFileStatus, query, deepQuery, summarize, generateOutline, generateFAQ, generateQuiz, generateFlashcards } from '@/lib/api';
import type { FileStatusResponse, QueryResponse, DeepQueryResponse, SummarizeResponse, OutlineResponse, FAQResponse, QuizResponse, FlashcardResponse } from '@/types/api';
import { FiUpload, FiArrowRight, FiX } from 'react-icons/fi';

export default function Dashboard() {
  const router = useRouter();
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [fileStatus, setFileStatus] = useState<FileStatusResponse>({});
  const [activeTool, setActiveTool] = useState<string | null>(null);
  
  // Tool states
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toolResults, setToolResults] = useState<any>(null);
  
  // Query specific states
  const [queryText, setQueryText] = useState('');
  const [queryTab, setQueryTab] = useState<'simple' | 'deep'>('simple');
  const [topK, setTopK] = useState(5);
  const [createGraph, setCreateGraph] = useState(false);
  
  // FAQ states
  const [openFAQIndex, setOpenFAQIndex] = useState<number | null>(null);
  
  // Quiz states
  const [quizIndex, setQuizIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showAnswers, setShowAnswers] = useState(false);
  const [score, setScore] = useState<number | null>(null);
  
  // Flashcard states
  const [flashcardIndex, setFlashcardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleUploadSuccess = () => {
    setShowUploadModal(false);
    void fetchFileStatus();
  };

  const fetchFileStatus = async () => {
    try {
      const status = await getFileStatus();
      setFileStatus(status);
    } catch (err) {
      // Silent fail
    }
  };

  useEffect(() => {
    void fetchFileStatus();
  }, []);

  const handleToolSelect = (toolId: string | null) => {
    // Handle Knowledge Graph navigation separately
    if (toolId === 'graph') {
      router.push('/graph');
      return;
    }
    if (toolId === 'rooms') {
      router.push('/rooms');
      return;
    }
    
    setActiveTool(toolId);
    setSelectedFiles([]);
    setToolResults(null);
    setError(null);
    setQueryText('');
    setQueryTab('simple');
    setOpenFAQIndex(null);
    setQuizIndex(0);
    setSelectedAnswers({});
    setShowAnswers(false);
    setScore(null);
    setFlashcardIndex(0);
    setIsFlipped(false);
  };

  const handleGenerate = async () => {
    if (!activeTool) return;
    
    if (activeTool === 'query') {
      handleQuery();
      return;
    }
    
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setToolResults(null);

    try {
      let response: any;
      
      switch (activeTool) {
        case 'summarize':
          response = await summarize(selectedFiles);
          break;
        case 'outline':
          response = await generateOutline(selectedFiles, false);
          break;
        case 'faq':
          response = await generateFAQ(selectedFiles);
          break;
        case 'quiz':
          response = await generateQuiz(selectedFiles, 'mcq', 10);
          break;
        case 'flashcards':
          response = await generateFlashcards(selectedFiles);
          break;
        default:
          throw new Error('Unknown tool');
      }
      
      setToolResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate content');
    } finally {
      setLoading(false);
    }
  };

  const handleQuery = async () => {
    if (!queryText.trim()) {
      setError('Please enter a query');
      return;
    }

    setLoading(true);
    setError(null);
    setToolResults(null);

    try {
      const response = queryTab === 'simple'
        ? await query(queryText, topK)
        : await deepQuery(queryText, topK, createGraph);
      setToolResults(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to query knowledge base');
    } finally {
      setLoading(false);
    }
  };

  const renderToolInterface = () => {
    if (activeTool === null) {
      return null;
    }

    if (activeTool === 'query') {
      const processedCount = Object.values(fileStatus).filter(item => item.status === 'processed').length;
      const totalCount = Object.keys(fileStatus).length;
      
      return (
        <div className="space-y-5 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">Interactive Retrieval</p>
              <h3 className="mt-2 text-2xl font-semibold text-white">Query Knowledge Base</h3>
            </div>
            <button
              onClick={() => setActiveTool(null)}
              className="rounded-full border border-gray-800 bg-black/20 p-2 text-gray-400 transition-colors hover:text-white"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          
          {processedCount > 0 && (
            <div className="rounded-2xl border border-emerald-900/60 bg-emerald-950/20 p-4">
              <p className="text-sm text-emerald-300">
                📚 Searching across <span className="font-semibold">{processedCount}</span> processed document{processedCount !== 1 ? 's' : ''} 
                {totalCount > processedCount && (
                  <span className="text-emerald-400/70"> ({totalCount - processedCount} still processing)</span>
                )}
              </p>
            </div>
          )}

          {queryTab === 'deep' && createGraph && (
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Select Sources for Knowledge Graph
              </label>
              <FileSelector
                selectedFiles={selectedFiles}
                onSelectionChange={setSelectedFiles}
              />
              <p className="mt-2 text-xs text-gray-400">
                💡 Choose specific documents to build the knowledge graph from
              </p>
            </div>
          )}
          
          <div className="flex gap-2">
            <button
              onClick={() => setQueryTab('simple')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                queryTab === 'simple'
                  ? 'bg-emerald-500/12 text-emerald-300'
                  : 'bg-black/10 text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              Simple Query
            </button>
            <button
              onClick={() => setQueryTab('deep')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition-colors ${
                queryTab === 'deep'
                  ? 'bg-emerald-500/12 text-emerald-300'
                  : 'bg-black/10 text-gray-300 hover:bg-white/[0.04]'
              }`}
            >
              Deep Query
            </button>
          </div>

          <div className="space-y-4">
            <textarea
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              rows={4}
              className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-white focus:border-emerald-500 focus:ring-emerald-500"
              placeholder="Enter your question here..."
            />
            
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2">
                <span className="text-sm font-medium text-white">Top K:</span>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={topK}
                  onChange={(e) => setTopK(parseInt(e.target.value) || 5)}
                  className="w-20 rounded-xl border border-gray-700 bg-black/20 px-3 py-2 text-white"
                />
              </label>
              {queryTab === 'deep' && (
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
              onClick={handleQuery}
              disabled={loading}
              className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
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
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-5 p-6">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.28em] text-emerald-400">Study Material</p>
            <h3 className="mt-2 text-2xl font-semibold text-white">
            {activeTool === 'outline' && 'Generate Outline'}
            {activeTool === 'summarize' && 'Summarize Documents'}
            {activeTool === 'faq' && 'Generate FAQ'}
            {activeTool === 'quiz' && 'Generate Quiz'}
            {activeTool === 'flashcards' && 'Generate Flashcards'}
            </h3>
          </div>
          <button
            onClick={() => setActiveTool(null)}
            className="rounded-full border border-gray-800 bg-black/20 p-2 text-gray-400 transition-colors hover:text-white"
          >
            <FiX className="w-5 h-5" />
          </button>
        </div>

        <FileSelector
          selectedFiles={selectedFiles}
          onSelectionChange={setSelectedFiles}
          multiple={true}
        />

        <button
          onClick={handleGenerate}
          disabled={loading || selectedFiles.length === 0}
          className="flex w-full items-center justify-center rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-gray-700 disabled:text-gray-400"
        >
          {loading ? (
            <>
              <LoadingSpinner size="sm" />
              <span className="ml-2">Generating...</span>
            </>
          ) : (
            `Generate ${activeTool === 'outline' ? 'Outline' : activeTool === 'summarize' ? 'Summaries' : activeTool === 'faq' ? 'FAQ' : activeTool === 'quiz' ? 'Quiz' : 'Flashcards'}`
          )}
        </button>
      </div>
    );
  };

  const renderToolResults = () => {
    if (!toolResults || !activeTool) return null;

    if (activeTool === 'query') {
      const response = toolResults as QueryResponse | DeepQueryResponse;
      if ('sub_queries' in response) {
        const deepResponse = response as DeepQueryResponse;
        return (
          <div className="space-y-5 border-t border-gray-800 p-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
              <div className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                <p className="text-gray-200 whitespace-pre-wrap">{deepResponse.answer}</p>
              </div>
            </div>
            {deepResponse.sub_queries.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Sub-queries</h3>
                <ul className="list-disc list-inside space-y-1 rounded-2xl border border-gray-700 bg-black/20 p-4 text-gray-200">
                  {deepResponse.sub_queries.map((sq, i) => (
                    <li key={i}>{sq}</li>
                  ))}
                </ul>
              </div>
            )}
            {deepResponse.graph_location && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-lg font-semibold text-white">Knowledge Graph</h3>
                  <button
                    onClick={() => window.open(`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}${deepResponse.graph_location}`, '_blank')}
                    className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium rounded-lg transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                    Open in New Tab
                  </button>
                </div>
                <div className="overflow-hidden rounded-[24px] border border-gray-700 bg-white">
                  <iframe
                    src={`${process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000'}${deepResponse.graph_location}`}
                    title="Knowledge Graph"
                    className="w-full"
                    style={{ height: '600px' }}
                    sandbox="allow-scripts allow-same-origin"
                    onError={(e) => console.error('Graph iframe error:', e)}
                    onLoad={() => console.log('Graph iframe loaded successfully')}
                  />
                </div>
              </div>
            )}
          </div>
        );
      } else {
        const simpleResponse = response as QueryResponse;
        return (
          <div className="space-y-5 border-t border-gray-800 p-6">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
              <div className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                <p className="text-gray-200 whitespace-pre-wrap">{simpleResponse.answer}</p>
              </div>
            </div>
            {simpleResponse.context.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Context</h3>
                <div className="space-y-3">
                  {simpleResponse.context.map((chunk, i) => (
                    <div key={i} className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                      <p className="text-sm text-gray-200 whitespace-pre-wrap">{chunk}</p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      }
    }

    if (activeTool === 'summarize' && 'summaries' in toolResults) {
      const response = toolResults as SummarizeResponse;
      return (
        <div className="space-y-5 border-t border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Generated Summaries</h3>
          <div className="space-y-4">
            {response.summaries.map((item) => (
              <div key={item.filename} className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-medium text-white">{item.filename}</h4>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.summary)}
                    className="text-sm text-emerald-400 hover:text-emerald-300"
                  >
                    Copy
                  </button>
                </div>
                <div className="rounded-2xl bg-black/20 p-4">
                  <p className="text-gray-200 whitespace-pre-wrap">{item.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTool === 'outline' && 'individual_outlines' in toolResults) {
      const response = toolResults as OutlineResponse;
      return (
        <div className="space-y-5 border-t border-gray-800 p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">Generated Outline</h3>
            <button
              onClick={() => {
                const text = response.combined_outline
                  ? response.combined_outline
                  : Object.values(response.individual_outlines || {}).join('\n\n');
                navigator.clipboard.writeText(text);
              }}
              className="text-sm text-emerald-400 hover:text-emerald-300"
            >
              Copy to Clipboard
            </button>
          </div>
          {response.combined_outline ? (
            <div className="rounded-2xl border border-gray-700 bg-black/20 p-4">
              <pre className="whitespace-pre-wrap text-sm text-gray-200 font-mono">{response.combined_outline}</pre>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(response.individual_outlines || {}).map(([filename, outlineText]) => (
                <div key={filename} className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                  <h4 className="text-lg font-medium text-white mb-2">{filename}</h4>
                  <button
                    onClick={() => navigator.clipboard.writeText(outlineText)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mb-2"
                  >
                    Copy
                  </button>
                  <pre className="whitespace-pre-wrap rounded-2xl bg-black/20 p-3 text-sm text-gray-200 font-mono">{outlineText}</pre>
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    if (activeTool === 'faq' && 'faqs' in toolResults) {
      const response = toolResults as FAQResponse;
      return (
        <div className="space-y-5 border-t border-gray-800 p-6">
          <h3 className="text-lg font-semibold text-white mb-4">Generated FAQs ({response.faqs.length})</h3>
          <div className="space-y-3">
            {response.faqs.map((faq, index) => (
              <div key={index} className="overflow-hidden rounded-2xl border border-gray-700 bg-black/20">
                <button
                  onClick={() => setOpenFAQIndex(openFAQIndex === index ? null : index)}
                  className="flex w-full items-center justify-between bg-black/10 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                >
                  <span className="font-medium text-white">{faq.question}</span>
                  <svg
                    className={`w-5 h-5 text-gray-500 transition-transform ${
                      openFAQIndex === index ? 'transform rotate-180' : ''
                    }`}
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                </button>
                {openFAQIndex === index && (
                  <div className="border-t border-gray-700 bg-black/20 px-4 py-3">
                    <p className="text-gray-200 whitespace-pre-wrap mb-2">{faq.answer}</p>
                    <p className="text-xs text-gray-400">
                      Source: <span className="font-medium text-gray-300">{faq.source}</span>
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      );
    }

    if (activeTool === 'quiz' && 'quiz' in toolResults) {
      const response = toolResults as QuizResponse;

      const handleAnswerSelect = (answer: string) => {
        setSelectedAnswers((prev) => ({ ...prev, [quizIndex]: answer }));
      };

      const handleShowResults = () => {
        let correct = 0;
        response.quiz.forEach((q, idx) => {
          if (selectedAnswers[idx] === q.answer) correct++;
        });
        setScore(correct);
        setShowAnswers(true);
      };

      const currentQuestion = response.quiz[quizIndex];

      return (
        <div className="space-y-5 border-t border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Quiz Session</p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Question {quizIndex + 1} of {response.quiz.length}
              </h3>
            </div>
            {showAnswers && score !== null && (
              <div className="rounded-full bg-emerald-950/40 px-4 py-2 text-sm font-semibold text-emerald-300">
                Score: {score} / {response.quiz.length}
              </div>
            )}
          </div>

          {currentQuestion && (
            <div className="space-y-4">
              <div className="rounded-[24px] border border-gray-700 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_38%),linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-5">
                <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Prompt</p>
                <h4 className="mt-3 text-xl font-medium text-white">{currentQuestion.question}</h4>
                <p className="mt-3 text-xs text-gray-400">Source: {currentQuestion.source}</p>
              </div>

              {currentQuestion.options ? (
                <div className="space-y-2">
                  {currentQuestion.options.map((option, optIndex) => (
                    <label
                      key={optIndex}
                      className={`flex items-center rounded-2xl border px-4 py-3 transition-colors ${
                        selectedAnswers[quizIndex] === option
                          ? 'border-emerald-500 bg-emerald-500/12'
                          : 'border-gray-700 bg-black/20 hover:border-gray-600'
                      } ${
                        showAnswers && option === currentQuestion.answer
                          ? 'bg-emerald-900/30 border-emerald-500'
                          : ''
                      }`}
                    >
                      <input
                        type="radio"
                        checked={selectedAnswers[quizIndex] === option}
                        onChange={() => handleAnswerSelect(option)}
                        disabled={showAnswers}
                        className="mr-3 text-emerald-600 focus:ring-emerald-500 bg-gray-800 border-gray-600"
                      />
                      <span className="text-white">{option}</span>
                      {showAnswers && option === currentQuestion.answer && (
                        <span className="ml-auto text-emerald-400 font-medium">✓ Correct</span>
                      )}
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="flex justify-between gap-3 pt-2">
                <button
                  onClick={() => setQuizIndex(Math.max(0, quizIndex - 1))}
                  disabled={quizIndex === 0}
                  className="rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-white/[0.03] disabled:border-gray-800 disabled:text-gray-600"
                >
                  Previous
                </button>
                {quizIndex === response.quiz.length - 1 && !showAnswers && (
                  <button
                    onClick={handleShowResults}
                    className="rounded-2xl bg-emerald-500 px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
                  >
                    Show Results
                  </button>
                )}
                <button
                  onClick={() => setQuizIndex(Math.min(response.quiz.length - 1, quizIndex + 1))}
                  disabled={quizIndex === response.quiz.length - 1}
                  className="rounded-2xl bg-white px-4 py-3 text-sm font-semibold text-black transition-colors hover:bg-gray-200 disabled:bg-gray-700 disabled:text-gray-400"
                >
                  Next
                </button>
              </div>
            </div>
          )}
        </div>
      );
    }

    if (activeTool === 'flashcards' && 'flashcards' in toolResults) {
      const response = toolResults as FlashcardResponse;
      const currentCard = response.flashcards[flashcardIndex];

      return (
        <div className="space-y-5 border-t border-gray-800 p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-gray-500">Flashcard Deck</p>
              <h3 className="mt-2 text-lg font-semibold text-white">
                Card {flashcardIndex + 1} of {response.flashcards.length}
              </h3>
            </div>
            <p className="rounded-full bg-black/20 px-3 py-2 text-xs text-gray-400">Source: {currentCard?.source}</p>
          </div>

          <div className="relative h-96" style={{ perspective: '1000px' }}>
            <div
              className="relative h-full w-full cursor-pointer transition-transform duration-500"
              style={{
                transformStyle: 'preserve-3d',
                transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
              }}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden' }}>
                <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-emerald-700/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.12),_transparent_42%),linear-gradient(180deg,#151515_0%,#0c0c0c_100%)] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                  <div className="text-center">
                    <p className="mb-4 text-sm uppercase tracking-[0.24em] text-emerald-300">Front</p>
                    <p className="text-2xl font-medium text-white">{currentCard?.front}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-8">Click to flip</p>
                </div>
              </div>

              <div className="absolute inset-0" style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}>
                <div className="flex h-full flex-col items-center justify-center rounded-[28px] border border-emerald-500 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.2),_transparent_42%),linear-gradient(180deg,#12231f_0%,#0b1110_100%)] p-8 shadow-[0_20px_60px_rgba(0,0,0,0.28)]">
                  <div className="text-center">
                    <p className="mb-4 text-sm uppercase tracking-[0.24em] text-emerald-300">Back</p>
                    <p className="text-2xl font-medium text-white">{currentCard?.back}</p>
                  </div>
                  <p className="text-xs text-emerald-500 mt-8">Click to flip back</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={() => {
                setFlashcardIndex(Math.max(0, flashcardIndex - 1));
                setIsFlipped(false);
              }}
              disabled={flashcardIndex === 0}
              className="rounded-2xl border border-gray-700 bg-black/20 px-6 py-3 text-sm text-gray-300 transition-colors hover:bg-white/[0.03] disabled:border-gray-800 disabled:text-gray-600"
            >
              Previous
            </button>
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="rounded-2xl bg-emerald-500 px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
            >
              {isFlipped ? 'Show Front' : 'Show Back'}
            </button>
            <button
              onClick={() => {
                setFlashcardIndex(Math.min(response.flashcards.length - 1, flashcardIndex + 1));
                setIsFlipped(false);
              }}
              disabled={flashcardIndex === response.flashcards.length - 1}
              className="rounded-2xl border border-gray-700 bg-black/20 px-6 py-3 text-sm text-gray-300 transition-colors hover:bg-white/[0.03] disabled:border-gray-800 disabled:text-gray-600"
            >
              Next
            </button>
          </div>

          <button
            onClick={() => {
              setToolResults(null);
              setFlashcardIndex(0);
              setIsFlipped(false);
            }}
            className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-sm text-gray-300 transition-colors hover:bg-white/[0.03]"
          >
            Generate New Flashcards
          </button>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.1),_transparent_20%),linear-gradient(180deg,#0d0d0d_0%,#060606_100%)]">
      <div className="flex flex-1 min-h-0 overflow-hidden">
        <div className="flex min-h-0 w-80 flex-col border-r border-gray-800 bg-[#121212]">
          <div className="border-b border-gray-800 px-5 py-4">
            <div className="mb-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400">Library</p>
              <div className="mt-2 flex items-baseline justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-100">Sources</h2>
                  <p className="mt-1 text-sm text-gray-500">{Object.keys(fileStatus).length} files indexed in your workspace</p>
                </div>
              </div>
            </div>
            <div className="flex gap-2">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="rounded-2xl bg-emerald-500 px-4 py-2.5 text-sm font-semibold text-black transition-colors hover:bg-emerald-400"
                >
                  + Add
                </button>
                <button 
                  onClick={() => {
                    void fetchFileStatus();
                  }}
                  className="rounded-2xl border border-gray-700 bg-black/20 px-4 py-2.5 text-sm font-medium text-gray-300 transition-colors hover:bg-white/[0.03]"
                  title="Refresh to discover new files"
                >
                  Discover
                </button>
            </div>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <FileSystem
              autoRefresh={false}
              fileStatus={fileStatus}
              onRefresh={fetchFileStatus}
            />
          </div>
        </div>

        <div className="min-h-0 flex-1 flex flex-col overflow-hidden border-r border-gray-800">
          <div className="min-h-0 flex-1 overflow-y-auto">
            {showUploadModal ? (
              <div className="p-8">
                <FileUpload onUploadSuccess={handleUploadSuccess} />
                <button
                  onClick={() => setShowUploadModal(false)}
                  className="mt-6 text-gray-400 hover:text-white transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : activeTool ? (
              <div className="p-6">
                <div className="overflow-hidden rounded-[32px] border border-gray-800 bg-[#111111] shadow-[0_24px_80px_rgba(0,0,0,0.28)]">
                  {renderToolInterface()}
                  {error && <div className="px-6"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
                  {renderToolResults()}
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="w-full max-w-3xl px-8 py-12">
                  <div className="grid gap-6 md:grid-cols-[1.2fr_0.8fr]">
                    <div className="text-center md:text-left">
                      <p className="mb-4 text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400">Workspace</p>
                      <div className="mx-auto mb-6 flex h-24 w-24 items-center justify-center rounded-full border border-gray-700 bg-[#1a2232] md:mx-0">
                        <FiUpload className="w-12 h-12 text-gray-400" />
                      </div>
                      <h2 className="text-3xl font-semibold tracking-tight text-gray-100 mb-3">Add a source to get started</h2>
                      <p className="mb-6 max-w-xl text-sm leading-6 text-gray-500">
                        Upload documents to unlock querying, summaries, quizzes, flashcards, outlines, and knowledge graphs in one workspace.
                      </p>
                      <button
                        onClick={() => setShowUploadModal(true)}
                        className="rounded-2xl bg-[#1f2d47] px-6 py-3 text-gray-200 transition-colors font-medium hover:bg-[#273652]"
                      >
                        Upload a source
                      </button>
                    </div>

                    <button
                      onClick={() => router.push('/rooms')}
                      className="rounded-3xl border border-emerald-900/70 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.18),_transparent_45%),linear-gradient(180deg,#111111_0%,#0a0a0a_100%)] p-6 text-left transition-colors hover:border-emerald-600"
                    >
                      <p className="text-xs uppercase tracking-[0.3em] text-emerald-400">New</p>
                      <h3 className="mt-3 text-2xl font-semibold text-white">Study Rooms</h3>
                      <p className="mt-3 text-sm leading-6 text-gray-400">
                        Create shared rooms with persistent context, live chat, collaborative queries, and room-wide flashcards, quizzes, outlines, and knowledge graphs.
                      </p>
                      <div className="mt-6 inline-flex items-center gap-2 rounded-full bg-emerald-500 px-4 py-2 text-sm font-semibold text-black">
                        Open Rooms
                        <FiArrowRight className="w-4 h-4" />
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-gray-800 bg-[#111111] p-4">
            <div className="flex items-center justify-between">
              <input
                type="text"
                placeholder="Upload a source to get started"
                className="flex-1 bg-transparent text-gray-400 placeholder-gray-500 border-none outline-none text-sm"
                readOnly
              />
              <div className="flex items-center gap-2 text-sm text-gray-400">
                <span>{Object.keys(fileStatus).length} sources</span>
                <FiArrowRight className="w-4 h-4" />
              </div>
            </div>
            <p className="text-xs text-gray-500 mt-2">Knowledge Base can be inaccurate; please double check its responses.</p>
          </div>
        </div>

        <div className="flex min-h-0 w-96 flex-col overflow-hidden border-l border-gray-800 bg-[#121212]">
          <StudioGrid 
            onToolSelect={handleToolSelect} 
            activeTool={activeTool}
          />
        </div>
      </div>
    </div>
  );
}
