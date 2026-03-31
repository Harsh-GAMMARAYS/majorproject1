'use client';

import ReactMarkdown from 'react-markdown';

interface MarkdownRendererProps {
  content: string;
  className?: string;
}

export default function MarkdownRenderer({
  content,
  className = 'prose prose-invert max-w-none',
}: MarkdownRendererProps) {
  return (
    <div className={className}>
      <ReactMarkdown
        components={{
          h1: ({ node, ...props }) => (
            <h1 className="text-2xl font-bold text-white mb-4" {...props} />
          ),
          h2: ({ node, ...props }) => (
            <h2 className="text-xl font-bold text-white mb-3 mt-4" {...props} />
          ),
          h3: ({ node, ...props }) => (
            <h3 className="text-lg font-bold text-white mb-2 mt-3" {...props} />
          ),
          p: ({ node, ...props }) => (
            <p className="text-gray-300 mb-3 leading-relaxed" {...props} />
          ),
          strong: ({ node, ...props }) => (
            <strong className="text-white font-bold" {...props} />
          ),
          em: ({ node, ...props }) => (
            <em className="text-gray-200 italic" {...props} />
          ),
          ul: ({ node, ...props }) => (
            <ul className="list-disc list-inside mb-3 text-gray-300 space-y-1" {...props} />
          ),
          ol: ({ node, ...props }) => (
            <ol className="list-decimal list-inside mb-3 text-gray-300 space-y-1" {...props} />
          ),
          li: ({ node, ...props }) => (
            <li className="text-gray-300" {...props} />
          ),
          code: ({ node, inline, children, ...props }: any) =>
            inline ? (
              <code className="bg-gray-800 text-emerald-400 px-2 py-1 rounded text-sm" {...props}>
                {children}
              </code>
            ) : (
              <code className="bg-gray-800 text-emerald-400 block p-3 rounded mb-3 overflow-x-auto" {...props}>
                {children}
              </code>
            ),
          blockquote: ({ node, ...props }) => (
            <blockquote
              className="border-l-4 border-emerald-500 pl-4 italic text-gray-300 mb-3"
              {...props}
            />
          ),
          a: ({ node, ...props }) => (
            <a className="text-emerald-400 hover:text-emerald-300 underline" {...props} />
          ),
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}
