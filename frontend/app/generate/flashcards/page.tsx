'use client';

import { useState } from 'react';
import { generateFlashcards } from '@/lib/api';
import type { FlashcardResponse } from '@/types/api';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import StudyPageShell from '@/components/StudyPageShell';

export default function FlashcardsPage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [flashcards, setFlashcards] = useState<FlashcardResponse | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setFlashcards(null);
    setCurrentIndex(0);
    setIsFlipped(false);

    try {
      const response = await generateFlashcards(selectedFiles);
      setFlashcards(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate flashcards');
    } finally {
      setLoading(false);
    }
  };

  const currentCard = flashcards?.flashcards[currentIndex];

  const handleNext = () => {
    setCurrentIndex((prev) =>
      flashcards ? Math.min(flashcards.flashcards.length - 1, prev + 1) : prev
    );
    setIsFlipped(false);
  };

  const handlePrevious = () => {
    setCurrentIndex((prev) => Math.max(0, prev - 1));
    setIsFlipped(false);
  };

  const outerStyle: React.CSSProperties = {
    perspective: '1000px',
    WebkitPerspective: '1000px',
  };

  const rotatorStyle: React.CSSProperties = {
    width: '100%',
    height: '100%',
    position: 'relative',
    transition: 'transform 0.7s',
    transformStyle: 'preserve-3d',
    WebkitTransformStyle: 'preserve-3d',
    transform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
    WebkitTransform: isFlipped ? 'rotateY(180deg)' : 'rotateY(0deg)',
  };

  const frontStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    cursor: 'pointer',
  };

  const backStyle: React.CSSProperties = {
    position: 'absolute',
    inset: 0,
    backfaceVisibility: 'hidden',
    WebkitBackfaceVisibility: 'hidden',
    transform: 'rotateY(180deg)',
    WebkitTransform: 'rotateY(180deg)',
    cursor: 'pointer',
  };

  return (
    <StudyPageShell
      eyebrow="Study Material"
      title="Generate Flashcards"
      description="Create revision cards from your documents in the same shared visual language as study rooms."
    >
      {!flashcards ? (
          <div className="rounded-[28px] border border-gray-800 bg-[linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-6 space-y-6">
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
              'Generate Flashcards'
            )}
          </button>

          {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}
          </div>
        ) : (
          <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-semibold text-white">
              Card {currentIndex + 1} of {flashcards.flashcards.length}
            </h2>
            <p className="text-sm text-gray-400">Source: {currentCard?.source}</p>
          </div>

          {/* Flip container */}
          <div className="relative h-96" style={outerStyle}>
            <div style={rotatorStyle}>
              {/* Front */}
              <div style={frontStyle} onClick={() => setIsFlipped(true)}>
                <div className="bg-gray-800 border-2 border-emerald-500 rounded-lg shadow-lg p-8 w-full h-full flex flex-col justify-center items-center">
                  <p className="text-sm text-gray-400 mb-4">Front</p>
                  <p className="text-2xl font-medium text-white text-center">
                    {currentCard?.front ?? '(no front text)'}
                  </p>
                  <p className="text-xs text-gray-500 mt-8">Click to flip</p>
                </div>
              </div>

              {/* Back */}
              <div style={backStyle} onClick={() => setIsFlipped(false)}>
                <div className="bg-emerald-900/30 border-2 border-emerald-500 rounded-lg shadow-lg p-8 w-full h-full flex flex-col justify-center items-center">
                  <p className="text-sm text-emerald-400 mb-4">Back</p>
                  <p className="text-2xl font-medium text-white text-center">
                    {currentCard?.back ?? '(no back text)'}
                  </p>
                  <p className="text-xs text-emerald-500 mt-8">Click to flip</p>
                </div>
              </div>
            </div>
          </div>

          <div className="flex justify-center gap-4">
            <button
              onClick={handlePrevious}
              disabled={currentIndex === 0}
              className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
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
              onClick={handleNext}
              disabled={currentIndex === flashcards.flashcards.length - 1}
              className="px-6 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 disabled:bg-gray-900 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            >
              Next
            </button>
          </div>

          <button
            onClick={() => {
              setFlashcards(null);
              setCurrentIndex(0);
              setIsFlipped(false);
            }}
            className="w-full px-4 py-2 bg-gray-800 text-gray-300 rounded-lg hover:bg-gray-700 transition-colors"
          >
            Generate New Flashcards
          </button>
          </div>
        )}
    </StudyPageShell>
  );
}
