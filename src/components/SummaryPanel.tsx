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
    <div className="h-full flex flex-col pt-2 transition-colors duration-300">
      {/* Header */}
      <div className="px-4 pb-4 pt-2 border-b border-theme-card-border">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-theme-text">AI Summary</h3>
          <div className="flex space-x-2">
            <button
              type="button"
              onClick={handleGenerateSummary}
              disabled={isGenerating || !canGenerateSummary}
              className="text-theme-icon hover:text-theme-accent transition-colors disabled:opacity-50"
              title={!canGenerateSummary ? 'Need transcript data to generate summary' : 'Regenerate summary'}
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
            </button>
            <button
              type="button"
              onClick={exportSummary}
              disabled={!meeting.summary}
              className="text-theme-icon hover:text-theme-accent transition-colors disabled:opacity-50"
              title="Export summary"
            >
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Status indicators */}
        <div className="flex items-center space-x-2 mt-3">
          {lastGenerated && (
            <div className="flex items-center space-x-1.5 bg-green-500/10 border border-green-500/20 px-2.5 py-1 rounded-full">
              <CheckCircle className="w-3 h-3 text-green-500" />
              <span className="text-xs font-medium text-green-600 dark:text-green-400">
                Updated {lastGenerated.toLocaleTimeString()}
              </span>
            </div>
          )}
          {!hasTranscript && (
            <div className="flex items-center space-x-1.5 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1 rounded-full">
              <AlertCircle className="w-3 h-3 text-yellow-500" />
              <span className="text-xs font-medium text-yellow-600 dark:text-yellow-400">No transcript available</span>
            </div>
          )}
        </div>
      </div>

      {/* Error display */}
      {error && (
        <div className="p-4 bg-red-500/10 border-b border-red-500/20">
          <div className="flex items-center space-x-2 text-red-500 dark:text-red-400">
            <AlertCircle className="w-4 h-4" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">


        {/* AI Summary */}
        {isGenerating ? (
          <div className="bg-theme-accent/10 border border-theme-accent/20 rounded-xl p-8 text-center backdrop-blur-md">
            <Sparkles className="w-10 h-10 text-theme-accent mx-auto mb-4 animate-pulse drop-shadow-[0_0_15px_var(--accent-yellow-translucent)]" />
            <p className="text-theme-text font-medium text-lg">Generating AI summary...</p>
            <p className="text-theme-text/70 text-sm mt-2">Analyzing conversation and extracting key insights</p>
          </div>
        ) : meeting.summary ? (
          <div className="space-y-6">
            <div className="bg-theme-bg border border-theme-card-border rounded-xl p-5 backdrop-blur-md">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="w-5 h-5 text-theme-accent" />
                <h4 className="font-semibold text-theme-text">Executive Summary</h4>
              </div>
              <p className="text-theme-text/90 leading-relaxed text-sm">{meeting.summary}</p>
            </div>

            {/* Key Topics */}
            {meeting.topics && meeting.topics.length > 0 && (
              <div className="bg-theme-bg border border-theme-card-border rounded-xl p-5 backdrop-blur-md">
                <div className="flex items-center space-x-2 mb-4">
                  <Tag className="w-5 h-5 text-theme-accent" />
                  <h4 className="font-semibold text-theme-text">Key Topics Discussed</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {meeting.topics.map((topic, index) => (
                    <span
                      key={index}
                      className="bg-theme-accent/10 text-theme-text px-3.5 py-1.5 rounded-lg text-sm font-medium border border-theme-card-border shadow-sm"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced Action Items and Notes */}
            {meeting.notes && (
              <div className="bg-theme-bg border border-theme-card-border rounded-xl p-5 backdrop-blur-md">
                <div className="flex items-center space-x-2 mb-3">
                  <Sparkles className="w-5 h-5 text-theme-accent" />
                  <h4 className="font-semibold text-theme-text">Detailed Analysis</h4>
                </div>
                <div className="text-theme-text/90 text-sm whitespace-pre-line leading-relaxed">{meeting.notes}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-12">
            <FileText className="w-16 h-16 text-theme-icon opacity-50 mx-auto mb-4" />
            <p className="text-theme-text font-medium mb-4 text-lg">No summary available yet</p>
            {!hasTranscript ? (
              <div className="text-center max-w-xs mx-auto">
                <p className="text-theme-text/60 text-sm leading-relaxed mb-4">
                  A transcript is needed to generate a summary. Start recording or upload a transcript first.
                </p>
              </div>
            ) : canGenerateSummary ? (
              <button
                onClick={handleGenerateSummary}
                disabled={isGenerating}
                className="bg-theme-accent text-black px-5 py-2.5 rounded-xl hover:brightness-110 transition-all shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] transform hover:-translate-y-0.5 flex items-center space-x-2 mx-auto font-bold disabled:opacity-50 disabled:transform-none"
              >
                <Sparkles className="w-4 h-4" />
                <span>{isGenerating ? 'Generating...' : 'Generate AI Summary'}</span>
              </button>
            ) : (
              <p className="text-theme-text/60 text-sm">
                Complete the meeting to generate a summary
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
