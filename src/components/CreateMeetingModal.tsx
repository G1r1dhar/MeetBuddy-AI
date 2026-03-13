import type React from "react"
import { useState } from "react"
import { X, Calendar, FileText, Brain, ExternalLink, Video } from "lucide-react"
import { useMeeting } from "../contexts/MeetingContext"

interface ScheduleMeetingModalProps {
  isOpen: boolean
  onClose: () => void
}

export default function CreateMeetingModal({ isOpen, onClose }: ScheduleMeetingModalProps) {
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [scheduledDate, setScheduledDate] = useState("")
  const [scheduledTime, setScheduledTime] = useState("")
  const [platform, setPlatform] = useState("GOOGLE_MEET")
  const [meetingUrl, setMeetingUrl] = useState("")
  const { scheduleMeeting } = useMeeting()

  if (!isOpen) return null

  const platforms = [
    { id: "GOOGLE_MEET", name: "Google Meet", icon: "🎥" },
    { id: "ZOOM", name: "Zoom", icon: "📹" },
    { id: "MICROSOFT_TEAMS", name: "Microsoft Teams", icon: "💼" },
    { id: "WEBEX", name: "Cisco Webex", icon: "🌐" },
    { id: "DISCORD", name: "Discord", icon: "🎮" },
    { id: "SKYPE", name: "Skype", icon: "📞" },
  ]

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    const scheduledDateTime = new Date(`${scheduledDate}T${scheduledTime}`)
    
    // Validate scheduled time is not too far in the past
    const now = new Date()
    if (scheduledDateTime < new Date(now.getTime() - 5 * 60000)) {
      alert('Meeting time must be in the future. Please select a later date and time.')
      return
    }

    // @ts-ignore
    const _meetingId = scheduleMeeting(title, description, scheduledDateTime, platform, meetingUrl)
    onClose()
    setTitle("")
    setDescription("")
    setScheduledDate("")
    setScheduledTime("")
    setMeetingUrl("")
  }

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-50">
      <div className="bg-theme-card border border-theme-card-border rounded-2xl max-w-md w-full p-6 relative shadow-2xl dark:shadow-theme-accent/5">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 text-theme-icon hover:text-theme-text transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="flex items-center space-x-3 mb-6">
          <div className="bg-theme-accent/20 p-2 rounded-lg">
            <Video className="w-6 h-6 text-theme-accent" />
          </div>
          <h2 className="text-xl font-semibold text-theme-text">Schedule Meeting</h2>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="title" className="block text-sm font-medium text-theme-text mb-2">
              Meeting Title
            </label>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent"
              placeholder="Enter meeting title"
              required
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-theme-text mb-2">
              Description
            </label>
            <textarea
              id="description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent resize-none"
              placeholder="Brief description of the meeting"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="date" className="block text-sm font-medium text-theme-text mb-2">
                Date
              </label>
              <input
                id="date"
                type="date"
                value={scheduledDate}
                onChange={(e) => setScheduledDate(e.target.value)}
                min={new Date().toISOString().split("T")[0]}
                className="w-full px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent"
                required
              />
            </div>

            <div>
              <label htmlFor="time" className="block text-sm font-medium text-theme-text mb-2">
                Time
              </label>
              <input
                id="time"
                type="time"
                value={scheduledTime}
                onChange={(e) => setScheduledTime(e.target.value)}
                className="w-full px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent"
                required
              />
            </div>
          </div>

          <div>
            <label htmlFor="platform" className="block text-sm font-medium text-theme-text mb-2">
              Meeting Platform
            </label>
            <select
              id="platform"
              value={platform}
              onChange={(e) => setPlatform(e.target.value)}
              className="w-full px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent"
            >
              {platforms.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.icon} {p.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label htmlFor="meetingUrl" className="block text-sm font-medium text-theme-text mb-2">
              Meeting URL (Optional)
            </label>
            <div className="flex space-x-2">
              <input
                id="meetingUrl"
                type="url"
                value={meetingUrl}
                onChange={(e) => setMeetingUrl(e.target.value)}
                className="flex-1 px-3 py-2 bg-theme-bg border border-theme-card-border rounded-lg text-theme-text focus:ring-2 focus:ring-theme-accent focus:border-transparent"
                placeholder="https://meet.google.com/..."
              />
              <button
                type="button"
                className="px-3 py-2 text-theme-icon hover:text-theme-text transition-colors"
                title="Open meeting link"
              >
                <ExternalLink className="w-5 h-5" />
              </button>
            </div>
          </div>

          <div className="bg-theme-accent/10 border border-theme-accent/20 p-4 rounded-lg">
            <h4 className="text-sm font-medium text-theme-accent mb-2">What happens when scheduled:</h4>
            <ul className="text-xs text-theme-text opacity-80 space-y-1">
              <li className="flex items-center">
                <FileText className="w-3 h-3 mr-2" />
                Meeting added to calendar with reminders
              </li>
              <li className="flex items-center">
                <Brain className="w-3 h-3 mr-2" />
                Ready to record when meeting starts
              </li>
              <li className="flex items-center">
                <ExternalLink className="w-3 h-3 mr-2" />
                AI summary and notes generated automatically
              </li>
            </ul>
          </div>

          <div className="flex space-x-3 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 px-4 py-2 border border-theme-card-border text-theme-text rounded-lg hover:bg-theme-bg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="flex-1 px-4 py-2 bg-theme-accent text-black font-medium rounded-lg hover:brightness-110 transition-colors"
            >
              Schedule Meeting
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
