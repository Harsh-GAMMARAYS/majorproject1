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
  const [refreshKey, setRefreshKey] = useState(0);
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
    setRefreshKey((prev) => prev + 1);
    setShowUploadModal(false);
    fetchFileStatus();
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
    fetchFileStatus();
    const interval = setInterval(fetchFileStatus, 3000);
    return () => clearInterval(interval);
  }, [refreshKey]);

  const handleToolSelect = (toolId: string | null) => {
    // Handle Knowledge Graph navigation separately
    if (toolId === 'graph') {
      router.push('/graph');
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
        <div className="p-6 space-y-4">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-xl font-semibold text-white">Query Knowledge Base</h3>
            <button
              onClick={() => setActiveTool(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              <FiX className="w-5 h-5" />
            </button>
          </div>
          
          {processedCount > 0 && (
            <div className="bg-emerald-900/30 border border-emerald-700 rounded-lg p-3 mb-4">
              <p className="text-sm text-emerald-300">
                📚 Searching across <span className="font-semibold">{processedCount}</span> processed document{processedCount !== 1 ? 's' : ''} 
                {totalCount > processedCount && (
                  <span className="text-emerald-400/70"> ({totalCount - processedCount} still processing)</span>
                )}
              </p>
            </div>
          )}

          {queryTab === 'deep' && createGraph && (
            <div className="mb-4">
              <label className="block text-sm font-medium text-white mb-2">
                Select Sources for Knowledge Graph
              </label>
              <FileSelector
                selectedFiles={selectedFiles}
                onSelectionChange={setSelectedFiles}
              />
              <p className="text-xs text-gray-400 mt-2">
                💡 Choose specific documents to build the knowledge graph from
              </p>
            </div>
          )}
          
          <div className="flex gap-2 mb-4">
            <button
              onClick={() => setQueryTab('simple')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                queryTab === 'simple'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
              }`}
            >
              Simple Query
            </button>
            <button
              onClick={() => setQueryTab('deep')}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                queryTab === 'deep'
                  ? 'bg-emerald-600 text-white'
                  : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
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
              className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
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
                  className="w-20 px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg"
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
          </div>
        </div>
      );
    }

    return (
      <div className="p-6 space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-semibold text-white">
            {activeTool === 'outline' && 'Generate Outline'}
            {activeTool === 'summarize' && 'Summarize Documents'}
            {activeTool === 'faq' && 'Generate FAQ'}
            {activeTool === 'quiz' && 'Generate Quiz'}
            {activeTool === 'flashcards' && 'Generate Flashcards'}
          </h3>
          <button
            onClick={() => setActiveTool(null)}
            className="text-gray-400 hover:text-white transition-colors"
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
          className="w-full bg-emerald-600 text-white py-2 px-4 rounded-lg hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors flex items-center justify-center"
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
          <div className="p-6 space-y-4 border-t border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <p className="text-gray-200 whitespace-pre-wrap">{deepResponse.answer}</p>
              </div>
            </div>
            {deepResponse.sub_queries.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Sub-queries</h3>
                <ul className="list-disc list-inside text-gray-200 space-y-1 bg-gray-800 rounded-lg p-4 border border-gray-700">
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
                <div className="border border-gray-700 rounded-lg overflow-hidden bg-white">
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
          <div className="p-6 space-y-4 border-t border-gray-800">
            <div>
              <h3 className="text-lg font-semibold text-white mb-2">Answer</h3>
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <p className="text-gray-200 whitespace-pre-wrap">{simpleResponse.answer}</p>
              </div>
            </div>
            {simpleResponse.context.length > 0 && (
              <div>
                <h3 className="text-lg font-semibold text-white mb-2">Context</h3>
                <div className="space-y-3">
                  {simpleResponse.context.map((chunk, i) => (
                    <div key={i} className="bg-gray-800 rounded-lg p-4 border border-gray-700">
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
        <div className="p-6 space-y-4 border-t border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">Generated Summaries</h3>
          <div className="space-y-4">
            {response.summaries.map((item) => (
              <div key={item.filename} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
                <div className="flex justify-between items-center mb-2">
                  <h4 className="text-lg font-medium text-white">{item.filename}</h4>
                  <button
                    onClick={() => navigator.clipboard.writeText(item.summary)}
                    className="text-sm text-emerald-400 hover:text-emerald-300"
                  >
                    Copy
                  </button>
                </div>
                <div className="bg-gray-900 rounded-lg p-4">
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
        <div className="p-6 space-y-4 border-t border-gray-800">
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
            <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
              <pre className="whitespace-pre-wrap text-sm text-gray-200 font-mono">{response.combined_outline}</pre>
            </div>
          ) : (
            <div className="space-y-4">
              {Object.entries(response.individual_outlines || {}).map(([filename, outlineText]) => (
                <div key={filename} className="border border-gray-700 rounded-lg p-4 bg-gray-800">
                  <h4 className="text-lg font-medium text-white mb-2">{filename}</h4>
                  <button
                    onClick={() => navigator.clipboard.writeText(outlineText)}
                    className="text-xs text-emerald-400 hover:text-emerald-300 mb-2"
                  >
                    Copy
                  </button>
                  <pre className="whitespace-pre-wrap text-sm text-gray-200 font-mono bg-gray-900 rounded p-3">{outlineText}</pre>
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
        <div className="p-6 space-y-4 border-t border-gray-800">
          <h3 className="text-lg font-semibold text-white mb-4">Generated FAQs ({response.faqs.length})</h3>
          <div className="space-y-3">
            {response.faqs.map((faq, index) => (
              <div key={index} className="border border-gray-700 rounded-lg overflow-hidden bg-gray-800">
                <button
                  onClick={() => setOpenFAQIndex(openFAQIndex === index ? null : index)}
                  className="w-full px-4 py-3 text-left bg-gray-800 hover:bg-gray-700 transition-colors flex justify-between items-center"
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
                  <div className="px-4 py-3 bg-gray-900 border-t border-gray-700">
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
        <div className="p-6 space-y-4 border-t border-gray-800">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold text-white">
              Question {quizIndex + 1} of {response.quiz.length}
            </h3>
            {showAnswers && score !== null && (
              <div className="text-lg font-semibold text-emerald-400">
                Score: {score} / {response.quiz.length}
              </div>
            )}
          </div>

          {currentQuestion && (
            <div className="space-y-4">
              <div className="bg-gray-800 rounded-lg p-4 border border-gray-700">
                <h4 className="text-lg font-medium text-white mb-2">{currentQuestion.question}</h4>
                <p className="text-xs text-gray-400">Source: {currentQuestion.source}</p>
              </div>

              {currentQuestion.options ? (
                <div className="space-y-2">
                  {currentQuestion.options.map((option, optIndex) => (
                    <label
                      key={optIndex}
                      className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedAnswers[quizIndex] === option
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-800'
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

              <div className="flex justify-between pt-4">
                <button
                  onClick={() => setQuizIndex(Math.max(0, quizIndex - 1))}
                  disabled={quizIndex === 0}
                  className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 transition-colors"
                >
                  Previous
                </button>
                {quizIndex === response.quiz.length - 1 && !showAnswers && (
                  <button
                    onClick={handleShowResults}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Show Results
                  </button>
                )}
                <button
                  onClick={() => setQuizIndex(Math.min(response.quiz.length - 1, quizIndex + 1))}
                  disabled={quizIndex === response.quiz.length - 1}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-700 transition-colors"
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
        <div className="p-6 space-y-4 border-t border-gray-800">
          <div className="flex justify-between items-center">
            <h3 className="text-lg font-semibold text-white">
              Card {flashcardIndex + 1} of {response.flashcards.length}
            </h3>
            <p className="text-sm text-gray-400">Source: {currentCard?.source}</p>
          </div>

          <div className="relative h-96 perspective-1000">
            <div
              className={`relative w-full h-full transform-style-preserve-3d transition-transform duration-500 cursor-pointer ${
                isFlipped ? 'rotate-y-180' : 'rotate-y-0'
              }`}
              onClick={() => setIsFlipped(!isFlipped)}
            >
              {/* Front of card */}
              <div className="absolute inset-0 backface-hidden rotate-y-0">
                <div className="bg-gray-800 border-2 border-emerald-500 rounded-lg shadow-lg p-8 h-full flex flex-col justify-center items-center">
                  <div className="text-center">
                    <p className="text-sm text-gray-400 mb-4">Front</p>
                    <p className="text-2xl font-medium text-white">{currentCard?.front}</p>
                  </div>
                  <p className="text-xs text-gray-500 mt-8">Click to flip</p>
                </div>
              </div>

              {/* Back of card */}
              <div className="absolute inset-0 backface-hidden rotate-y-180">
                <div className="bg-emerald-900/30 border-2 border-emerald-500 rounded-lg shadow-lg p-8 h-full flex flex-col justify-center items-center">
                  <div className="text-center">
                    <p className="text-sm text-emerald-400 mb-4">Back</p>
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
              className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 transition-colors"
            >
              Previous
            </button>
            <button
              onClick={() => setIsFlipped(!isFlipped)}
              className="px-6 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
            >
              {isFlipped ? 'Show Front' : 'Show Back'}
            </button>
            <button
              onClick={() => {
                setFlashcardIndex(Math.min(response.flashcards.length - 1, flashcardIndex + 1));
                setIsFlipped(false);
              }}
              disabled={flashcardIndex === response.flashcards.length - 1}
              className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex flex-col">
      <div className="flex flex-1 overflow-hidden">
        {/* Left Panel - Sources */}
        <div className="w-80 border-r border-gray-800 bg-[#1a1a1a] flex flex-col">
          <div className="p-6 border-b border-gray-800">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-gray-200">Sources</h2>
              <div className="flex gap-2">
                <button
                  onClick={() => setShowUploadModal(true)}
                  className="px-4 py-2 text-sm bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg transition-colors font-medium"
                >
                  + Add
                </button>
                <button 
                  onClick={() => setRefreshKey(prev => prev + 1)}
                  className="px-4 py-2 text-sm bg-gray-800 hover:bg-gray-700 text-gray-300 rounded-lg transition-colors font-medium"
                  title="Refresh to discover new files"
                >
                  Discover
                </button>
              </div>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-4">
            <FileSystem key={refreshKey} autoRefresh={true} refreshInterval={3000} />
          </div>
        </div>

        {/* Middle Panel - Chat */}
        <div className="flex-1 flex flex-col bg-[#0f0f0f] overflow-hidden border-r border-gray-800">
          <div className="p-6 border-b border-gray-800">
            <h2 className="text-2xl font-bold text-gray-200">Chat</h2>
          </div>
          <div className="flex-1 overflow-y-auto">
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
              <>
                {renderToolInterface()}
                {error && <div className="px-6"><ErrorAlert message={error} onDismiss={() => setError(null)} /></div>}
                {renderToolResults()}
              </>
            ) : (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <div className="w-24 h-24 mx-auto mb-6 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center">
                    <FiUpload className="w-12 h-12 text-gray-400" />
                  </div>
                  <h2 className="text-2xl font-semibold text-gray-200 mb-6">Add a source to get started</h2>
                  <button
                    onClick={() => setShowUploadModal(true)}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 text-gray-200 rounded-lg transition-colors font-medium"
                  >
                    Upload a source
                  </button>
                </div>
              </div>
            )}
          </div>
          <div className="border-t border-gray-800 p-4 bg-[#1a1a1a]">
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

        {/* Right Panel - Studio */}
        <div className="w-96 border-l border-gray-800 bg-[#1a1a1a] flex flex-col overflow-hidden">
          <StudioGrid 
            onToolSelect={handleToolSelect} 
            activeTool={activeTool}
          />
        </div>
      </div>
    </div>
  );
}
