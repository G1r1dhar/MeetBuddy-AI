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
    setIsGenerating(true);
    generateMindMap(meeting.id);
    setTimeout(() => setIsGenerating(false), 3000);
  };

  const renderMindMapNode = (node: MindMapNode, isRoot = false) => (
    <div
      key={node.id}
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 transition-all ${isRoot
        ? 'bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-3 rounded-2xl font-bold shadow-[0_0_25px_rgba(99,102,241,0.4)] border border-white/20'
        : 'bg-white/10 backdrop-blur-md border border-white/20 px-4 py-2 rounded-xl text-sm font-medium text-indigo-100 shadow-lg hover:bg-white/20 hover:scale-105 transition-all cursor-pointer'
        }`}
      style={{
        left: `${node.x * zoom}px`,
        top: `${node.y * zoom}px`,
        transform: `translate(-50%, -50%) scale(${zoom})`
      }}
    >
      {node.text}
      {node.children.map(child => (
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
              stroke="rgba(255,255,255,0.15)"
              strokeWidth="2"
            />
          </svg>
          {renderMindMapNode(child)}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col pt-2">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-white/10">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-white">Mind Map</h3>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={() => setZoom(Math.min(2, zoom + 0.1))}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button className="text-slate-400 hover:text-white transition-colors">
              <Maximize className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleGenerateMindMap}
              disabled={isGenerating}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>
            <button className="text-slate-400 hover:text-white transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mind Map Content */}
      <div className="flex-1 overflow-hidden relative">
        {isGenerating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-indigo-400 mx-auto mb-3 animate-pulse drop-shadow-[0_0_15px_rgba(99,102,241,0.5)]" />
              <p className="text-indigo-200 font-medium">Generating mind map...</p>
              <p className="text-indigo-300 text-sm mt-1 opacity-70">Analyzing conversation structure</p>
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
              <Brain className="w-12 h-12 text-slate-600 opacity-50 mx-auto mb-3" />
              <p className="text-slate-400 mb-4">No mind map available yet</p>
              {meeting.status === 'COMPLETED' && (
                <button
                  type="button"
                  onClick={async (e) => {
                    e.preventDefault();
                    handleGenerateMindMap();
                  }}
                  className="bg-gradient-to-r from-indigo-500 to-purple-600 text-white px-5 py-2.5 rounded-xl hover:from-indigo-400 hover:to-purple-500 transition-all shadow-[0_0_15px_rgba(99,102,241,0.3)] hover:shadow-[0_0_20px_rgba(99,102,241,0.5)] transform hover:-translate-y-0.5 flex items-center space-x-2 mx-auto font-medium"
                >
                  <Brain className="w-4 h-4" />
                  <span>Generate Mind Map</span>
                </button>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
