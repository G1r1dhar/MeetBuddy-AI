import Link from "next/link"
import { Calendar, Users, Play, FileText, Brain, ExternalLink, Mic } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"

interface MeetingCardProps {
  meeting: Meeting
}

export default function MeetingCard({ meeting }: MeetingCardProps) {
  const getStatusColor = (status: Meeting["status"]) => {
    switch (status) {
      case "active":
        return "bg-green-100 text-green-800 border-green-200"
      case "scheduled":
        return "bg-blue-100 text-blue-800 border-blue-200"
      case "completed":
        return "bg-gray-100 text-gray-800 border-gray-200"
      default:
        return "bg-gray-100 text-gray-800 border-gray-200"
    }
  }

  const formatTime = (date: Date) => {
    return new Intl.DateTimeFormat("en-US", {
      hour: "2-digit",
      minute: "2-digit",
      month: "short",
      day: "numeric",
    }).format(date)
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 hover:shadow-lg transition-all duration-200 hover:border-indigo-200">
      <div className="flex items-start justify-between mb-4">
        <div className="flex-1">
          <h3 className="text-lg font-semibold text-gray-900 mb-1">{meeting.title}</h3>
          <p className="text-gray-600 text-sm line-clamp-2">{meeting.description}</p>
        </div>
        <div className="flex flex-col items-end space-y-2">
          <span className="text-xs text-gray-500 bg-gray-100 px-2 py-1 rounded">{meeting.platform}</span>
          <span className={`px-3 py-1 rounded-full text-xs font-medium border ${getStatusColor(meeting.status)}`}>
            {meeting.status}
          </span>
        </div>
      </div>

      <div className="space-y-3 mb-4">
        <div className="flex items-center text-sm text-gray-600">
          <Calendar className="w-4 h-4 mr-2" />
          <span>{formatTime(meeting.scheduledTime)}</span>
          {meeting.endTime && (
            <>
              <span className="mx-2">-</span>
              <span>{formatTime(meeting.endTime)}</span>
            </>
          )}
        </div>

        <div className="flex items-center text-sm text-gray-600">
          <Users className="w-4 h-4 mr-2" />
          <span>{meeting.participants.length} participants</span>
        </div>

        {meeting.meetingUrl && (
          <div className="flex items-center text-sm text-indigo-600">
            <ExternalLink className="w-4 h-4 mr-2" />
            <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="hover:underline">
              Join on {meeting.platform}
            </a>
          </div>
        )}

        {meeting.status === "recording" && (
          <div className="flex items-center text-sm text-green-600">
            <div className="w-2 h-2 bg-green-500 rounded-full mr-2 animate-pulse" />
            <span>Live recording in progress</span>
          </div>
        )}
      </div>

      {/* AI Features Status */}
      {meeting.status === "completed" && (
        <div className="flex items-center space-x-4 mb-4 p-3 bg-gray-50 rounded-lg">
          <div className={`flex items-center text-xs ${meeting.summary ? "text-green-600" : "text-gray-400"}`}>
            <FileText className="w-3 h-3 mr-1" />
            <span>Summary</span>
          </div>
          <div className={`flex items-center text-xs ${meeting.notes ? "text-green-600" : "text-gray-400"}`}>
            <FileText className="w-3 h-3 mr-1" />
            <span>Notes</span>
          </div>
          <div className={`flex items-center text-xs ${meeting.topics?.length ? "text-green-600" : "text-gray-400"}`}>
            <Brain className="w-3 h-3 mr-1" />
            <span>Topics</span>
          </div>
          <div
            className={`flex items-center text-xs ${meeting.transcript?.length ? "text-green-600" : "text-gray-400"}`}
          >
            <Mic className="w-3 h-3 mr-1" />
            <span>Transcript</span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between">
        <Link
          href={`/meeting/${meeting.id}`}
          className="flex items-center space-x-2 text-indigo-600 hover:text-indigo-700 font-medium text-sm transition-colors"
        >
          {meeting.status === "recording" ? (
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

        {meeting.status === "recording" && (
          <div className="flex items-center space-x-1">
            <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
            <span className="text-xs text-red-600 font-medium">RECORDING</span>
          </div>
        )}
      </div>
    </div>
  )
}
