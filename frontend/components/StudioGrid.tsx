'use client';

import { useState } from 'react';
import { 
  FiFileText,
  FiHelpCircle,
  FiGitBranch,
  FiUsers,
} from 'react-icons/fi';
import { BsQuestionCircle } from 'react-icons/bs';
import { HiOutlineDocumentText } from 'react-icons/hi';

interface StudioFeature {
  id: string;
  title: string;
  icon: React.ReactNode;
}

interface StudioGridProps {
  onToolSelect: (toolId: string | null) => void;
  activeTool: string | null;
}

export default function StudioGrid({ onToolSelect, activeTool }: StudioGridProps) {
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
    {
      id: 'rooms',
      title: 'Study Rooms',
      icon: <FiUsers className="w-6 h-6" />,
    },
  ];

  return (
    <div className="flex flex-col h-full">
      <div className="border-b border-gray-800 px-5 py-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.24em] text-emerald-400">Workspace</p>
        <div className="mt-2 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-gray-100">Tools</h2>
            <p className="mt-1 text-sm text-gray-500">Choose how to work with the selected sources.</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Language Selection Box - Placeholder */}
          <div 
            className="cursor-not-allowed rounded-[24px] border border-emerald-600/25 bg-[radial-gradient(circle_at_top_left,_rgba(16,185,129,0.1),_transparent_35%),linear-gradient(180deg,#141414_0%,#0b0b0b_100%)] p-4 opacity-60"
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
                className={`group relative rounded-[22px] border p-4 transition-all ${
                  activeTool === feature.id
                    ? 'border-emerald-500 bg-emerald-950/20 shadow-[0_14px_40px_rgba(16,185,129,0.08)]'
                    : 'border-gray-700 bg-black/20 hover:border-gray-600 hover:bg-white/[0.03]'
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

          <p className="text-xs text-gray-500 leading-relaxed">
            Run a tool after selecting sources from the library.
          </p>
      </div>
    </div>
  );
}
