'use client';

import { useState, useEffect } from 'react';
import { getFileStatus } from '@/lib/api';
import type { FileStatusResponse } from '@/types/api';
import LoadingSpinner from './LoadingSpinner';
import StatusBadge from './StatusBadge';

interface FileSelectorProps {
  selectedFiles: string[];
  onSelectionChange: (files: string[]) => void;
  multiple?: boolean;
}

export default function FileSelector({
  selectedFiles,
  onSelectionChange,
  multiple = true,
}: FileSelectorProps) {
  const [fileStatus, setFileStatus] = useState<FileStatusResponse>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchFiles = async () => {
      try {
        const status = await getFileStatus();
        setFileStatus(status);
      } catch (err) {
        console.error('Failed to fetch file status:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchFiles();
  }, []);

  const processedFiles = Object.entries(fileStatus).filter(
    ([_, status]) => status.status === 'processed'
  );

  const handleToggle = (filename: string) => {
    if (multiple) {
      if (selectedFiles.includes(filename)) {
        onSelectionChange(selectedFiles.filter((f) => f !== filename));
      } else {
        onSelectionChange([...selectedFiles, filename]);
      }
    } else {
      onSelectionChange([filename]);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (processedFiles.length === 0) {
    return (
      <div className="rounded-xl border border-gray-700/80 bg-black/25 p-3">
        <p className="text-sm text-gray-300">
          No processed files yet.
          <span className="ml-1 text-gray-500">Upload files and wait for processing to complete.</span>
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <label className="mb-2 block text-xs font-medium uppercase tracking-[0.18em] text-gray-400">
        Select Files {multiple && '(multiple selection)'}
      </label>
      <div className="max-h-64 overflow-y-auto rounded-2xl border border-gray-800 bg-[linear-gradient(180deg,#141414_0%,#0d0d0d_100%)] divide-y divide-gray-800">
        {processedFiles.map(([filename, status]) => (
          <label
            key={filename}
            className="flex cursor-pointer items-center px-4 py-3 transition-colors hover:bg-white/[0.03]"
          >
            <input
              type={multiple ? 'checkbox' : 'radio'}
              checked={selectedFiles.includes(filename)}
              onChange={() => handleToggle(filename)}
              className="rounded border-gray-600 bg-black/30 text-emerald-600 focus:ring-emerald-500"
            />
            <div className="ml-3 flex-1">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{filename}</span>
                <StatusBadge status={status.status} />
              </div>
            </div>
          </label>
        ))}
      </div>
      {selectedFiles.length > 0 && (
        <p className="text-sm text-gray-400 mt-2">
          {selectedFiles.length} file(s) selected
        </p>
      )}
    </div>
  );
}
