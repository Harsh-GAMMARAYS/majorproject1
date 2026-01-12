'use client';

import React, { useEffect, useRef, useState, useCallback } from 'react';
import type { GraphData } from '@/types/api';

interface KnowledgeGraphVisualizationProps {
  graphData: GraphData | null | undefined;
  htmlFallbackUrl?: string | null;
  title?: string;
}

// Extend Window interface for TypeScript
declare global {
  interface Window {
    vis: any;
  }
}

export default function KnowledgeGraphVisualization({
  graphData,
  htmlFallbackUrl,
  title = 'Knowledge Graph Visualization',
}: KnowledgeGraphVisualizationProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const networkRef = useRef<any>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [useFallback, setUseFallback] = useState(false);

  const initializeGraph = useCallback(() => {
    if (!graphData || !containerRef.current) {
      setIsLoading(false);
      if (!graphData && htmlFallbackUrl) {
        setUseFallback(true);
      }
      return;
    }

    try {
      setError(null);
      
      // Prepare data for vis.js
      const nodes = new (window.vis as any).DataSet(
        graphData.nodes.map((node) => ({
          id: node.id,
          label: node.label,
          title: node.title,
          color: {
            background: '#1f5233',
            border: '#4ade80',
            highlight: {
              background: '#22c55e',
              border: '#16a34a',
            },
          },
          font: {
            color: '#e5e7eb',
            size: 14,
            face: 'Arial',
          },
          borderWidth: 2,
          borderWidthSelected: 3,
        }))
      );

      const edges = new (window.vis as any).DataSet(
        graphData.edges.map((edge) => ({
          from: edge.from,
          to: edge.to,
          label: edge.label,
          title: edge.title,
          color: {
            color: '#6b7280',
            highlight: '#10b981',
            hover: '#10b981',
          },
          arrows: {
            to: {
              enabled: true,
              scaleFactor: 0.5,
            },
          },
          font: {
            color: '#d1d5db',
            size: 12,
            face: 'Arial',
            multi: true,
          },
          smooth: {
            type: 'continuous',
            roundness: 0.5,
          },
        }))
      );

      const options = {
        physics: {
          enabled: true,
          stabilization: {
            iterations: 200,
            updateInterval: 25,
          },
          barnesHut: {
            gravitationalConstant: -15000,
            centralGravity: 0.3,
            springLength: 200,
            springConstant: 0.04,
            damping: 0.09,
            avoidOverlap: 0.2,
          },
        },
        interaction: {
          navigationButtons: true,
          keyboard: true,
          zoomView: true,
          dragView: true,
          hover: true,
        },
        nodes: {
          margin: {
            left: 10,
            right: 10,
            top: 10,
            bottom: 10,
          },
          scaling: {
            min: 14,
            max: 30,
          },
        },
      };

      const data = { nodes, edges };

      if (networkRef.current) {
        networkRef.current.destroy();
      }

      networkRef.current = new (window.vis as any).Network(
        containerRef.current,
        data,
        options
      );

      // Handle network events
      networkRef.current.once('stabilizationIterationsDone', () => {
        setIsLoading(false);
        networkRef.current.setOptions({ physics: false });
      });

      // Fallback: if stabilization takes too long, disable physics anyway
      const timeout = setTimeout(() => {
        if (networkRef.current) {
          networkRef.current.setOptions({ physics: false });
          setIsLoading(false);
        }
      }, 5000);

      return () => clearTimeout(timeout);
    } catch (err) {
      console.error('Error initializing graph:', err);
      setError(
        err instanceof Error
          ? err.message
          : 'Failed to initialize knowledge graph'
      );
      setIsLoading(false);
      if (htmlFallbackUrl) {
        setUseFallback(true);
      }
    }
  }, [graphData, htmlFallbackUrl]);

  useEffect(() => {
    // Load vis.js from CDN
    if (!window.vis) {
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/vis-network/standalone/umd/vis-network.min.js';
      script.onload = () => {
        initializeGraph();
      };
      script.onerror = () => {
        setError('Failed to load vis.js library from CDN');
        setIsLoading(false);
      };
      document.head.appendChild(script);

      // Load CSS
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = 'https://unpkg.com/vis-network/styles/vis-network.min.css';
      document.head.appendChild(link);
    } else {
      initializeGraph();
    }

    return () => {
      if (networkRef.current) {
        networkRef.current.destroy();
      }
    };
  }, [initializeGraph]);

  if (useFallback && htmlFallbackUrl) {
    return (
      <div className="w-full">
        <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-3 mb-4">
          <p className="text-yellow-300 text-sm">
            Using HTML visualization (fallback mode)
          </p>
        </div>
        <div className="border border-gray-800 rounded-lg overflow-hidden bg-white">
          <iframe
            src={htmlFallbackUrl}
            className="w-full h-96"
            title={title}
            sandbox="allow-same-origin allow-scripts"
            onError={(e) => {
              console.error('Graph iframe error:', e);
              setError('Failed to load HTML graph');
            }}
          />
        </div>
      </div>
    );
  }

  if (error && !useFallback && htmlFallbackUrl) {
    return (
      <div className="w-full space-y-4">
        <div className="bg-red-900/20 border border-red-800 rounded-lg p-3">
          <p className="text-red-300 text-sm">{error}</p>
        </div>
        <button
          onClick={() => setUseFallback(true)}
          className="text-sm px-3 py-2 bg-gray-700 text-gray-200 rounded hover:bg-gray-600"
        >
          Try HTML Fallback
        </button>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-900/20 border border-red-800 rounded-lg p-4">
        <p className="text-red-300">{error}</p>
      </div>
    );
  }

  if (!graphData && !useFallback) {
    return (
      <div className="bg-yellow-900/20 border border-yellow-800 rounded-lg p-4">
        <p className="text-yellow-300">No graph data available</p>
      </div>
    );
  }

  return (
    <div className="w-full space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-white">{title}</h3>
        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <div className="animate-spin h-4 w-4 border-2 border-gray-400 border-t-emerald-400 rounded-full"></div>
            Rendering graph...
          </div>
        )}
      </div>

      <div
        ref={containerRef}
        className="w-full border border-gray-800 rounded-lg overflow-hidden bg-[#1a1a1a]"
        style={{
          height: '600px',
          position: 'relative',
        }}
      />

      {graphData && (
        <div className="text-xs text-gray-400 space-y-1">
          <p>
            <span className="font-semibold">Nodes:</span> {graphData.nodes.length}
            {' | '}
            <span className="font-semibold">Edges:</span> {graphData.edges.length}
          </p>
          <p className="text-gray-500">
            💡 Drag to move • Scroll to zoom • Double-click to expand
          </p>
        </div>
      )}
    </div>
  );
}
