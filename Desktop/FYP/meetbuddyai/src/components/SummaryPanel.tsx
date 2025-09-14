"use client"

import { useState } from "react"
import { FileText, Sparkles, Clock, Tag, Download, RefreshCw } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"
import { useMeeting } from "../contexts/MeetingContext"

interface SummaryPanelProps {
  meeting: Meeting
}

export default function SummaryPanel({ meeting }: SummaryPanelProps) {
  const [isGenerating, setIsGenerating] = useState(false)
  const { generateSummary } = useMeeting()

  const handleGenerateSummary = async () => {
    setIsGenerating(true)
    try {
      await generateSummary(meeting.id)
    } finally {
      setIsGenerating(false)
    }
  }

  const formatDuration = (start: Date, end?: Date) => {
    const endTime = end || new Date()
    const duration = Math.floor((endTime.getTime() - start.getTime()) / 1000 / 60)
    return `${duration} minutes`
  }

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-gray-900">AI Summary</h3>
          <div className="flex space-x-2">
            <button
              onClick={handleGenerateSummary}
              disabled={isGenerating}
              className="text-gray-400 hover:text-gray-600 transition-colors disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${isGenerating ? "animate-spin" : ""}`} />
            </button>
            <button className="text-gray-400 hover:text-gray-600 transition-colors">
              <Download className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {/* Meeting Info */}
        <div className="bg-gray-50 rounded-lg p-4 mb-6">
          <h4 className="font-medium text-gray-900 mb-3">Meeting Details</h4>
          <div className="space-y-2 text-sm">
            <div className="flex items-center text-gray-600">
              <Clock className="w-4 h-4 mr-2" />
              <span>Duration: {formatDuration(meeting.startTime, meeting.endTime)}</span>
            </div>
            <div className="flex items-center text-gray-600">
              <Tag className="w-4 h-4 mr-2" />
              <span>Status: {meeting.status}</span>
            </div>
          </div>
        </div>

        {/* AI Summary */}
        {isGenerating ? (
          <div className="bg-black border border-yellow-400 rounded-lg p-6 text-center">
            <Sparkles className="w-8 h-8 text-yellow-400 mx-auto mb-3 animate-pulse" />
            <p className="text-yellow-400 font-medium">Generating AI summary...</p>
            <p className="text-cyan-400 text-sm mt-1">Analyzing conversation and extracting key insights</p>
          </div>
        ) : meeting.summary ? (
          <div className="space-y-6">
            <div className="bg-black border border-yellow-400 rounded-lg p-4">
              <div className="flex items-center space-x-2 mb-3">
                <FileText className="w-5 h-5 text-yellow-400" />
                <h4 className="font-medium text-yellow-400">Executive Summary</h4>
              </div>
              <p className="text-white leading-relaxed">{meeting.summary}</p>
            </div>

            {/* Key Topics */}
            {meeting.topics && meeting.topics.length > 0 && (
              <div className="bg-black border border-cyan-400 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Tag className="w-5 h-5 text-cyan-400" />
                  <h4 className="font-medium text-cyan-400">Key Topics Discussed</h4>
                </div>
                <div className="flex flex-wrap gap-2">
                  {meeting.topics.map((topic, index) => (
                    <span
                      key={index}
                      className="bg-cyan-900 text-cyan-300 px-3 py-1 rounded-full text-sm font-medium border border-cyan-400"
                    >
                      {topic}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Enhanced Action Items and Notes */}
            {meeting.notes && (
              <div className="bg-black border border-yellow-400 rounded-lg p-4">
                <div className="flex items-center space-x-2 mb-3">
                  <Sparkles className="w-5 h-5 text-yellow-400" />
                  <h4 className="font-medium text-yellow-400">Detailed Analysis</h4>
                </div>
                <div className="text-white text-sm whitespace-pre-line leading-relaxed">{meeting.notes}</div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-8">
            <FileText className="w-12 h-12 text-gray-600 mx-auto mb-3" />
            <p className="text-gray-400 mb-4">No summary available yet</p>
            {meeting.status === "completed" && (
              <button
                onClick={handleGenerateSummary}
                className="bg-yellow-500 text-black px-4 py-2 rounded-lg hover:bg-yellow-400 transition-colors flex items-center space-x-2 mx-auto font-medium"
              >
                <Sparkles className="w-4 h-4" />
                <span>Generate AI Summary</span>
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
