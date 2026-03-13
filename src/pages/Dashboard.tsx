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
    <div className="min-h-screen pt-16 relative overflow-hidden transition-colors duration-300">
      {/* Background Ambient Effects */}
      <div className="absolute top-0 left-0 w-full h-[500px] bg-gradient-to-br from-theme-accent/5 to-transparent blur-[100px] pointer-events-none -z-10" />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 relative z-10">
        <div className="mb-10">
          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 bg-theme-bg/60 backdrop-blur-3xl border border-theme-card-border p-8 rounded-3xl shadow-2xl overflow-hidden relative">
            {/* Header Card Glow */}
            <div className="absolute -right-20 -top-20 w-64 h-64 rounded-full blur-[80px] bg-theme-accent/20" />

            <div className="relative z-10">
              <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-theme-text">
                Welcome back, {user?.name}
              </h1>
              <p className="text-lg font-medium text-theme-text opacity-70">
                Capture and analyze your remote sessions with AI-powered insights
              </p>
            </div>
            <div className="relative z-10 flex items-center space-x-3">
              <button
                onClick={() => setShowScheduleModal(true)}
                className="group relative flex items-center space-x-2 px-6 py-3 rounded-xl font-semibold text-black bg-theme-accent hover:brightness-110 shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] transition-all duration-300 transform hover:-translate-y-0.5"
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
          <div className="rounded-xl border p-6 mb-8 bg-theme-card border-theme-card-border">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between space-y-4 lg:space-y-0">
              {/* Search */}
              <div className="flex-1 max-w-md">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-theme-icon" />
                  <input
                    type="text"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Search meetings..."
                    className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-theme-accent focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text placeholder-theme-text/50"
                  />
                </div>
              </div>

              {/* Filters and Sort */}
              <div className="flex items-center space-x-4">
                {/* Status Filter */}
                <div className="flex items-center space-x-2">
                  <Filter className="w-4 h-4 text-theme-icon" />
                  <select
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value as typeof statusFilter)}
                    className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-theme-accent focus:border-transparent bg-theme-bg border-theme-card-border text-theme-text"
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
                      ? "bg-theme-accent/20 text-theme-accent"
                      : "text-theme-icon hover:text-theme-text hover:bg-theme-bg"
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
                      ? "bg-theme-accent/20 text-theme-accent"
                      : "text-theme-icon hover:text-theme-text hover:bg-theme-bg"
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
                      ? "bg-theme-accent/20 text-theme-accent"
                      : "text-theme-icon hover:text-theme-text hover:bg-theme-bg"
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
            <div className="mt-4 pt-4 border-t border-theme-card-border">
              <p className="text-sm text-theme-text opacity-70">
                Showing {filteredAndSortedMeetings.length} of {meetings.length} meetings
                {searchTerm && ` matching "${searchTerm}"`}
                {statusFilter !== "all" && ` with status "${statusFilter}"`}
              </p>
            </div>
          </div>
        )}

        {/* Loading State */}
        {loading && (
          <div className="rounded-xl border p-12 text-center bg-theme-card border-theme-card-border">
            <Loader className="w-8 h-8 mx-auto mb-4 animate-spin text-theme-accent" />
            <p className="text-theme-text opacity-70">
              Loading meetings...
            </p>
          </div>
        )}

        {/* Error State */}
        {error && !loading && (
          <div className="rounded-xl border p-12 text-center bg-red-500/5 border-red-500/20">
            <div className="p-4 rounded-full inline-block mb-4 bg-red-500/20">
              <Calendar className="w-12 h-12 text-red-500 dark:text-red-400" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-red-500 dark:text-red-400">
              Failed to load meetings
            </h3>
            <p className="mb-6 max-w-md mx-auto text-theme-text opacity-70">
              {error}
            </p>
            <button
              onClick={() => window.location.reload()}
              className="px-4 py-2 rounded-lg font-medium transition-colors bg-red-500 hover:bg-red-600 text-white"
            >
              Retry
            </button>
          </div>
        )}

        {/* Empty State or Meetings */}
        {!loading && !error && meetings.length === 0 ? (
          <div className="rounded-xl border p-12 text-center bg-theme-card border-theme-card-border">
            <div className="p-4 rounded-full inline-block mb-4 bg-theme-accent/20">
              <Calendar className="w-12 h-12 text-theme-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-theme-text">
              Welcome to MeetBuddy AI
            </h3>
            <p className="mb-6 max-w-md mx-auto text-theme-text opacity-70">
              Start by scheduling your first Google Meet session. We'll capture real-time transcripts and generate
              AI-powered summaries and insights.
            </p>
            <button
              onClick={() => setShowScheduleModal(true)}
              className="inline-flex items-center space-x-2 px-6 py-3 rounded-lg font-medium transition-colors bg-theme-accent text-black hover:brightness-110"
            >
              <Plus className="w-5 h-5" />
              <span>Schedule Your First Meeting</span>
            </button>
          </div>
        ) : !loading && !error && filteredAndSortedMeetings.length === 0 && meetings.length > 0 ? (
          /* No Results State */
          <div className="rounded-xl border p-12 text-center bg-theme-card border-theme-card-border">
            <div className="p-4 rounded-full inline-block mb-4 bg-theme-accent/20">
              <Search className="w-12 h-12 text-theme-accent" />
            </div>
            <h3 className="text-xl font-semibold mb-2 text-theme-text">
              No meetings found
            </h3>
            <p className="mb-6 max-w-md mx-auto text-theme-text opacity-70">
              No meetings match your current search and filter criteria. Try adjusting your filters or search terms.
            </p>
            <div className="flex justify-center space-x-3">
              <button
                onClick={() => {
                  setSearchTerm("")
                  setStatusFilter("all")
                }}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-theme-bg text-theme-text hover:brightness-95 border border-theme-card-border"
              >
                Clear Filters
              </button>
              <button
                onClick={() => setShowScheduleModal(true)}
                className="px-4 py-2 rounded-lg font-medium transition-colors bg-theme-accent text-black hover:brightness-110"
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
                <h2 className="text-xl font-semibold mb-4 text-theme-text">
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
                <h2 className="text-xl font-semibold mb-4 text-theme-text">
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
                <h2 className="text-xl font-semibold mb-4 text-theme-text">
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
                  className="px-4 py-2 rounded-lg font-medium transition-colors bg-theme-bg text-theme-text hover:brightness-95 border border-theme-card-border"
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
