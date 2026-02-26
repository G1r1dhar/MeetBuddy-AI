import { useState, useEffect } from "react"
import { useNavigate, useParams } from "react-router-dom"
import { Clock, ExternalLink, Loader, PhoneOff } from "lucide-react"
import { useMeeting } from "../contexts/MeetingContext"
import { type Meeting } from "../services/meetingService"
import VideoPanel from "../components/VideoPanel"
import TranscriptPanel from "../components/TranscriptPanel"
import SummaryPanel from "../components/SummaryPanel"
import MindMapPanel from "../components/MindMapPanel"
import RealTimeTranscript from "../components/RealTimeTranscript"
import MeetingNotes from "../components/MeetingNotes"
import { useSocket } from "../hooks/useSocket"

type Tab = "live" | "transcript" | "summary" | "mindmap" | "notes"

const TABS: { id: Tab; label: string }[] = [
  { id: "live", label: "🎙️ Live" },
  { id: "transcript", label: "Transcript" },
  { id: "summary", label: "Summary" },
  { id: "mindmap", label: "Mind Map" },
  { id: "notes", label: "Notes" },
]

export default function MeetingRoom() {
  const navigate = useNavigate()
  const { id: meetingId } = useParams<{ id: string }>()
  const { meetings, joinMeeting, endMeeting, generateSummary, generateMindMap, loading: meetingsLoading, getMeetingById } = useMeeting()
  const [activeTab, setActiveTab] = useState<Tab>("live")
  const [meeting, setMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const socket = useSocket({ meetingId })

  useEffect(() => {
    let isMounted = true
    let hasJoined = false

    const loadMeeting = async () => {
      if (!meetingId) {
        if (isMounted) { setError("No meeting ID provided"); setLoading(false) }
        return
      }

      try {
        if (isMounted) { setLoading(true); setError(null) }

        const contextMeeting = meetings.find(m => m.id === meetingId)
        if (contextMeeting) {
          if (isMounted) { setMeeting(contextMeeting); setLoading(false) }
          if (!hasJoined && contextMeeting.status !== "COMPLETED") {
            hasJoined = true
            try { await joinMeeting(meetingId) } catch { /* non-fatal */ }
          }
          return
        }

        if (meetingsLoading) {
          if (isMounted) setLoading(false)
          return
        }

        const fetchedMeeting = await getMeetingById(meetingId)
        if (isMounted) {
          // Re-fetch contextMeeting just for merging because the previous check returned early
          const currentContextMeeting = meetings.find(m => m.id === meetingId)

          if (currentContextMeeting) {
            const richMeeting = {
              ...fetchedMeeting,
              transcript: fetchedMeeting.transcript?.length ? fetchedMeeting.transcript : currentContextMeeting.transcript,
              summary: fetchedMeeting.summary || currentContextMeeting.summary,
              topics: fetchedMeeting.topics?.length ? fetchedMeeting.topics : currentContextMeeting.topics,
              notes: fetchedMeeting.notes || currentContextMeeting.notes,
              mindMap: fetchedMeeting.mindMap || currentContextMeeting.mindMap,
            }
            setMeeting(richMeeting)
          } else {
            setMeeting(fetchedMeeting)
          }
        }

        if (!hasJoined && fetchedMeeting.status !== "COMPLETED") {
          hasJoined = true
          try { await joinMeeting(meetingId) } catch { /* non-fatal */ }
        }

      } catch (err) {
        if (isMounted) setError(err instanceof Error ? err.message : "Failed to load meeting")
      } finally {
        if (isMounted) setLoading(false)
      }
    }

    loadMeeting()
    return () => { isMounted = false }
  }, [meetingId])

  useEffect(() => {
    if (meetingId && meetings.length > 0) {
      const m = meetings.find(m => m.id === meetingId)
      if (m && (!meeting || meeting.id === m.id)) setMeeting(m)
    }
  }, [meetings, meetingId])

  /* ── Loading ─────────────────────────────────────────────────── */
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-900">
        <div className="text-center text-white">
          <Loader className="w-8 h-8 mx-auto mb-4 animate-spin" />
          <h1 className="text-xl font-semibold mb-2">Loading Meeting…</h1>
          <p className="text-gray-400">Please wait while we load your meeting data.</p>
        </div>
      </div>
    )
  }

  /* ── Error ───────────────────────────────────────────────────── */
  if (error || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-slate-900 via-purple-900/40 to-slate-900">
        <div className="relative p-8 rounded-3xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-2xl text-center max-w-md w-full mx-4">
          <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/10 to-purple-500/10 rounded-3xl -z-10" />
          <h1 className="text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-400 to-purple-400 mb-4">Meeting Not Found</h1>
          <p className="text-slate-300 mb-8 leading-relaxed">{error ?? "The meeting you're looking for doesn't exist."}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 text-white font-medium px-6 py-3 rounded-xl hover:from-indigo-400 hover:to-purple-500 transition-all duration-300 shadow-[0_0_20px_rgba(99,102,241,0.3)] hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] transform hover:-translate-y-0.5"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  /* ── Main layout ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col bg-[#0f0c29] bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] font-sans antialiased" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-white/5 backdrop-blur-md border-b border-white/10 shadow-lg flex-shrink-0">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-lg">
            <div className="h-full w-full rounded-xl bg-slate-900/50 flex items-center justify-center backdrop-blur-sm">
              <span className="text-xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-indigo-300 to-purple-300">
                {meeting.title.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight drop-shadow-sm">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-sm text-indigo-200/80 mt-1 font-medium">
              {meeting.description && <span>{meeting.description}</span>}
              {meeting.description && <span className="opacity-50">•</span>}
              <span className="px-2 py-0.5 rounded-md bg-indigo-500/20 text-indigo-300 border border-indigo-500/20">{meeting.platform}</span>
              {meeting.meetingUrl && (
                <>
                  <span className="opacity-50">•</span>
                  <a
                    href={meeting.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-purple-300 hover:text-purple-200 transition-colors group"
                  >
                    <span>Open Meeting</span>
                    <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {socket.isConnected && (
            <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-sm font-semibold px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(16,185,129,0.15)] backdrop-blur-md">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
              </span>
              LIVE SYNC
            </div>
          )}
          {meeting.status === "RECORDING" && (
            <div className="flex items-center gap-2 bg-rose-500/10 border border-rose-500/20 text-rose-400 text-sm font-semibold px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(244,63,94,0.15)] backdrop-blur-md">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-rose-500"></span>
              </span>
              RECORDING
            </div>
          )}
          {meeting.status === "SCHEDULED" && (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-300 text-sm font-semibold px-4 py-1.5 rounded-full backdrop-blur-md">
              <Clock className="w-4 h-4" />
              {new Intl.DateTimeFormat("en-US", {
                month: "short", day: "numeric",
                hour: "2-digit", minute: "2-digit",
              }).format(meeting.scheduledTime)}
            </div>
          )}
          {meeting.status === "RECORDING" && (
            <button
              onClick={async () => {
                await endMeeting(meeting.id);
                setActiveTab("summary");
                // Fire and forget AI generation so they appear immediately
                generateSummary(meeting.id).catch(err => console.warn('Auto-summary skipped:', err));
                generateMindMap(meeting.id).catch(err => console.warn('Auto-mindmap skipped:', err));
              }}
              className="flex items-center gap-2 bg-gradient-to-r from-rose-500 to-rose-600 hover:from-rose-400 hover:to-rose-500 text-white text-sm font-bold px-5 py-2 rounded-xl transition-all duration-300 shadow-lg shadow-rose-500/25 hover:shadow-rose-500/40 transform hover:-translate-y-0.5 border border-rose-400/30"
            >
              <PhoneOff className="w-4 h-4" />
              End Meeting
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6 relative">
        {/* Background shapes removed to declutter workspace as requested */}

        {/* Video / meeting area */}
        <div className="flex-1 flex flex-col overflow-hidden rounded-2xl bg-black/40 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative group">
          <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 to-transparent pointer-events-none z-10 opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
          <VideoPanel meeting={meeting} />
        </div>

        {/* Side panel */}
        <div className="w-[420px] flex flex-col overflow-hidden rounded-2xl bg-white/5 backdrop-blur-xl border border-white/10 shadow-[0_8px_32px_0_rgba(0,0,0,0.3)] relative">
          <div className="absolute inset-0 bg-gradient-to-b from-white/5 to-transparent pointer-events-none z-0" />

          {/* Tab bar */}
          <nav className="relative z-10 flex border-b border-white/10 flex-shrink-0 overflow-x-auto p-2 gap-1 bg-black/20">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 relative min-w-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap rounded-xl transition-all duration-300 ${isActive
                    ? "text-white shadow-lg"
                    : "text-slate-400 hover:text-white hover:bg-white/5"
                    }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-indigo-500/80 to-purple-600/80 rounded-xl shadow-[0_0_15px_rgba(99,102,241,0.4)]" />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab content */}
          <div className="relative z-10 flex-1 overflow-hidden bg-white/5">
            {activeTab === "live" && <RealTimeTranscript meetingId={meeting.id} isRecording={meeting.status === "RECORDING"} />}
            {activeTab === "transcript" && <TranscriptPanel meeting={meeting} />}
            {activeTab === "summary" && <SummaryPanel meeting={meeting} />}
            {activeTab === "mindmap" && <MindMapPanel meeting={meeting} />}
            {activeTab === "notes" && <MeetingNotes meeting={meeting} />}
          </div>
        </div>
      </div>
    </div>
  )
}
