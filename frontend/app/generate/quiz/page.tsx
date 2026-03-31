'use client';

import { useState } from 'react';
import { generateQuiz } from '@/lib/api';
import type { QuizResponse, QuizQuestion } from '@/types/api';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import StudyPageShell from '@/components/StudyPageShell';

export default function QuizPage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<'mcq' | 'short'>('mcq');
  const [count, setCount] = useState(10);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [quiz, setQuiz] = useState<QuizResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<number, string>>({});
  const [showAnswers, setShowAnswers] = useState(false);
  const [score, setScore] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setQuiz(null);
    setCurrentIndex(0);
    setSelectedAnswers({});
    setShowAnswers(false);
    setScore(null);

    try {
      const response = await generateQuiz(selectedFiles, questionType, count);
      setQuiz(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate quiz');
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSelect = (answer: string) => {
    setSelectedAnswers((prev) => ({
      ...prev,
      [currentIndex]: answer,
    }));
  };

  const handleShowResults = () => {
    if (!quiz) return;
    setShowAnswers(true);
    let correct = 0;
    quiz.quiz.forEach((question, index) => {
      if (selectedAnswers[index] === question.answer) {
        correct++;
      }
    });
    setScore(correct);
  };

  const currentQuestion = quiz?.quiz[currentIndex];

  return (
    <StudyPageShell
      eyebrow="Study Material"
      title="Generate Quiz"
      description="Build interactive quizzes from your documents inside the same study-oriented visual system."
    >
      {!quiz ? (
          <div className="rounded-[28px] border border-gray-800 bg-[linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-6 space-y-6">
          <FileSelector
            selectedFiles={selectedFiles}
            onSelectionChange={setSelectedFiles}
            multiple={true}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Question Type
              </label>
              <select
                value={questionType}
                onChange={(e) => setQuestionType(e.target.value as 'mcq' | 'short')}
                className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-white focus:ring-emerald-500 focus:border-emerald-500"
              >
                <option value="mcq">Multiple Choice (MCQ)</option>
                <option value="short">Short Answer</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium text-white mb-2">
                Number of Questions
              </label>
              <input
                type="number"
                min="1"
                max="50"
                value={count}
                onChange={(e) => setCount(parseInt(e.target.value) || 10)}
                className="w-full rounded-2xl border border-gray-700 bg-black/20 px-4 py-3 text-white focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>

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
              'Generate Quiz'
            )}
          </button>

          {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
          </div>
        ) : (
          <div className="rounded-[28px] border border-gray-800 bg-[linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-6">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-semibold text-white">
              Question {currentIndex + 1} of {quiz.quiz.length}
            </h2>
            {showAnswers && score !== null && (
              <div className="text-lg font-semibold text-emerald-400">
                Score: {score} / {quiz.quiz.length}
              </div>
            )}
          </div>

          {currentQuestion && (
            <div className="space-y-4">
              <div className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                <h3 className="text-lg font-medium text-white mb-2">
                  {currentQuestion.question}
                </h3>
                <p className="text-xs text-gray-400">Source: {currentQuestion.source}</p>
              </div>

              {questionType === 'mcq' && currentQuestion.options ? (
                <div className="space-y-2">
                  {currentQuestion.options.map((option, optIndex) => (
                    <label
                      key={optIndex}
                      className={`flex items-center p-3 border-2 rounded-lg cursor-pointer transition-colors ${
                        selectedAnswers[currentIndex] === option
                          ? 'border-emerald-500 bg-emerald-500/20'
                          : 'border-gray-700 hover:border-gray-600 bg-gray-800'
                      } ${
                        showAnswers && option === currentQuestion.answer
                          ? 'bg-emerald-900/30 border-emerald-500'
                          : ''
                      } ${
                        showAnswers &&
                        selectedAnswers[currentIndex] === option &&
                        option !== currentQuestion.answer
                          ? 'bg-red-900/30 border-red-500'
                          : ''
                      }`}
                    >
                      <input
                        type="radio"
                        name={`question-${currentIndex}`}
                        value={option}
                        checked={selectedAnswers[currentIndex] === option}
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
              ) : (
                <div>
                  <textarea
                    value={selectedAnswers[currentIndex] || ''}
                    onChange={(e) => handleAnswerSelect(e.target.value)}
                    disabled={showAnswers}
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
                    placeholder="Type your answer here..."
                  />
                  {showAnswers && (
                    <div className="mt-2 p-3 bg-emerald-900/30 border border-emerald-700 rounded-lg">
                      <p className="text-sm font-medium text-emerald-300">Correct Answer:</p>
                      <p className="text-emerald-200">{currentQuestion.answer}</p>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="mt-6 flex justify-between">
            <button
              onClick={() => setCurrentIndex(Math.max(0, currentIndex - 1))}
              disabled={currentIndex === 0}
              className="px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              Previous
            </button>

            {!showAnswers ? (
              <div className="flex gap-2">
                {currentIndex === quiz.quiz.length - 1 && (
                  <button
                    onClick={handleShowResults}
                    className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
                  >
                    Show Results
                  </button>
                )}
                <button
                  onClick={() =>
                    setCurrentIndex(Math.min(quiz.quiz.length - 1, currentIndex + 1))
                  }
                  disabled={currentIndex === quiz.quiz.length - 1}
                  className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed transition-colors"
                >
                  Next
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setQuiz(null);
                  setCurrentIndex(0);
                  setSelectedAnswers({});
                  setShowAnswers(false);
                  setScore(null);
                }}
                className="px-4 py-2 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors"
              >
                Generate New Quiz
              </button>
            )}
          </div>
          </div>
        )}
    </StudyPageShell>
  );
}
