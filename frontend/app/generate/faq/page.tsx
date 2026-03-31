'use client';

import { useState } from 'react';
import { generateFAQ } from '@/lib/api';
import type { FAQResponse } from '@/types/api';
import FileSelector from '@/components/FileSelector';
import LoadingSpinner from '@/components/LoadingSpinner';
import ErrorAlert from '@/components/ErrorAlert';
import StudyPageShell from '@/components/StudyPageShell';

export default function FAQPage() {
  const [selectedFiles, setSelectedFiles] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [faqs, setFaqs] = useState<FAQResponse | null>(null);
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const handleGenerate = async () => {
    if (selectedFiles.length === 0) {
      setError('Please select at least one file');
      return;
    }

    setLoading(true);
    setError(null);
    setFaqs(null);

    try {
      const response = await generateFAQ(selectedFiles);
      setFaqs(response);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to generate FAQs');
    } finally {
      setLoading(false);
    }
  };

  return (
    <StudyPageShell
      eyebrow="Study Material"
      title="Generate FAQ"
      description="Turn your documents into quick study prompts and answers with the same study-room card treatment."
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
            'Generate FAQs'
          )}
        </button>

        {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

        {faqs && faqs.faqs.length > 0 && (
          <div className="mt-6 border-t border-gray-800 pt-6">
            <h2 className="text-xl font-semibold text-white mb-4">
              Generated FAQs ({faqs.faqs.length})
            </h2>
            <div className="space-y-3">
              {faqs.faqs.map((faq, index) => (
                <div
                  key={index}
                  className="overflow-hidden rounded-2xl border border-gray-700 bg-black/20"
                >
                  <button
                    onClick={() => setOpenIndex(openIndex === index ? null : index)}
                    className="flex w-full items-center justify-between bg-black/20 px-4 py-3 text-left transition-colors hover:bg-white/[0.03]"
                  >
                    <span className="font-medium text-white">{faq.question}</span>
                    <svg
                      className={`w-5 h-5 text-gray-500 transition-transform ${
                        openIndex === index ? 'transform rotate-180' : ''
                      }`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M19 9l-7 7-7-7"
                      />
                    </svg>
                  </button>
                  {openIndex === index && (
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
        )}
      </div>
    </StudyPageShell>
  );
}
