'use client';

import { useState, useEffect, useCallback } from 'react';
import { getFileStatus, deleteFiles } from '@/lib/api';
import type { FileStatusResponse } from '@/types/api';
import { useAuth } from './AuthProvider';
import StatusBadge from './StatusBadge';
import LoadingSpinner from './LoadingSpinner';
import ErrorAlert from './ErrorAlert';
import Modal from './Modal';
import { HiDocumentText, HiFolder, HiFolderOpen, HiPlus, HiX, HiChevronRight, HiChevronDown } from 'react-icons/hi';

interface Folder {
  id: string;
  name: string;
  files: string[];
  parentId: string | null;
  expanded: boolean;
}

interface FileSystemProps {
  autoRefresh?: boolean;
  refreshInterval?: number;
  fileStatus?: FileStatusResponse;
  onRefresh?: () => Promise<void>;
}

export default function FileSystem({
  autoRefresh = true,
  refreshInterval = 5000,
  fileStatus: controlledFileStatus,
  onRefresh,
}: FileSystemProps) {
  const { user } = useAuth();
  const storageKey = user ? `fileSystemFolders_${user.id}` : null;

  const [internalFileStatus, setInternalFileStatus] = useState<FileStatusResponse>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [draggedFile, setDraggedFile] = useState<string | null>(null);
  const [showFolderMenu, setShowFolderMenu] = useState<string | null>(null);
  const [showAddFilesModal, setShowAddFilesModal] = useState<string | null>(null);
  const [filesToAdd, setFilesToAdd] = useState<Set<string>>(new Set());

  const fileStatus = controlledFileStatus ?? internalFileStatus;

  const saveFolders = useCallback((foldersToSave: Folder[]) => {
    if (typeof window !== 'undefined' && storageKey) {
      localStorage.setItem(storageKey, JSON.stringify(foldersToSave));
    }
  }, [storageKey]);

  const reconcileFoldersAndSelection = useCallback((status: FileStatusResponse) => {
    const availableFiles = new Set(Object.keys(status));

    setFolders((prev) => {
      const pruned = prev.map((folder) => ({
        ...folder,
        files: folder.files.filter((file) => availableFiles.has(file)),
      }));

      const allFiles = Object.keys(status);
      const filesInFolders = pruned.flatMap((folder) => folder.files);
      const orphanedFiles = allFiles.filter((file) => !filesInFolders.includes(file));

      const updated = orphanedFiles.length > 0
        ? [
            ...pruned.filter((f) => f.id !== 'uncategorized'),
            {
              id: 'uncategorized',
              name: 'My Uploads',
              files: orphanedFiles,
              parentId: null,
              expanded: true,
            },
          ]
        : pruned.filter((f) => f.id !== 'uncategorized');

      saveFolders(updated);
      return updated;
    });

    setSelectedFiles((prev) => {
      const next = new Set(Array.from(prev).filter((file) => availableFiles.has(file)));
      return next;
    });
  }, [saveFolders]);

  const fetchFileStatus = async () => {
    try {
      setError(null);
      const status = await getFileStatus();
      setInternalFileStatus(status);
      reconcileFoldersAndSelection(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch file status');
    } finally {
      setLoading(false);
    }
  };

  // Remove legacy global localStorage key from demo version
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('fileSystemFolders');
    }
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    if (!storageKey) {
      setFolders([]);
      setSelectedFiles(new Set());
      return;
    }

    const saved = localStorage.getItem(storageKey);
    if (!saved) {
      setFolders([]);
      return;
    }

    try {
      const parsed = JSON.parse(saved) as Folder[];
      setFolders(parsed);
    } catch {
      localStorage.removeItem(storageKey);
      setFolders([]);
    }
  }, [storageKey]);

  useEffect(() => {
    if (controlledFileStatus) {
      setLoading(false);
      reconcileFoldersAndSelection(controlledFileStatus);
      return;
    }

    fetchFileStatus();
    if (autoRefresh) {
      const interval = setInterval(fetchFileStatus, refreshInterval);
      return () => clearInterval(interval);
    }
  }, [autoRefresh, refreshInterval, controlledFileStatus, reconcileFoldersAndSelection]);

  useEffect(() => {
    saveFolders(folders);
  }, [folders, saveFolders]);

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) return;

    const newFolder: Folder = {
      id: `folder-${Date.now()}`,
      name: newFolderName.trim(),
      files: [],
      parentId: null,
      expanded: true,
    };

    setFolders([...folders, newFolder]);
    setNewFolderName('');
    setShowNewFolderModal(false);
  };

  const handleDeleteFolder = (folderId: string) => {
    const folder = folders.find(f => f.id === folderId);
    if (!folder) return;

    // Move files back to uncategorized before deleting folder
    if (folder.files.length > 0) {
      setFolders(prev => prev.map(f => 
        f.id === 'uncategorized'
          ? { ...f, files: [...f.files, ...folder.files] }
          : f
      ));
    }

    setFolders(prev => prev.filter(f => f.id !== folderId));
    setShowFolderMenu(null);
  };

  const handleToggleFolder = (folderId: string) => {
    setFolders(prev => prev.map(f => 
      f.id === folderId ? { ...f, expanded: !f.expanded } : f
    ));
  };

  const handleSelectFile = (filename: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(filename)) {
        newSet.delete(filename);
      } else {
        newSet.add(filename);
      }
      return newSet;
    });
  };

  const handleMoveFile = (filename: string, targetFolderId: string) => {
    setFolders(prev => {
      // Remove file from current folder
      let updated = prev.map(folder => ({
        ...folder,
        files: folder.files.filter(f => f !== filename),
      }));

      // Add file to target folder (avoid duplicates)
      updated = updated.map(folder =>
        folder.id === targetFolderId
          ? { ...folder, files: [...new Set([...folder.files, filename])] }
          : folder
      );

      return updated;
    });
  };

  const handleAddFilesToFolder = (folderId: string) => {
    if (filesToAdd.size === 0) return;

    setFolders(prev => {
      const updated = prev.map(folder => {
        if (folder.id === folderId) {
          // Add files to this folder, remove duplicates
          const newFiles = Array.from(filesToAdd).filter(f => !folder.files.includes(f));
          return { ...folder, files: [...folder.files, ...newFiles] };
        } else {
          // Remove files from other folders
          return { ...folder, files: folder.files.filter(f => !filesToAdd.has(f)) };
        }
      });
      return updated;
    });

    setFilesToAdd(new Set());
    setShowAddFilesModal(null);
  };

  const getAvailableFiles = () => {
    const allFiles = Object.keys(fileStatus);
    const filesInFolders = folders.flatMap(f => f.files);
    return allFiles.filter(f => {
      const status = fileStatus[f];
      return status.status === 'processed' && !filesInFolders.includes(f);
    });
  };

  const getAllProcessedFiles = () => {
    return Object.entries(fileStatus)
      .filter(([_, status]) => status.status === 'processed')
      .map(([filename]) => filename);
  };

  const handleDragStart = (filename: string) => {
    setDraggedFile(filename);
  };

  const handleDragOver = (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    if (draggedFile) {
      handleMoveFile(draggedFile, targetFolderId);
      setDraggedFile(null);
    }
  };

  const handleDelete = async () => {
    if (selectedFiles.size === 0) return;

    try {
      await deleteFiles(Array.from(selectedFiles));
      
      // Remove deleted files from all folders
      setFolders(prev => prev.map(folder => ({
        ...folder,
        files: folder.files.filter(f => !selectedFiles.has(f)),
      })));

      setSelectedFiles(new Set());
      setShowDeleteModal(false);
      if (onRefresh) {
        await onRefresh();
      } else {
        await fetchFileStatus();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete files');
    }
  };

  const getFileStatusItem = (filename: string) => {
    return fileStatus[filename] || { status: 'pending' as const };
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const allFilesInFolders = folders.flatMap(f => f.files.filter(file => fileStatus[file]));
  const orphanedFiles = Object.keys(fileStatus).filter(f => !allFilesInFolders.includes(f));

  return (
    <div className="space-y-4">
      {error && <ErrorAlert message={error} onDismiss={() => setError(null)} />}

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => setShowNewFolderModal(true)}
          className="flex items-center gap-2 rounded-2xl border border-gray-700 bg-black/20 px-3 py-2 text-sm text-gray-300 transition-colors hover:bg-white/[0.03]"
        >
          <HiPlus className="w-4 h-4" />
          New Folder
        </button>
        {selectedFiles.size > 0 && (
          <button
            onClick={() => setShowDeleteModal(true)}
            className="rounded-2xl bg-red-600 px-3 py-2 text-sm text-white transition-colors hover:bg-red-700"
          >
            Delete ({selectedFiles.size})
          </button>
        )}
      </div>

      {/* Folder Tree */}
      <div className="space-y-1">
        {folders.map((folder) => {
          const visibleFiles = folder.files.filter(filename => Boolean(fileStatus[filename]));
          const isDefaultFolder = folder.id === 'uncategorized';

          if (visibleFiles.length === 0) {
            return null;
          }

          return (
          <div key={folder.id} className="relative">
            {/* Folder Header */}
            <div
              className="group flex items-center gap-2 rounded-2xl p-2 transition-colors hover:bg-white/[0.03]"
              onDragOver={(e) => handleDragOver(e, folder.id)}
              onDrop={(e) => handleDrop(e, folder.id)}
            >
              <button
                onClick={() => handleToggleFolder(folder.id)}
                className="text-gray-400 hover:text-gray-300"
              >
                {folder.expanded ? (
                  <HiChevronDown className="w-4 h-4" />
                ) : (
                  <HiChevronRight className="w-4 h-4" />
                )}
              </button>
              {folder.expanded ? (
                <HiFolderOpen className="w-5 h-5 text-emerald-400" />
              ) : (
                <HiFolder className="w-5 h-5 text-gray-500" />
              )}
              <span className="flex-1 text-sm font-medium text-gray-300">{folder.name}</span>
              <span className="text-xs text-gray-500">({visibleFiles.length})</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  setShowAddFilesModal(folder.id);
                  setFilesToAdd(new Set());
                }}
                className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-emerald-400 transition-opacity"
                title="Add files to folder"
              >
                <HiPlus className="w-4 h-4" />
              </button>
              {!isDefaultFolder && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowFolderMenu(showFolderMenu === folder.id ? null : folder.id);
                  }}
                  className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-red-400 transition-opacity"
                >
                  <HiX className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Folder Menu */}
            {showFolderMenu === folder.id && !isDefaultFolder && (
              <div className="absolute left-8 top-8 bg-gray-800 border border-gray-700 rounded-lg shadow-lg z-10 p-2">
                <button
                  onClick={() => {
                    handleDeleteFolder(folder.id);
                  }}
                  className="w-full px-3 py-2 text-sm text-red-400 hover:bg-red-900/20 rounded text-left"
                >
                  Delete Folder
                </button>
              </div>
            )}

            {/* Folder Files */}
            {folder.expanded && (
              <div className="ml-8 mt-1 space-y-1">
                {visibleFiles.length === 0 ? (
                  <div className="text-xs text-gray-500 p-2">No files</div>
                ) : (
                  visibleFiles.map((filename) => {
                    const status = getFileStatusItem(filename);
                    
                    return (
                      <div
                        key={filename}
                        draggable
                        onDragStart={() => handleDragStart(filename)}
                        className="flex cursor-move items-center gap-2 rounded-xl p-2 transition-colors hover:bg-white/[0.03]"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(filename)}
                          onChange={(e) => {
                            e.stopPropagation();
                            handleSelectFile(filename);
                          }}
                          className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                        />
                        <HiDocumentText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs text-gray-300 truncate">{filename}</div>
                          <div className="flex items-center gap-2 mt-1">
                            <StatusBadge status={status.status} />
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        )})}

        {/* Orphaned Files (not in any folder) */}
        {orphanedFiles.length > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-800">
            <div className="text-xs text-gray-500 mb-2 px-2">Other Files</div>
            {orphanedFiles.map((filename) => {
              const status = getFileStatusItem(filename);
              
              return (
                <div
                  key={filename}
                  draggable
                  onDragStart={() => handleDragStart(filename)}
                className="flex cursor-move items-center gap-2 rounded-xl p-2 transition-colors hover:bg-white/[0.03]"
                >
                  <input
                    type="checkbox"
                    checked={selectedFiles.has(filename)}
                    onChange={(e) => {
                      e.stopPropagation();
                      handleSelectFile(filename);
                    }}
                    className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500 flex-shrink-0"
                  />
                  <HiDocumentText className="w-4 h-4 text-gray-500 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs text-gray-300 truncate">{filename}</div>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={status.status} />
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Empty State */}
        {Object.keys(fileStatus).length === 0 && (
          <div className="text-center py-16">
            <HiDocumentText className="w-16 h-16 mx-auto text-gray-500 mb-4" />
            <p className="text-gray-300 mb-2 text-lg">Saved sources will appear here</p>
            <p className="text-sm text-gray-500 px-4">
              Click Add source above to add PDFs, websites, text, videos, or audio files. Or import a file directly from Google Drive.
            </p>
          </div>
        )}
      </div>

      {/* New Folder Modal */}
      <Modal
        isOpen={showNewFolderModal}
        onClose={() => {
          setShowNewFolderModal(false);
          setNewFolderName('');
        }}
        title="Create New Folder"
        onConfirm={handleCreateFolder}
        confirmLabel="Create"
        cancelLabel="Cancel"
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-white mb-2">Folder Name</label>
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter') {
                  handleCreateFolder();
                }
              }}
              className="w-full px-3 py-2 border border-gray-700 bg-gray-800 text-white rounded-lg focus:ring-emerald-500 focus:border-emerald-500"
              placeholder="Enter folder name..."
              autoFocus
            />
          </div>
        </div>
      </Modal>

      {/* Delete Files Modal */}
      <Modal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        title="Delete Files"
        onConfirm={handleDelete}
        confirmLabel="Delete"
        cancelLabel="Cancel"
      >
        <p className="text-gray-300">
          Are you sure you want to delete {selectedFiles.size} file(s)? This action cannot be undone.
        </p>
        <ul className="mt-4 list-disc list-inside text-sm text-gray-400">
          {Array.from(selectedFiles).map((filename) => (
            <li key={filename}>{filename}</li>
          ))}
        </ul>
      </Modal>

      {/* Add Files to Folder Modal */}
      <Modal
        isOpen={showAddFilesModal !== null}
        onClose={() => {
          setShowAddFilesModal(null);
          setFilesToAdd(new Set());
        }}
        title={`Add Files to "${folders.find(f => f.id === showAddFilesModal)?.name || 'Folder'}"`}
        onConfirm={() => showAddFilesModal && handleAddFilesToFolder(showAddFilesModal)}
        confirmLabel="Add Files"
        cancelLabel="Cancel"
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-300 mb-4">
            Select files to add to this folder. Files will be moved from their current location.
          </p>
          <div className="max-h-64 overflow-y-auto border border-gray-700 rounded-lg bg-gray-800">
            {getAllProcessedFiles().length === 0 ? (
              <div className="p-4 text-center text-gray-400 text-sm">
                No processed files available
              </div>
            ) : (
              <div className="divide-y divide-gray-700">
                {getAllProcessedFiles().map((filename) => {
                  const status = fileStatus[filename];
                  const isSelected = filesToAdd.has(filename);
                  const currentFolder = folders.find(f => f.files.includes(filename));
                  
                  return (
                    <label
                      key={filename}
                      className="flex items-center px-4 py-3 hover:bg-gray-700 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={(e) => {
                          const newSet = new Set(filesToAdd);
                          if (e.target.checked) {
                            newSet.add(filename);
                          } else {
                            newSet.delete(filename);
                          }
                          setFilesToAdd(newSet);
                        }}
                        className="rounded border-gray-600 bg-gray-800 text-emerald-600 focus:ring-emerald-500"
                      />
                      <div className="ml-3 flex-1">
                        <div className="flex items-center justify-between">
                          <span className="text-sm font-medium text-white">{filename}</span>
                          <StatusBadge status={status.status} />
                        </div>
                        {currentFolder && (
                          <span className="text-xs text-gray-500 mt-1">
                            Currently in: {currentFolder.name}
                          </span>
                        )}
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
          {filesToAdd.size > 0 && (
            <p className="text-sm text-emerald-400 mt-2">
              {filesToAdd.size} file(s) selected
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}
