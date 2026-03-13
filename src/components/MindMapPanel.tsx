import React, { useState } from 'react';
import { Brain, Download, RefreshCw, ZoomIn, ZoomOut, Maximize } from 'lucide-react';
import { Meeting, MindMapNode } from '../contexts/MeetingContext';
import { useMeeting } from '../contexts/MeetingContext';

interface MindMapPanelProps {
  meeting: Meeting;
}

export default function MindMapPanel({ meeting }: MindMapPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [zoom, setZoom] = useState(1);
  const { generateMindMap } = useMeeting();

  const handleGenerateMindMap = () => {
    // Ask before overwriting the existing mind map with a new AI generation
    if (meeting.mindMap) {
      const confirmed = window.confirm(
        'Regenerating will replace the current mind map with a new AI-generated one. Continue?'
      );
      if (!confirmed) return;
    }
    setIsGenerating(true);
    generateMindMap(meeting.id);
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const renderMindMapNode = (node: MindMapNode, isRoot = false) => (
    <div
      key={node.id}
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all ${isRoot
        ? 'bg-theme-accent text-black px-5 py-3 rounded-2xl font-bold shadow-[0_0_25px_var(--accent-yellow-translucent)] border border-theme-accent/20'
        : 'bg-theme-card border border-theme-card-border px-4 py-2 rounded-xl text-sm font-medium text-theme-text shadow-lg hover:brightness-95 dark:hover:brightness-110 hover:scale-105 transition-all cursor-pointer'
        }`}
      style={{
        left: `${node.x * zoom}px`,
        top: `${node.y * zoom}px`,
        transform: `translate(-50%, -50%) scale(${zoom})`
      }}
    >
      {node.text}
      {node.children && node.children.map(child => (
        <React.Fragment key={child.id}>
          {/* Connection Line */}
          <svg
            className="absolute pointer-events-none"
            style={{
              left: '50%',
              top: '50%',
              width: `${Math.abs(child.x - node.x) * zoom}px`,
              height: `${Math.abs(child.y - node.y) * zoom}px`,
              transform: `translate(${child.x > node.x ? '0' : '-100%'}, ${child.y > node.y ? '0' : '-100%'})`
            }}
          >
            <line
              x1={child.x > node.x ? 0 : Math.abs(child.x - node.x) * zoom}
              y1={child.y > node.y ? 0 : Math.abs(child.y - node.y) * zoom}
              x2={child.x > node.x ? Math.abs(child.x - node.x) * zoom : 0}
              y2={child.y > node.y ? Math.abs(child.y - node.y) * zoom : 0}
              stroke="var(--card-border-color)"
              strokeWidth="2"
            />
          </svg>
          {renderMindMapNode(child)}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col pt-2 transition-colors duration-300">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-theme-card-border">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-theme-text">Mind Map</h3>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
              className="text-theme-icon hover:text-theme-text transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(Math.min(2, zoom + 0.1))}
              className="text-theme-icon hover:text-theme-text transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(1)}
              title="Reset zoom"
              className="text-theme-icon hover:text-theme-text transition-colors"
            >
              <Maximize className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleGenerateMindMap}
              disabled={isGenerating}
              title={meeting.mindMap ? 'Regenerate mind map (will replace current)' : 'Generate mind map'}
              className="text-theme-icon hover:text-theme-text transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>
            <button
              className="text-theme-icon hover:text-theme-text transition-colors disabled:opacity-50"
              disabled={!meeting.mindMap}
              title="Download mind map"
              onClick={() => {
                if (!meeting.mindMap) return;
                const blob = new Blob([JSON.stringify(meeting.mindMap, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `mindmap-${meeting.id}-${new Date().toISOString().split('T')[0]}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mind Map Content */}
      <div className="flex-1 overflow-hidden relative border-t border-theme-card-border bg-theme-bg/30">
        {isGenerating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-theme-accent mx-auto mb-3 animate-pulse drop-shadow-[0_0_15px_var(--accent-yellow-translucent)]" />
              <p className="text-theme-text font-medium">Generating mind map...</p>
              <p className="text-theme-text/60 text-sm mt-1">Analyzing conversation structure</p>
            </div>
          </div>
        ) : meeting.mindMap ? (
          <div className="relative w-full h-full overflow-auto custom-scrollbar">
            <div className="relative" style={{ width: '800px', height: '600px' }}>
              {renderMindMapNode(meeting.mindMap, true)}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-theme-icon opacity-50 mx-auto mb-3" />
              <p className="text-theme-text/60 mb-4">No mind map available yet</p>
              <button
                type="button"
                onClick={async (e) => {
                  e.preventDefault();
                  handleGenerateMindMap();
                }}
                className="bg-theme-accent text-black px-5 py-2.5 rounded-xl hover:brightness-110 transition-all shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] transform hover:-translate-y-0.5 flex items-center space-x-2 mx-auto font-bold"
              >
                <Brain className="w-4 h-4" />
                <span>Generate Mind Map</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
