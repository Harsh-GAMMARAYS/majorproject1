'use client';

import { useState, useEffect, useRef } from 'react';
import { 
  FiFileText,
  FiHelpCircle,
  FiSend,
  FiTrash2,
  FiGitBranch,
} from 'react-icons/fi';
import { BsQuestionCircle } from 'react-icons/bs';
import { HiOutlineDocumentText } from 'react-icons/hi';

interface StudioFeature {
  id: string;
  title: string;
  icon: React.ReactNode;
}

interface Note {
  id: string;
  content: string;
  timestamp: number;
}

interface StudioGridProps {
  onToolSelect: (toolId: string | null) => void;
  activeTool: string | null;
  onAddNote?: () => void;
}

export default function StudioGrid({ onToolSelect, activeTool }: StudioGridProps) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [newNote, setNewNote] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const notesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    loadNotes();
  }, []);

  useEffect(() => {
    if (showNotes && notesEndRef.current) {
      notesEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [notes, showNotes]);

  const loadNotes = () => {
    try {
      const saved = localStorage.getItem('studiioNotes');
      if (saved) {
        setNotes(JSON.parse(saved));
      }
    } catch (err) {
      console.error('Failed to load notes:', err);
    }
  };

  const saveNotes = (updatedNotes: Note[]) => {
    try {
      localStorage.setItem('studiioNotes', JSON.stringify(updatedNotes));
      setNotes(updatedNotes);
    } catch (err) {
      console.error('Failed to save notes:', err);
    }
  };

  const handleAddNote = () => {
    if (!newNote.trim()) return;

    const note: Note = {
      id: Date.now().toString(),
      content: newNote.trim(),
      timestamp: Date.now(),
    };

    const updatedNotes = [...notes, note];
    saveNotes(updatedNotes);
    setNewNote('');
    
    if (inputRef.current) {
      inputRef.current.style.height = 'auto';
    }
  };

  const handleDeleteNote = (id: string) => {
    const updatedNotes = notes.filter((note) => note.id !== id);
    saveNotes(updatedNotes);
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    
    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setNewNote(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px';
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAddNote();
    }
  };

  const features: StudioFeature[] = [
    {
      id: 'outline',
      title: 'Outline',
      icon: <HiOutlineDocumentText className="w-6 h-6" />,
    },
    {
      id: 'summarize',
      title: 'Summarize',
      icon: <FiFileText className="w-6 h-6" />,
    },
    {
      id: 'faq',
      title: 'FAQ',
      icon: <FiHelpCircle className="w-6 h-6" />,
    },
    {
      id: 'quiz',
      title: 'Quiz',
      icon: <BsQuestionCircle className="w-6 h-6" />,
    },
    {
      id: 'flashcards',
      title: 'Flashcards',
      icon: <FiFileText className="w-6 h-6" />,
    },
    {
      id: 'query',
      title: 'Query',
      icon: <FiHelpCircle className="w-6 h-6" />,
    },
    {
      id: 'graph',
      title: 'Knowledge Graph',
      icon: <FiGitBranch className="w-6 h-6" />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="p-6 border-b border-gray-800">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-bold text-gray-200">Studio</h2>
        </div>
      </div>

      {/* Toggle between Tools and Notes */}
      <div className="flex border-b border-gray-800">
        <button
          onClick={() => setShowNotes(false)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
            !showNotes
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Tools
        </button>
        <button
          onClick={() => setShowNotes(true)}
          className={`flex-1 px-4 py-3 text-sm font-medium transition-colors relative ${
            showNotes
              ? 'text-emerald-400 border-b-2 border-emerald-400'
              : 'text-gray-400 hover:text-gray-300'
          }`}
        >
          Notes
          {notes.length > 0 && (
            <span className="ml-1 text-xs bg-emerald-600 text-white px-1.5 py-0.5 rounded-full">
              {notes.length}
            </span>
          )}
        </button>
      </div>

      {!showNotes ? (
        // Tools View
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Language Selection Box - Placeholder */}
          <div 
            className="border border-emerald-600/30 rounded-lg p-4 bg-emerald-900/10 cursor-not-allowed opacity-50"
            title="Voice Interface - Coming soon"
          >
            <p className="text-sm text-gray-300 mb-3">Voice Interface - Interact in:</p>
            <div className="flex flex-wrap gap-2">
              {['हिन्दी', 'বাংলা', 'ગુજરાતી', 'ಕನ್ನಡ', 'മലയാളം', 'मराठी', 'ਪੰਜਾਬੀ', 'தமிழ்', 'తెలుగు'].map((lang) => (
                <span key={lang} className="text-xs text-gray-400">{lang}</span>
              ))}
            </div>
            <p className="text-xs text-gray-500 mt-2 italic">Coming soon</p>
          </div>

          {/* Feature Grid */}
          <div className="grid grid-cols-2 gap-3">
            {features.map((feature) => (
              <button
                key={feature.id}
                onClick={() => onToolSelect(activeTool === feature.id ? null : feature.id)}
                className={`group relative rounded-lg border p-4 transition-all ${
                  activeTool === feature.id
                    ? 'border-emerald-500 bg-emerald-900/20'
                    : 'border-gray-700 bg-gray-800/50 hover:border-gray-600 hover:bg-gray-800'
                }`}
              >
                <div className="flex flex-col items-center text-center gap-2">
                  <div className={`transition-colors ${
                    activeTool === feature.id ? 'text-emerald-400' : 'text-gray-400 group-hover:text-gray-300'
                  }`}>
                    {feature.icon}
                  </div>
                  <h3 className={`text-sm font-medium transition-colors ${
                    activeTool === feature.id ? 'text-emerald-300' : 'text-gray-300 group-hover:text-gray-200'
                  }`}>
                    {feature.title}
                  </h3>
                </div>
              </button>
            ))}
          </div>

          {/* Instructions */}
          <p className="text-xs text-gray-500 leading-relaxed">
            Studio output will be saved here. After adding sources, click to add Voice Interface, Study Guide, Mind Map, and more!
          </p>
        </div>
      ) : (
        // Notes Chat View
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Notes Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {notes.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-center px-6">
                <div className="bg-gray-800/50 rounded-full p-4 mb-4">
                  <FiFileText className="w-8 h-8 text-gray-500" />
                </div>
                <p className="text-sm text-gray-400 mb-1">No notes yet</p>
                <p className="text-xs text-gray-600">Start taking notes for your study session</p>
              </div>
            ) : (
              notes.map((note) => (
                <div
                  key={note.id}
                  className="group bg-gray-800/50 rounded-lg p-3 hover:bg-gray-800 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-200 whitespace-pre-wrap wrap-break-word">
                        {note.content}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {formatTime(note.timestamp)}
                      </p>
                    </div>
                    <button
                      onClick={() => handleDeleteNote(note.id)}
                      className="shrink-0 text-gray-600 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-all p-1"
                      title="Delete note"
                    >
                      <FiTrash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
            <div ref={notesEndRef} />
          </div>

          {/* Chat Input */}
          <div className="p-4 border-t border-gray-800 bg-gray-900/50">
            <div className="flex items-end gap-2">
              <textarea
                ref={inputRef}
                value={newNote}
                onChange={handleTextareaChange}
                onKeyDown={handleKeyDown}
                placeholder="Type a note... (Enter to send, Shift+Enter for new line)"
                className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-gray-200 text-sm placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent resize-none min-h-10 max-h-[120px]"
                rows={1}
              />
              <button
                onClick={handleAddNote}
                disabled={!newNote.trim()}
                className="shrink-0 p-2.5 bg-emerald-600 hover:bg-emerald-700 disabled:bg-gray-700 disabled:cursor-not-allowed text-white rounded-lg transition-colors"
                title="Send note"
              >
                <FiSend className="w-4 h-4" />
              </button>
            </div>
            <p className="text-xs text-gray-600 mt-2">
              {notes.length} {notes.length === 1 ? 'note' : 'notes'} saved
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
