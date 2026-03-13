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
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="text-center text-theme-text">
          <Loader className="w-8 h-8 mx-auto mb-4 animate-spin text-theme-accent" />
          <h1 className="text-xl font-semibold mb-2">Loading Meeting…</h1>
          <p className="opacity-70">Please wait while we load your meeting data.</p>
        </div>
      </div>
    )
  }

  /* ── Error ───────────────────────────────────────────────────── */
  if (error || !meeting) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-theme-bg">
        <div className="relative p-8 rounded-3xl bg-theme-card border border-theme-card-border shadow-2xl text-center max-w-md w-full mx-4 overflow-hidden">
          <div className="absolute inset-0 bg-theme-accent/5 rounded-3xl -z-10" />
          <h1 className="text-3xl font-bold text-theme-accent mb-4">Meeting Not Found</h1>
          <p className="text-theme-text opacity-80 mb-8 leading-relaxed">{error ?? "The meeting you're looking for doesn't exist."}</p>
          <button
            onClick={() => navigate("/")}
            className="w-full bg-theme-accent text-black font-medium px-6 py-3 rounded-xl hover:brightness-110 transition-all duration-300 shadow-[0_4px_14px_0_rgba(255,193,7,0.39)] hover:shadow-[0_6px_20px_rgba(255,193,7,0.23)] transform hover:-translate-y-0.5"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

  /* ── Main layout ─────────────────────────────────────────────── */
  return (
    <div className="flex flex-col bg-theme-bg font-sans antialiased transition-colors duration-300" style={{ height: 'calc(100vh - 4rem)' }}>

      {/* ── Header ─────────────────────────────────────────────── */}
      <header className="relative z-10 flex items-center justify-between px-6 py-4 bg-theme-card border-b border-theme-card-border shadow-md flex-shrink-0 transition-colors duration-300">
        <div className="flex items-center gap-4">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-theme-accent/80 to-yellow-600 p-[1px] shadow-[0_0_15px_var(--accent-yellow-translucent)]">
            <div className="h-full w-full rounded-xl bg-theme-card flex items-center justify-center">
              <span className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-theme-accent to-yellow-500">
                {meeting.title.charAt(0).toUpperCase()}
              </span>
            </div>
          </div>
          <div>
            <h1 className="text-xl font-bold text-theme-text tracking-tight">{meeting.title}</h1>
            <div className="flex items-center gap-3 text-sm text-theme-text opacity-80 mt-1 font-medium">
              {meeting.description && <span>{meeting.description}</span>}
              {meeting.description && <span className="opacity-50">•</span>}
              <span className="px-2 py-0.5 rounded-md bg-theme-accent/10 text-theme-accent border border-theme-accent/20 tracking-wider text-xs">
                {meeting.platform}
              </span>
              {meeting.meetingUrl && (
                <>
                  <span className="opacity-50">•</span>
                  <a
                    href={meeting.meetingUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-theme-accent hover:brightness-110 transition-colors group"
                  >
                    <span>Open Meeting</span>
                    <ExternalLink className="w-3.5 h-3.5 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                  </a>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4 border-l border-theme-card-border pl-4">
          {socket.isConnected && (
            <div className="flex items-center gap-2 bg-green-500/10 border border-green-500/20 text-green-500 text-sm font-semibold px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(34,197,94,0.15)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500"></span>
              </span>
              LIVE SYNC
            </div>
          )}
          {meeting.status === "RECORDING" && (
            <div className="flex items-center gap-2 bg-red-500/10 border border-red-500/20 text-red-500 text-sm font-semibold px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(239,68,68,0.15)]">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500"></span>
              </span>
              RECORDING
            </div>
          )}
          {meeting.status === "SCHEDULED" && (
            <div className="flex items-center gap-2 bg-blue-500/10 border border-blue-500/20 text-blue-500 text-sm font-semibold px-4 py-1.5 rounded-full">
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
              className="flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-bold bg-red-500 text-white hover:bg-red-600 transition-all duration-300 shadow-lg shadow-red-500/25 border border-red-500/30 transform hover:-translate-y-0.5"
            >
              <PhoneOff className="w-4 h-4" />
              End Meeting
            </button>
          )}
        </div>
      </header>

      {/* ── Body ───────────────────────────────────────────────── */}
      <div className="flex-1 flex overflow-hidden p-6 gap-6 relative">

        {/* Video / meeting area */}
        <div className="flex-1 flex flex-col overflow-hidden rounded-2xl bg-theme-bg border border-theme-card-border shadow-xl relative group">
          <div className="absolute inset-0 bg-theme-card/10 pointer-events-none z-10" />
          <VideoPanel meeting={meeting} />
        </div>

        {/* Side panel */}
        <div className="w-[420px] flex flex-col overflow-hidden rounded-2xl bg-theme-card border border-theme-card-border shadow-xl relative transition-colors duration-300">

          {/* Tab bar */}
          <nav className="relative z-10 flex border-b border-theme-card-border overflow-x-auto p-2 gap-1 bg-theme-bg/50">
            {TABS.map(tab => {
              const isActive = activeTab === tab.id;
              return (
                <button
                  type="button"
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex-1 relative min-w-0 px-3 py-2.5 text-xs font-bold whitespace-nowrap rounded-xl transition-all duration-300 ${
                    isActive
                      ? "text-black shadow-[0_0_15px_var(--accent-yellow-translucent)]"
                      : "text-theme-text opacity-60 hover:opacity-100 hover:bg-theme-bg"
                  }`}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-theme-accent to-yellow-500 rounded-xl" />
                  )}
                  <span className="relative z-10">{tab.label}</span>
                </button>
              );
            })}
          </nav>

          {/* Tab content */}
          <div className="relative z-10 flex-1 overflow-hidden bg-theme-card">
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
