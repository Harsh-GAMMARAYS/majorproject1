'use client';

import { useState } from 'react';
import { generateOutline } from '@/lib/api';
import type { OutlineResponse } from '@/types/api';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import StudyPageShell from '@/components/StudyPageShell';

export default function OutlinePage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [combine, setCombine] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [outline, setOutline] = useState<OutlineResponse | null>(null);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setOutline(null);

    try {
      const response = await generateOutline(selectedFiles, combine);
      setOutline(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate outline');
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    // You could add a toast notification here
  };

  return (
    <StudyPageShell
      eyebrow="Study Material"
      title="Generate Outline"
      description="Create structured outlines from your source documents with the same study-room presentation style."
    >
      <div className="rounded-[28px] border border-gray-800 bg-[linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-6 space-y-6">
        <FileSelector
          selectedFiles={selectedFiles}
          onSelectionChange={setSelectedFiles}
          multiple={true}
        />

        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="combine"
            checked={combine}
            onChange={(e) => setCombine(e.target.checked)}
            className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500"
          />
          <label htmlFor="combine" className="text-sm text-white">
            Combine outlines into a single hierarchical outline
          </label>
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
            'Generate Outline'
          )}
        </button>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {outline && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-xl font-semibold text-white">Generated Outline</h2>
              <button
                onClick={() => {
                  const text = outline.combined_outline
                    ? outline.combined_outline
                    : Object.values(outline.individual_outlines || {}).join('\n\n');
                  copyToClipboard(text);
                }}
                className="text-sm text-emerald-400 hover:text-emerald-300"
              >
                Copy to Clipboard
              </button>
            </div>

            {outline.combined_outline ? (
              <div className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                <pre className="whitespace-pre-wrap text-sm text-gray-200 font-mono">
                  {outline.combined_outline}
                </pre>
              </div>
            ) : (
              <div className="space-y-4">
                {Object.entries(outline.individual_outlines || {}).map(([filename, outlineText]) => (
                  <div key={filename} className="rounded-2xl border border-gray-700 bg-black/20 p-4">
                    <h3 className="text-lg font-medium text-white mb-2">{filename}</h3>
                    <div className="flex justify-end mb-2">
                      <button
                        onClick={() => copyToClipboard(outlineText)}
                        className="text-xs text-emerald-400 hover:text-emerald-300"
                      >
                        Copy
                      </button>
                    </div>
                    <pre className="whitespace-pre-wrap rounded-2xl bg-black/20 p-3 text-sm font-mono text-gray-200">
                      {outlineText}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </StudyPageShell>
  );
}
