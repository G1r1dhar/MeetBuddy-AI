

import { useState, useMemo, useEffect } from "react"
import { Plus, Calendar, Search, Filter, Loader, ArrowUp, ArrowDown } from "lucide-react"
import { useMeeting } from "../contexts/MeetingContext"
import { useAuth } from "../contexts/AuthContext"
import ScheduleMeetingModal from "../components/ScheduleMeetingModal"
import MeetingCard from "../components/MeetingCard"

export default function Dashboard() {
  const { meetings, loading, error, clearError } = useMeeting()
  const { user } = useAuth()
  const [showScheduleModal, setShowScheduleModal] = useState(false)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<"all" | "SCHEDULED" | "RECORDING" | "COMPLETED">("all")
  const [sortBy, setSortBy] = useState<"date" | "title" | "status">("date")
  const [sortOrder, setSortOrder] = useState<"asc" | "desc">("desc")

  useEffect(() => {
    // Clear global error when mounting dashboard to avoid blocking UI from past meeting room errors
    if (error && meetings.length > 0) {
      clearError()
    }
  }, [error, meetings.length, clearError])

  // Filter and sort meetings
  const filteredAndSortedMeetings = useMemo(() => {
    console.log('🔍 Dashboard: Filtering meetings...', {
      totalMeetings: meetings.length,
      searchTerm,
      statusFilter
    });

    const filtered = meetings.filter((meeting) => {
      const matchesSearch =
        meeting.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        meeting.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        meeting.participants?.some(p => p?.toLowerCase().includes(searchTerm.toLowerCase()))

      const matchesStatus = statusFilter === "all" || meeting.status === statusFilter

      return matchesSearch && matchesStatus
    })

    console.log('✅ Dashboard: Filtered meetings:', filtered.length);

    // Sort meetings
    filtered.sort((a, b) => {
      let comparison = 0

      switch (sortBy) {
        case "date":
          comparison = new Date(a.scheduledTime).getTime() - new Date(b.scheduledTime).getTime()
          break
        case "title":
          comparison = a.title.localeCompare(b.title)
          break
        case "status":
          comparison = a.status.localeCompare(b.status)
          break
      }

      return sortOrder === "asc" ? comparison : -comparison
    })

    console.log('📋 Dashboard: Final sorted meetings:', filtered.map(m => ({ id: m.id, title: m.title, status: m.status })));
    return filtered
  }, [meetings, searchTerm, statusFilter, sortBy, sortOrder])

  const scheduledMeetings = filteredAndSortedMeetings.filter((m) => m.status === "SCHEDULED")
  const recordingMeetings = filteredAndSortedMeetings.filter((m) => m.status === "RECORDING")
  const completedMeetings = filteredAndSortedMeetings.filter((m) => m.status === "COMPLETED")



  const toggleSort = (newSortBy: typeof sortBy) => {
    if (sortBy === newSortBy) {
      setSortOrder(sortOrder === "asc" ? "desc" : "asc")
    } else {
      setSortBy(newSortBy)
      setSortOrder("desc")
    }
  }

  return (
    <div className={`min-h-screen pt-16 relative overflow-hidden ${user?.darkMode ? "bg-slate-950" : "bg-slate-50"}`}>
      {/* Background Ambient Effects */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent blur-[100px] pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-white/5 backdrop-blur-3xl border border-white/10 p-8 rounded-3xl shadow-2xl overflow-hidden relative">
            {/* Header Card Glow */}
            <div className={`absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[80px] ${user?.darkMode ? "bg-indigo-500/20" : "bg-indigo-400/20"}`} />

            <div className="relative z-10">
              <h1 className={`text-4xl font-extrabold tracking-tight mb-2 ${user?.darkMode ? "text-transparent bg-clip-text bg-gradient-to-r from-white to-gray-400" : "text-slate-900"}`}>
                Welcome back, {user?.name}
              </h1>
              <p className={`text-lg font-medium ${user?.darkMode ? "text-indigo-200/60" : "text-slate-600"}`}>
                Capture and analyze your remote sessions with AI-powered insights
              </p>
            </div>
            <div className="relative z-10 flex items-center space-x-3">
              <button
                onClick={() => setShowScheduleModal(true)}
                className="group relative flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold text-white bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-400 hover:to-purple-500 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(168,85,247,0.5)] transition-all duration-300 transform hover:-translate-y-0.5"
              >
                <div className="absolute inset-0 rounded-xl bg-white/20 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                <Plus className="w-5 h-5 relative z-10" />
                <span className="relative z-10 tracking-wide">New Meeting</span>
              </button>
            </div>
          </div>
        </div>



        {/* Search and Filter Controls */}
        {meetings.length > 0 && (
          <div className={`rounded-xl border p-6 mb-8 ${user?.darkMode ? "bg-gray-900 border-yellow-500/20" : "bg-white border-gray-200"
            }`}>
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              {/* Search */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className={`absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 ${user?.darkMode ? "text-gray-400" : "text-gray-400"
                    }`} />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search meetings..."
                    className={`w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${user?.darkMode
                      ? "bg-gray-800 border-gray-600 text-white placeholder-gray-400"
                      : "bg-white border-gray-300 text-gray-900 placeholder-gray-500"
                      }`}
                  />
                </div>
              </div>

              {/* Filters and Sort */}
              <div className="flex items-center space-x-4">
                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className={`w-4 h-4 ${user?.darkMode ? "text-gray-400" : "text-gray-500"}`} />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className={`border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-500 focus:border-transparent ${user?.darkMode
                      ? "bg-gray-800 border-gray-600 text-white"
                      : "bg-white border-gray-300 text-gray-900"
                      }`}
                  >
                    <option value="all">All Status</option>
                    <option value="SCHEDULED">Scheduled</option>
                    <option value="RECORDING">Recording</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </div>

                {/* Sort Controls */}
                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => toggleSort("date")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${sortBy === "date"
                      ? user?.darkMode
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-indigo-100 text-indigo-700"
                      : user?.darkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                  >
                    <span>Date</span>
                    {sortBy === "date" && (
                      sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </button>

                  <button
                    onClick={() => toggleSort("title")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${sortBy === "title"
                      ? user?.darkMode
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-indigo-100 text-indigo-700"
                      : user?.darkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                  >
                    <span>Title</span>
                    {sortBy === "title" && (
                      sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </button>

                  <button
                    onClick={() => toggleSort("status")}
                    className={`flex items-center space-x-1 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${sortBy === "status"
                      ? user?.darkMode
                        ? "bg-yellow-500/20 text-yellow-400"
                        : "bg-indigo-100 text-indigo-700"
                      : user?.darkMode
                        ? "text-gray-400 hover:text-white hover:bg-gray-800"
                        : "text-gray-500 hover:text-gray-700 hover:bg-gray-100"
                      }`}
                  >
                    <span>Status</span>
                    {sortBy === "status" && (
                      sortOrder === "asc" ? <ArrowUp className="w-3 h-3" /> : <ArrowDown className="w-3 h-3" />
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Results Summary */}
            <div className={`mt-4 pt-4 border-t ${user?.darkMode ? "border-gray-700" : "border-gray-200"
              }`}>
              <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                Showing {filteredAndSortedMeetings.length} of {meetings.length} meetings
                {searchTerm && ` matching "${searchTerm}"`}
                {statusFilter !== "all" && ` with status "${statusFilter}"`}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className={`rounded-xl border p-12 text-center ${user?.darkMode ? "bg-gray-900 border-yellow-500/20" : "bg-white border-gray-200"
            }`}>
            <Loader className={`w-8 h-8 mx-auto mb-4 animate-spin ${user?.darkMode ? "text-yellow-400" : "text-indigo-600"
              }`} />
            <p className={`${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
              Loading meetings...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className={`rounded-xl border p-12 text-center ${user?.darkMode ? "bg-gray-900 border-red-500/20" : "bg-white border-red-200"
            }`}>
            <div className={`p-4 rounded-full inline-block mb-4 ${user?.darkMode ? "bg-red-500/20" : "bg-red-100"
              }`}>
              <Calendar className={`w-12 h-12 ${user?.darkMode ? "text-red-400" : "text-red-600"}`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${user?.darkMode ? "text-red-400" : "text-red-900"}`}>
              Failed to load meetings
            </h3>
            <p className={`mb-6 max-w-md mx-auto ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${user?.darkMode
                ? "bg-red-500 text-white hover:bg-red-400"
                : "bg-red-600 text-white hover:bg-red-700"
                }`}
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State or Meetings */}
        {!loading && !error && meetings.length === 0 ? (
          <div
            className={`rounded-xl border p-12 text-center ${user?.darkMode ? "bg-gray-900 border-yellow-500/20" : "bg-white border-gray-200"
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
              className={`inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors ${user?.darkMode
                ? "bg-yellow-500 text-black hover:bg-yellow-400"
                : "bg-indigo-600 text-white hover:bg-indigo-700"
                }`}
            >
              <Plus className="w-5 h-5" />
              <span>Schedule Your First Meeting</span>
            </button>
          </div>
        ) : !loading && !error && filteredAndSortedMeetings.length === 0 && meetings.length > 0 ? (
          /* No Results State */
          <div className={`rounded-xl border p-12 text-center ${user?.darkMode ? "bg-gray-900 border-yellow-500/20" : "bg-white border-gray-200"
            }`}>
            <div className={`p-4 rounded-full inline-block mb-4 ${user?.darkMode ? "bg-yellow-500/20" : "bg-gray-100"
              }`}>
              <Search className={`w-12 h-12 ${user?.darkMode ? "text-yellow-400" : "text-gray-400"}`} />
            </div>
            <h3 className={`text-xl font-semibold mb-2 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
              No meetings found
            </h3>
            <p className={`mb-6 max-w-md mx-auto ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
              No meetings match your current search and filter criteria. Try adjusting your filters or search terms.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => {
                  setSearchTerm("")
                  setStatusFilter("all")
                }}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${user?.darkMode
                  ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                  : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
              >
                Clear Filters
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                className={`px-4 py-2 rounded-lg font-medium transition-colors ${user?.darkMode
                  ? "bg-yellow-500 text-black hover:bg-yellow-400"
                  : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
              >
                Schedule New Meeting
              </button>
            </div>
          </div>
        ) : !loading && !error && (
          <>
            {/* Upcoming Meetings */}
            {scheduledMeetings.length > 0 && (
              <div className="mb-8">
                <h2 className={`text-xl font-semibold mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                  Upcoming Meetings ({scheduledMeetings.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {scheduledMeetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </div>
            )}

            {/* Active Recordings */}
            {recordingMeetings.length > 0 && (
              <div className="mb-8">
                <h2 className={`text-xl font-semibold mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                  Active Recordings ({recordingMeetings.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {recordingMeetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </div>
            )}

            {/* Recent Recordings */}
            {completedMeetings.length > 0 && (
              <div>
                <h2 className={`text-xl font-semibold mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                  Completed Meetings ({completedMeetings.length})
                </h2>
                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6">
                  {completedMeetings.map((meeting) => (
                    <MeetingCard key={meeting.id} meeting={meeting} />
                  ))}
                </div>
              </div>
            )}

            {/* Show All Results if Filtered */}
            {(searchTerm || statusFilter !== "all") && filteredAndSortedMeetings.length > 0 && (
              <div className="mt-8 text-center">
                <button
                  onClick={() => {
                    setSearchTerm("")
                    setStatusFilter("all")
                  }}
                  className={`px-4 py-2 rounded-lg font-medium transition-colors ${user?.darkMode
                    ? "bg-gray-800 text-gray-300 hover:bg-gray-700"
                    : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                    }`}
                >
                  Show All Meetings
                </button>
              </div>
            )}
          </>
        )}

        <ScheduleMeetingModal isOpen={showScheduleModal} onClose={() => setShowScheduleModal(false)} />
      </div>
    </div>
  )
}
