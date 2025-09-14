"use client"

import { useState } from "react"
import { ChevronLeft, ChevronRight, Clock, ExternalLink, Play } from "lucide-react"
import type { Meeting } from "../contexts/MeetingContext"

interface CalendarViewProps {
  meetings: Meeting[]
}

export default function CalendarView({ meetings }: CalendarViewProps) {
  const [currentDate, setCurrentDate] = useState(new Date())
  const [view, setView] = useState<"month" | "week">("month")

  const getDaysInMonth = (date: Date) => {
    const year = date.getFullYear()
    const month = date.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const daysInMonth = lastDay.getDate()
    const startingDayOfWeek = firstDay.getDay()

    const days = []

    // Add empty cells for days before the first day of the month
    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push(null)
    }

    // Add days of the month
    for (let day = 1; day <= daysInMonth; day++) {
      days.push(new Date(year, month, day))
    }

    return days
  }

  const getMeetingsForDate = (date: Date | null) => {
    if (!date) return []
    return meetings.filter((meeting) => {
      const meetingDate = new Date(meeting.scheduledTime)
      return meetingDate.toDateString() === date.toDateString()
    })
  }

  const navigateMonth = (direction: "prev" | "next") => {
    setCurrentDate((prev) => {
      const newDate = new Date(prev)
      if (direction === "prev") {
        newDate.setMonth(prev.getMonth() - 1)
      } else {
        newDate.setMonth(prev.getMonth() + 1)
      }
      return newDate
    })
  }

  const days = getDaysInMonth(currentDate)
  const monthName = currentDate.toLocaleDateString("en-US", { month: "long", year: "numeric" })

  const getStatusColor = (status: Meeting["status"]) => {
    switch (status) {
      case "recording":
        return "bg-red-500"
      case "scheduled":
        return "bg-cyan-400"
      case "completed":
        return "bg-yellow-500"
      default:
        return "bg-gray-500"
    }
  }

  return (
    <div className="bg-black border border-yellow-500/30 rounded-xl shadow-lg shadow-yellow-500/10">
      {/* Calendar Header */}
      <div className="p-6 border-b border-yellow-500/30">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold text-yellow-400">{monthName}</h2>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-1 bg-gray-900 border border-yellow-500/30 rounded-lg p-1">
              <button
                onClick={() => setView("month")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  view === "month" ? "bg-yellow-500 text-black" : "text-yellow-400 hover:text-yellow-300"
                }`}
              >
                Month
              </button>
              <button
                onClick={() => setView("week")}
                className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                  view === "week" ? "bg-yellow-500 text-black" : "text-yellow-400 hover:text-yellow-300"
                }`}
              >
                Week
              </button>
            </div>
            <div className="flex items-center space-x-2">
              <button
                onClick={() => navigateMonth("prev")}
                className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <button
                onClick={() => setCurrentDate(new Date())}
                className="px-3 py-1 text-sm font-medium text-cyan-400 hover:text-cyan-300 transition-colors border border-cyan-400/30 rounded"
              >
                Today
              </button>
              <button
                onClick={() => navigateMonth("next")}
                className="p-2 text-gray-400 hover:text-cyan-400 transition-colors"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Calendar Grid */}
      <div className="p-6">
        {/* Day Headers */}
        <div className="grid grid-cols-7 gap-1 mb-4">
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
            <div key={day} className="p-2 text-center text-sm font-medium text-gray-400">
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Days */}
        <div className="grid grid-cols-7 gap-1">
          {days.map((day, index) => {
            const dayMeetings = getMeetingsForDate(day)
            const isToday = day && day.toDateString() === new Date().toDateString()

            return (
              <div
                key={index}
                className={`min-h-[100px] p-2 border rounded-lg transition-colors ${
                  day ? "bg-gray-900 border-gray-700 hover:border-yellow-500/50" : "bg-gray-800 border-gray-800"
                } ${isToday ? "ring-2 ring-cyan-400 border-cyan-400" : ""}`}
              >
                {day && (
                  <>
                    <div className={`text-sm font-medium mb-1 ${isToday ? "text-cyan-400" : "text-white"}`}>
                      {day.getDate()}
                    </div>
                    <div className="space-y-1">
                      {dayMeetings.slice(0, 3).map((meeting) => (
                        <div
                          key={meeting.id}
                          className="group cursor-pointer"
                          title={`${meeting.title} - ${meeting.platform}`}
                        >
                          <div
                            className={`w-full text-xs p-1 rounded text-white truncate ${getStatusColor(meeting.status)}`}
                          >
                            <div className="flex items-center space-x-1">
                              <div className="w-1 h-1 bg-white rounded-full" />
                              <span className="truncate">{meeting.title}</span>
                            </div>
                          </div>
                        </div>
                      ))}
                      {dayMeetings.length > 3 && (
                        <div className="text-xs text-gray-400 text-center">+{dayMeetings.length - 3} more</div>
                      )}
                    </div>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {/* Upcoming Meetings Sidebar */}
      <div className="border-t border-yellow-500/30 p-6">
        <h3 className="font-semibold text-yellow-400 mb-4">Upcoming This Week</h3>
        <div className="space-y-3 max-h-48 overflow-y-auto">
          {meetings
            .filter((m) => {
              const meetingDate = new Date(m.scheduledTime)
              const weekFromNow = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
              return meetingDate >= new Date() && meetingDate <= weekFromNow
            })
            .sort((a, b) => a.scheduledTime.getTime() - b.scheduledTime.getTime())
            .map((meeting) => (
              <div
                key={meeting.id}
                className="flex items-center justify-between p-3 bg-gray-900 border border-gray-700 rounded-lg hover:border-yellow-500/50 transition-colors"
              >
                <div className="flex-1">
                  <p className="font-medium text-white text-sm">{meeting.title}</p>
                  <div className="flex items-center space-x-2 text-xs text-gray-400 mt-1">
                    <Clock className="w-3 h-3" />
                    <span>
                      {new Intl.DateTimeFormat("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      }).format(meeting.scheduledTime)}
                    </span>
                    <span>•</span>
                    <span>{meeting.platform}</span>
                  </div>
                </div>
                <div className="flex items-center space-x-2">
                  {meeting.meetingUrl && (
                    <button
                      onClick={() => window.open(meeting.meetingUrl, "_blank")}
                      className="p-1 text-gray-400 hover:text-cyan-400 transition-colors"
                      title="Open meeting link"
                    >
                      <ExternalLink className="w-4 h-4" />
                    </button>
                  )}
                  <button className="p-1 text-gray-400 hover:text-yellow-400 transition-colors" title="Start recording">
                    <Play className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  )
}
