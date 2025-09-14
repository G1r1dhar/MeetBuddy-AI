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
      className={`absolute transform -translate-x-1/2 -translate-y-1/2 ${
        isRoot 
          ? 'bg-indigo-600 text-white px-4 py-3 rounded-xl font-semibold shadow-lg' 
          : 'bg-white border-2 border-indigo-200 px-3 py-2 rounded-lg text-sm shadow-md hover:shadow-lg transition-shadow'
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
              stroke="#e5e7eb"
              strokeWidth="2"
            />
          </svg>
          {renderMindMapNode(child)}
        </React.Fragment>
      ))}
    </div>
  );

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold text-gray-900">Mind Map</h3>
          <div className="flex space-x-2">
            <button
              onClick={() => setZoom(Math.max(0.5, zoom - 0.1))}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ZoomOut className="w-4 h-4" />
            </button>
            <button
              onClick={() => setZoom(Math.min(2, zoom + 0.1))}
              className="text-gray-400 hover:text-gray-600 transition-colors"
            >
              <ZoomIn className="w-4 h-4" />
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <Maximize className="w-4 h-4" />
            </button>
            <button
              onClick={handleGenerateMindMap}
              disabled={isGenerating}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Mind Map Content */}
      <div className="flex-1 overflow-hidden relative bg-gray-50">
        {isGenerating ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-indigo-500 mx-auto mb-3 animate-pulse" />
              <p className="text-indigo-700 font-medium">Generating mind map...</p>
              <p className="text-indigo-600 text-sm mt-1">Analyzing conversation structure</p>
            </div>
          </div>
        ) : meeting.mindMap ? (
          <div className="relative w-full h-full overflow-auto">
            <div className="relative" style={{ width: '800px', height: '600px' }}>
              {renderMindMapNode(meeting.mindMap, true)}
            </div>
          </div>
        ) : (
          <div className="h-full flex items-center justify-center">
            <div className="text-center">
              <Brain className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 mb-4">No mind map available yet</p>
              {meeting.status === 'completed' && (
                <button
                  onClick={handleGenerateMindMap}
                  className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors flex items-center space-x-2 mx-auto"
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
