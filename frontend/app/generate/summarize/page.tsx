'use client';

import { useState } from 'react';
import { summarize } from '@/lib/api';
import type { SummarizeResponse } from '@/types/api';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import StudyPageShell from '@/components/StudyPageShell';

export default function SummarizePage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [summaries, setSummaries] = useState<SummarizeResponse | null>(null);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setSummaries(null);

    try {
      const response = await summarize(selectedFiles);
      setSummaries(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate summaries');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <StudyPageShell
      eyebrow="Study Material"
      title="Summarize Documents"
      description="Generate concise summaries from one or more documents using the same study-room visual language."
    >
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
            'Generate Summaries'
          )}
        </button>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {summaries && summaries.summaries.length > 0 && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <h2 className="text-xl font-semibold text-white mb-4">Generated Summaries</h2>
            <div className="space-y-4">
              {summaries.summaries.map((item) => (
                <div key={item.filename} className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                  <div className="flex justify-between items-center mb-2">
                    <h3 className="text-lg font-medium text-white">{item.filename}</h3>
                    <button
                      onClick={() => copyToClipboard(item.summary)}
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
        )}
      </div>
    </StudyPageShell>
  );
}
