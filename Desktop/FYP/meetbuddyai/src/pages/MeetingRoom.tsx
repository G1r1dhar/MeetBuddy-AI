"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import { Clock, ExternalLink } from "lucide-react"
import { useMeeting } from "../contexts/MeetingContext"
import VideoPanel from "../components/VideoPanel"
import TranscriptPanel from "../components/TranscriptPanel"
import SummaryPanel from "../components/SummaryPanel"
import MindMapPanel from "../components/MindMapPanel"
import MeetingControls from "../components/MeetingControls"
import LiveCapturePanel from "../components/LiveCapturePanel"
import MeetingNotes from "../components/MeetingNotes"

interface MeetingRoomProps {
  meetingId: string
}

export default function MeetingRoom({ meetingId }: MeetingRoomProps) {
  const router = useRouter()
  const { meetings, joinMeeting, activeMeeting } = useMeeting()
  const [activeTab, setActiveTab] = useState<"transcript" | "summary" | "mindmap" | "notes" | "capture">("transcript")

  const meeting = meetings.find((m) => m.id === meetingId)

  useEffect(() => {
    if (meeting && meetingId) {
      joinMeeting(meetingId)
    }
  }, [meetingId, meeting, joinMeeting])

  if (!meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-gray-900 mb-2">Recording Not Found</h1>
          <p className="text-gray-600 mb-4">The meeting recording you're looking for doesn't exist.</p>
          <button
            onClick={() => router.push("/")}
            className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="h-screen flex flex-col bg-gray-900">
      {/* Recording Header */}
      <div className="bg-white border-b border-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-semibold text-gray-900">{meeting.title}</h1>
            <div className="flex items-center space-x-4 text-sm text-gray-600">
              <span>{meeting.description}</span>
              <span>•</span>
              <span>{meeting.platform}</span>
              {meeting.meetingUrl && (
                <>
                  <span>•</span>
                  <a
                    href={meeting.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-indigo-600 hover:text-indigo-700 flex items-center space-x-1"
                  >
                    <ExternalLink className="w-3 h-3" />
                    <span>Original Meeting</span>
                  </a>
                </>
              )}
            </div>
          </div>
          <div className="flex items-center space-x-2">
            {meeting.status === "recording" && (
              <div className="flex items-center space-x-2 bg-red-100 px-3 py-1 rounded-full">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                <span className="text-xs font-medium text-red-700">RECORDING</span>
              </div>
            )}
            {meeting.status === "scheduled" && (
              <div className="flex items-center space-x-2 bg-blue-100 px-3 py-1 rounded-full">
                <Clock className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-medium text-blue-700">
                  Scheduled for{" "}
                  {new Intl.DateTimeFormat("en-US", {
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  }).format(meeting.scheduledTime)}
                </span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex">
        {/* Recording/Video Section */}
        <div className="flex-1 flex flex-col">
          <VideoPanel meeting={meeting} />
          {meeting.status === "recording" && <MeetingControls meeting={meeting} />}
        </div>

        {/* Side Panel */}
        <div className="w-96 bg-white border-l border-gray-200 flex flex-col">
          {/* Tab Navigation */}
          <div className="border-b border-gray-200">
            <nav className="flex">
              <button
                onClick={() => setActiveTab("transcript")}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "transcript"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Transcript
              </button>
              <button
                onClick={() => setActiveTab("capture")}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "capture"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Live Capture
              </button>
              <button
                onClick={() => setActiveTab("summary")}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "summary"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab("mindmap")}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "mindmap"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Mind Map
              </button>
              <button
                onClick={() => setActiveTab("notes")}
                className={`flex-1 px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === "notes"
                    ? "border-indigo-500 text-indigo-600"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}
              >
                Notes
              </button>
            </nav>
          </div>

          {/* Tab Content */}
          <div className="flex-1 overflow-hidden">
            {activeTab === "transcript" && <TranscriptPanel meeting={meeting} />}
            {activeTab === "capture" && <LiveCapturePanel meetingId={meeting.id} />}
            {activeTab === "summary" && <SummaryPanel meeting={meeting} />}
            {activeTab === "mindmap" && <MindMapPanel meeting={meeting} />}
            {activeTab === "notes" && <MeetingNotes meeting={meeting} />}
          </div>
        </div>
      </div>
    </div>
  )
}
