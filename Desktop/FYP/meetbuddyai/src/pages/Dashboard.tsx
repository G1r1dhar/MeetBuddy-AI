"use client"

import { useState } from "react"
import { Plus, Calendar, FileText, Brain, TrendingUp } from "lucide-react"
import { useMeeting } from "../contexts/MeetingContext"
import { useAuth } from "../contexts/AuthContext"
import ScheduleMeetingModal from "../components/ScheduleMeetingModal"
import MeetingCard from "../components/MeetingCard"

export default function Dashboard() {
  const { meetings, getMeetingsThisMonth, getMeetingsThisWeek, getTotalStorageUsed } = useMeeting()
  const { user } = useAuth()
  const [showScheduleModal, setShowScheduleModal] = useState(false)

  const scheduledMeetings = meetings.filter((m) => m.status === "scheduled")
  const recordingMeetings = meetings.filter((m) => m.status === "recording")
  const completedMeetings = meetings.filter((m) => m.status === "completed")

  const thisMonthMeetings = getMeetingsThisMonth()
  const thisWeekMeetings = getMeetingsThisWeek()
  const totalStorage = getTotalStorageUsed()

  return (
    <div className={`min-h-screen pt-16 ${user?.darkMode ? "bg-black" : "bg-gray-50"}`}>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className={`text-3xl font-bold mb-2 ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>
                Welcome back, {user?.name}
              </h1>
              <p className={`${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                Capture and analyze your Google Meet sessions with AI-powered insights
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <button
                onClick={() => setShowScheduleModal(true)}
                className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  user?.darkMode
                    ? "bg-yellow-500 text-black hover:bg-yellow-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
              >
                <Plus className="w-4 h-4" />
                <span>Schedule Google Meet</span>
              </button>
            </div>
          </div>
        </div>

        {/* Stats Overview */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <div
            className={`rounded-xl p-6 border transition-all hover:shadow-lg ${
              user?.darkMode ? "bg-gray-900 border-yellow-500/20 shadow-yellow-500/10" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  This Month
                </p>
                <p className={`text-2xl font-bold ${user?.darkMode ? "text-yellow-400" : "text-blue-600"}`}>
                  {thisMonthMeetings}
                </p>
                <p className={`text-xs ${user?.darkMode ? "text-gray-500" : "text-gray-500"}`}>meetings recorded</p>
              </div>
              <div className={`p-3 rounded-lg ${user?.darkMode ? "bg-yellow-500/20" : "bg-blue-100"}`}>
                <TrendingUp className={`w-6 h-6 ${user?.darkMode ? "text-yellow-400" : "text-blue-600"}`} />
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl p-6 border transition-all hover:shadow-lg ${
              user?.darkMode ? "bg-gray-900 border-yellow-500/20 shadow-yellow-500/10" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>This Week</p>
                <p className={`text-2xl font-bold ${user?.darkMode ? "text-yellow-400" : "text-green-600"}`}>
                  {thisWeekMeetings}
                </p>
                <p className={`text-xs ${user?.darkMode ? "text-gray-500" : "text-gray-500"}`}>meetings recorded</p>
              </div>
              <div className={`p-3 rounded-lg ${user?.darkMode ? "bg-yellow-500/20" : "bg-green-100"}`}>
                <Calendar className={`w-6 h-6 ${user?.darkMode ? "text-yellow-400" : "text-green-600"}`} />
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl p-6 border transition-all hover:shadow-lg ${
              user?.darkMode ? "bg-gray-900 border-yellow-500/20 shadow-yellow-500/10" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  Storage Used
                </p>
                <p className={`text-2xl font-bold ${user?.darkMode ? "text-yellow-400" : "text-purple-600"}`}>
                  {totalStorage}MB
                </p>
                <p className={`text-xs ${user?.darkMode ? "text-gray-500" : "text-gray-500"}`}>of recordings</p>
              </div>
              <div className={`p-3 rounded-lg ${user?.darkMode ? "bg-yellow-500/20" : "bg-purple-100"}`}>
                <FileText className={`w-6 h-6 ${user?.darkMode ? "text-yellow-400" : "text-purple-600"}`} />
              </div>
            </div>
          </div>

          <div
            className={`rounded-xl p-6 border transition-all hover:shadow-lg ${
              user?.darkMode ? "bg-gray-900 border-yellow-500/20 shadow-yellow-500/10" : "bg-white border-gray-200"
            }`}
          >
            <div className="flex items-center justify-between">
              <div>
                <p className={`text-sm font-medium ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                  AI Summaries
                </p>
                <p className={`text-2xl font-bold ${user?.darkMode ? "text-yellow-400" : "text-orange-600"}`}>
                  {completedMeetings.filter((m) => m.summary).length}
                </p>
                <p className={`text-xs ${user?.darkMode ? "text-gray-500" : "text-gray-500"}`}>generated</p>
              </div>
              <div className={`p-3 rounded-lg ${user?.darkMode ? "bg-yellow-500/20" : "bg-orange-100"}`}>
                <Brain className={`w-6 h-6 ${user?.darkMode ? "text-yellow-400" : "text-orange-600"}`} />
              </div>
            </div>
          </div>
        </div>

        {/* Empty State or Meetings */}
        {meetings.length === 0 ? (
          <div
            className={`rounded-xl border p-12 text-center ${
              user?.darkMode ? "bg-gray-900 border-yellow-500/20" : "bg-white border-gray-200"
            }`}
          >
            <div
              className={`p-4 rounded-full inline-block mb-4 ${user?.darkMode ? "bg-yellow-500/20" : "bg-indigo-100"}`}
            >
              <Calendar className={`w-12 h-12 ${user?.darkMode ? "text-yellow-400" : "text-indigo-600"}`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>
              Welcome to MeetBuddy AI
            </h3>
            <p className={`mb-6 max-w-md mx-auto ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
              Start by scheduling your first Google Meet session. We'll capture real-time transcripts and generate
              AI-powered summaries and insights.
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className={`inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${
                user?.darkMode
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              <Plus className="w-5 h-5" />
              <span>Schedule Your First Meeting</span>
            </button>
          </div>
        ) : (
          <>
            {/* Upcoming Meetings */}
            {scheduledMeetings.length > 0 && (
              <div className="mb-8">
                <h2 className={`text-xl font-semibold mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                  Upcoming Meetings
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scheduledMeetings.slice(0, 4).map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Recordings */}
            {completedMeetings.length > 0 && (
              <div>
                <h2 className={`text-xl font-semibold mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                  Recent Recordings
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {completedMeetings.slice(0, 6).map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        <ScheduleMeetingModal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} />
      </div>
    </div>
  )
}
