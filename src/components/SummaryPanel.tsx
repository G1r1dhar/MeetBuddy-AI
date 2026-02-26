

import { useState } from "react"
import { FileText, Sparkles, Tag, Download, RefreshCw, AlertCircle, CheckCircle } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"
import { useMeeting } from "../contexts/MeetingContext"

interface SummaryPanelProps {
  meeting: Meeting
}

export default function SummaryPanel({ meeting }: SummaryPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [lastGenerated, setLastGenerated] = useState<Date | null>(null)
  const { generateSummary } = useMeeting()

  const handleGenerateSummary = async () => {
    setIsGenerating(true)
    setError(null)
    try {
      await generateSummary(meeting.id)
      setLastGenerated(new Date())
    } catch (err: any) {
      console.error('Summary generation failed:', err)
      setError(err.message || 'Failed to generate summary. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  const exportSummary = () => {
    if (!meeting.summary) {
      setError('No summary available to export')
      return
    }

    const summaryText = `# Meeting Summary: ${meeting.title}

## Overview
${meeting.summary}

## Key Topics
${meeting.topics?.map(topic => `- ${topic}`).join('\n') || 'No topics available'}

## Notes
${meeting.notes || 'No additional notes'}

Generated on: ${new Date().toLocaleString()}
`

    const blob = new Blob([summaryText], { type: 'text/markdown' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `meeting-summary-${meeting.id}-${new Date().toISOString().split('T')[0]}.md`
    a.click()
    URL.revokeObjectURL(url)
  }



  const hasTranscript = meeting.transcript && meeting.transcript.length > 0
  const canGenerateSummary = hasTranscript && (meeting.status === 'COMPLETED' || meeting.status === 'RECORDING')

  return (
    <div className="h-full flex flex-col pt-2">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-white/10">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-white">AI Summary</h3>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGenerating || !canGenerateSummary}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title={!canGenerateSummary ? 'Need transcript data to generate summary' : 'Regenerate summary'}
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={exportSummary}
              disabled={!meeting.summary}
              className="text-slate-400 hover:text-white transition-colors disabled:opacity-50"
              title="Export summary"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center space-x-2 mt-3">
          {lastGenerated && (
            <div className="flex items-center space-x-1.5 bg-emerald-500/20 border border-emerald-500/30 px-2.5 py-1 rounded-full">
              <CheckCircle className="w-3 h-3 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">
                Updated {lastGenerated.toLocaleTimeString()}
              </span>
            </div>
          )}
          {!hasTranscript && (
            <div className="flex items-center space-x-1.5 bg-amber-500/20 border border-amber-500/30 px-2.5 py-1 rounded-full">
              <AlertCircle className="w-3 h-3 text-amber-400" />
              <span className="text-xs font-medium text-amber-300">No transcript available</span>
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-rose-500/10 border-b border-rose-500/20">
          <div className="flex items-center space-x-2 text-rose-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">


        {/* AI Summary */}
        {isGenerating ? (
          <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-8 text-center backdrop-blur-md">
            <Sparkles className="w-10 h-10 text-amber-400 mx-auto mb-4 animate-pulse drop-shadow-[0_0_15px_rgba(251,191,36,0.5)]" />
            <p className="text-amber-200 font-medium text-lg">Generating AI summary...</p>
            <p className="text-amber-400/70 text-sm mt-2">Analyzing conversation and extracting key insights</p>
          </div>
        ) : meeting.summary ? (
          <div className="space-y-6">
            <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-5 backdrop-blur-md">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="w-5 h-5 text-amber-400" />
                <h4 className="font-semibold text-amber-300">Executive Summary</h4>
              </div>
              <p className="text-amber-50/90 leading-relaxed text-sm">{meeting.summary}</p>
            </div>

            {/* Key Topics */}
            {meeting.topics && meeting.topics.length > 0 && (
              <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-xl p-5 backdrop-blur-md">
                <div className="flex items-center space-x-2 mb-4">
                  <Tag className="w-5 h-5 text-indigo-400" />
                  <h4 className="font-semibold text-indigo-300">Key Topics Discussed</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {meeting.topics.map((topic, index) => (
                    <span
                      key={index}
                      className="bg-indigo-500/20 text-indigo-200 px-3.5 py-1.5 rounded-lg text-sm font-medium border border-indigo-500/30 shadow-sm"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced Action Items and Notes */}
            {meeting.notes && (
              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-5 backdrop-blur-md">
                <div className="flex items-center space-x-2 mb-3">
                  <Sparkles className="w-5 h-5 text-emerald-400" />
                  <h4 className="font-semibold text-emerald-300">Detailed Analysis</h4>
                </div>
                <div className="text-emerald-50/90 text-sm whitespace-pre-line leading-relaxed">{meeting.notes}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-slate-600 opacity-50 mx-auto mb-4" />
            <p className="text-slate-300 font-medium mb-4 text-lg">No summary available yet</p>
            {!hasTranscript ? (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-slate-400 text-sm leading-relaxed mb-4">
                  A transcript is needed to generate a summary. Start recording or upload a transcript first.
                </p>
              </div>
            ) : canGenerateSummary ? (
              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating}
                className="bg-gradient-to-r from-amber-500 to-orange-600 text-white px-5 py-2.5 rounded-xl hover:from-amber-400 hover:to-orange-500 transition-all shadow-[0_0_15px_rgba(245,158,11,0.3)] hover:shadow-[0_0_20px_rgba(245,158,11,0.5)] transform hover:-translate-y-0.5 flex items-center space-x-2 mx-auto font-bold disabled:opacity-50 disabled:transform-none"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'Generating...' : 'Generate AI Summary'}</span>
              </button>
            ) : (
              <p className="text-slate-500 text-sm">
                Complete the meeting to generate a summary
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
