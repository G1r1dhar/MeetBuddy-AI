import { useState } from "react"
import { Link } from "react-router-dom"
import { Calendar, Users, Play, FileText, Brain, ExternalLink, Mic, Download, Trash2, MoreVertical, AlertTriangle } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"
import { useMeeting } from "../contexts/MeetingContext"
import { meetingService } from "../services/meetingService"

interface MeetingCardProps {
  meeting: Meeting
}

export default function MeetingCard({ meeting }: MeetingCardProps) {
  const { deleteMeeting } = useMeeting()
  const [showActions, setShowActions] = useState(false)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [isExporting, setIsExporting] = useState(false)

  const getStatusColor = (status: Meeting["status"]) => {
    switch (status) {
      case "RECORDING":
        return "bg-green-500/10 text-green-600 border-green-500/20"
      case "SCHEDULED":
        return "bg-blue-500/10 text-blue-600 border-blue-500/20"
      case "COMPLETED":
        return "bg-gray-500/10 text-gray-600 dark:text-gray-400 border-gray-500/20"
      default:
        return "bg-theme-bg text-theme-text border-theme-card-border"
    }
  }

  const formatTime = (dateInput: any) => {
    try {
      const date = new Date(dateInput);
      if (isNaN(date.getTime())) return '--:--';

      return new Intl.DateTimeFormat("en-US", {
        hour: "2-digit",
        minute: "2-digit",
        month: "short",
        day: "numeric",
      }).format(date)
    } catch (e) {
      return '--:--';
    }
  }

  const handleExport = async (format: 'pdf' | 'json' | 'txt' | 'csv' | any) => {
    setIsExporting(true)
    try {
      // Use the backend export API
      const blob = await meetingService.exportMeeting(meeting.id, format)

      const filename = `meeting-${meeting.title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}-${new Date().toISOString().split('T')[0]}.${format}`

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = filename
      a.click()
      URL.revokeObjectURL(url)

      setShowActions(false)
    } catch (error) {
      console.error('Export failed:', error)
      alert('Export failed. Please try again.')
    } finally {
      setIsExporting(false)
    }
  }

  const handleDelete = async () => {
    try {
      await deleteMeeting(meeting.id)
      setShowDeleteConfirm(false)
      setShowActions(false)
    } catch (error) {
      console.error('Failed to delete meeting:', error)
      alert('Failed to delete meeting. Please try again.')
    }
  }

  return (
    <div className="bg-theme-card rounded-xl border border-theme-card-border p-6 hover:shadow-lg transition-all duration-200 hover:border-theme-accent dark:shadow-theme-accent/5">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-theme-text mb-1">{meeting.title}</h3>
          <p className="text-theme-text opacity-70 text-sm line-clamp-2">{meeting.description}</p>
        </div>
        <div className="flex flex-col items-end space-y-2 relative z-10">
          <span className="text-xs text-theme-text opacity-70 bg-theme-bg px-2 py-1 rounded border border-theme-card-border">{meeting.platform}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(meeting.status)}`}>
            {meeting.status}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center text-sm text-theme-text opacity-70">
          <Calendar className="w-4 h-4 mr-2" />
          <span>{formatTime(meeting.scheduledTime)}</span>
          {meeting.endTime && (
            <>
              <span className="mx-2">-</span>
              <span>{formatTime(meeting.endTime)}</span>
            </>
          )}
        </div>

        <div className="flex items-center text-sm text-theme-text opacity-70">
          <Users className="w-4 h-4 mr-2" />
          <span>{meeting.participants.length} participants</span>
        </div>

        {meeting.meetingUrl && (
          <div className="flex items-center text-sm text-theme-accent relative z-10">
            <ExternalLink className="w-4 h-4 mr-2" />
            <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Join on {meeting.platform}
            </a>
          </div>
        )}

        {meeting.status === "RECORDING" && (
          <div className="flex items-center text-sm text-green-500">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse shadow-[0_0_8px_#22c55e]" />
            <span>Live recording in progress</span>
          </div>
        )}
      </div>

      {/* AI Features Status */}
      {meeting.status === "COMPLETED" && (
        <div className="flex items-center space-x-4 mb-4 p-3 bg-theme-bg rounded-lg border border-theme-card-border">
          <div className={`flex items-center text-xs ${meeting.summary ? "text-green-500" : "text-theme-text opacity-40"}`}>
            <FileText className="w-3 h-3 mr-1" />
            <span>Summary</span>
          </div>
          <div className={`flex items-center text-xs ${meeting.notes ? "text-green-500" : "text-theme-text opacity-40"}`}>
            <FileText className="w-3 h-3 mr-1" />
            <span>Notes</span>
          </div>
          <div className={`flex items-center text-xs ${meeting.topics?.length ? "text-green-500" : "text-theme-text opacity-40"}`}>
            <Brain className="w-3 h-3 mr-1" />
            <span>Topics</span>
          </div>
          <div
            className={`flex items-center text-xs ${meeting.transcript?.length ? "text-green-500" : "text-theme-text opacity-40"}`}
          >
            <Mic className="w-3 h-3 mr-1" />
            <span>Transcript</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between mt-2 pt-2 border-t border-theme-card-border">
        <Link
          to={`/meeting/${meeting.id}`}
          className="flex items-center space-x-2 text-theme-accent hover:brightness-110 font-medium text-sm transition-colors relative z-10"
        >
          {meeting.status === "RECORDING" ? (
            <>
              <Play className="w-4 h-4" />
              <span>View Recording</span>
            </>
          ) : (
            <>
              <FileText className="w-4 h-4" />
              <span>View Details</span>
            </>
          )}
        </Link>

        <div className="flex items-center space-x-2 relative z-20">
          {meeting.status !== "RECORDING" && (
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="flex items-center space-x-1.5 px-3 py-1.5 text-xs font-medium text-red-500 bg-red-500/10 hover:bg-red-500/20 rounded-lg transition-colors border border-red-500/20"
              title="Delete meeting"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Delete</span>
            </button>
          )}

          {meeting.status === "RECORDING" && (
            <div className="flex items-center space-x-1">
              <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse shadow-[0_0_8px_#ef4444]" />
              <span className="text-xs text-red-500 font-medium">RECORDING</span>
            </div>
          )}

          {/* Actions Menu */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setShowActions(!showActions)}
              className="p-1 text-theme-icon hover:text-theme-text transition-colors"
            >
              <MoreVertical className="w-4 h-4" />
            </button>

            {showActions && (
              <div className="absolute right-0 top-full mt-1 bg-theme-card border border-theme-card-border rounded-lg shadow-xl z-50 min-w-[160px] dark:shadow-theme-accent/5">
                <div className="px-3 py-2 text-xs font-medium text-theme-text opacity-50 border-b border-theme-card-border">
                  Export Options
                </div>
                <button
                  type="button"
                  onClick={() => handleExport('json')}
                  disabled={isExporting}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-theme-text hover:bg-theme-bg transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-theme-icon" />
                  <span>{isExporting ? 'Exporting...' : 'Export as JSON'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('txt')}
                  disabled={isExporting}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-theme-text hover:bg-theme-bg transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-theme-icon" />
                  <span>{isExporting ? 'Exporting...' : 'Export as Text'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('pdf')}
                  disabled={isExporting}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-theme-text hover:bg-theme-bg transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-theme-icon" />
                  <span>{isExporting ? 'Exporting...' : 'Export as PDF'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleExport('csv')}
                  disabled={isExporting}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-theme-text hover:bg-theme-bg transition-colors disabled:opacity-50"
                >
                  <Download className="w-4 h-4 text-theme-icon" />
                  <span>{isExporting ? 'Exporting...' : 'Export as CSV'}</span>
                </button>
                <div className="border-t border-theme-card-border"></div>
                <button
                  type="button"
                  onClick={() => {
                    setShowDeleteConfirm(true)
                    setShowActions(false)
                  }}
                  className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>Delete Meeting</span>
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
          <div className="bg-theme-card border border-theme-card-border rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div className="flex items-center space-x-3 mb-4">
              <div className="bg-red-500/10 p-2 rounded-lg border border-red-500/20">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-theme-text">Delete Meeting</h3>
            </div>

            <p className="text-theme-text opacity-70 mb-6">
              Are you sure you want to delete "{meeting.title}"? This action cannot be undone and will permanently remove all associated data including transcripts, summaries, and recordings.
            </p>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => setShowDeleteConfirm(false)}
                className="flex-1 px-4 py-2 border border-theme-card-border text-theme-text rounded-lg hover:bg-theme-bg transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors shadow-lg shadow-red-500/20"
              >
                Delete Meeting
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Click outside to close actions menu */}
      {showActions && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowActions(false)}
        />
      )}
    </div>
  )
}
