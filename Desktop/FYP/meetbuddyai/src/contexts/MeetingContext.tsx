"use client"

import type React from "react"
import { createContext, useContext, useState } from "react"
import { AISummarizerService } from "../services/AISummarizer"

export interface Meeting {
  id: string
  title: string
  description: string
  scheduledTime: Date
  startTime: Date
  endTime?: Date
  status: "scheduled" | "recording" | "completed"
  participants: string[]
  platform: "google-meet"
  meetingUrl?: string
  recordingUrl?: string
  summary?: string
  topics?: string[]
  notes?: string
  mindMap?: MindMapNode
  transcript?: TranscriptEntry[]
  createdBy: string
  storageSize?: number // in MB
}

export interface TranscriptEntry {
  id: string
  speaker: string
  text: string
  timestamp: Date
  confidence: number
}

export interface MindMapNode {
  id: string
  text: string
  children: MindMapNode[]
  x: number
  y: number
}

interface MeetingContextType {
  meetings: Meeting[]
  activeMeeting: Meeting | null
  scheduleMeeting: (title: string, description: string, scheduledTime: Date, meetingUrl: string) => string
  joinMeeting: (id: string) => void
  endMeeting: (id: string) => void
  updateMeetingTranscript: (id: string, entry: TranscriptEntry) => void
  generateSummary: (id: string) => void
  generateMindMap: (id: string) => void
  deleteMeeting: (id: string) => void
  updateMeetingNotes: (id: string, notes: string) => void
  getTotalStorageUsed: () => number
  getMeetingsThisMonth: () => number
  getMeetingsThisWeek: () => number
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined)

export function MeetingProvider({ children }: { children: React.ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null)
  const aiSummarizer = AISummarizerService.getInstance()

  const scheduleMeeting = (title: string, description: string, scheduledTime: Date, meetingUrl: string): string => {
    const newMeeting: Meeting = {
      id: Date.now().toString(),
      title,
      description,
      scheduledTime,
      startTime: scheduledTime,
      status: "scheduled",
      participants: [],
      platform: "google-meet",
      meetingUrl,
      createdBy: "current-user@example.com",
      transcript: [],
    }
    setMeetings((prev) => [...prev, newMeeting])
    return newMeeting.id
  }

  const joinMeeting = (id: string) => {
    const meeting = meetings.find((m) => m.id === id)
    if (meeting) {
      setActiveMeeting(meeting)
      setMeetings((prev) =>
        prev.map((m) => (m.id === id ? { ...m, status: "recording" as const, startTime: new Date() } : m)),
      )
    }
  }

  const endMeeting = (id: string) => {
    setMeetings((prev) =>
      prev.map((m) => (m.id === id ? { ...m, status: "completed" as const, endTime: new Date() } : m)),
    )
    setActiveMeeting(null)
  }

  const updateMeetingTranscript = (id: string, entry: TranscriptEntry) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, transcript: [...(m.transcript || []), entry] } : m)))
  }

  const generateSummary = async (id: string) => {
    const meeting = meetings.find((m) => m.id === id)
    if (!meeting) return

    try {
      const transcriptText = meeting.transcript?.map((entry) => `${entry.speaker}: ${entry.text}`).join("\n") || ""

      const summaryResult = await aiSummarizer.generateSummary(transcriptText, meeting.title)

      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                summary: summaryResult.overallSummary,
                topics: summaryResult.topics,
                notes: `**Key Points:**\n${summaryResult.keyPoints.join("\n")}\n\n**Action Items:**\n${summaryResult.actionItems.join("\n")}\n\n**Next Steps:**\n${summaryResult.nextSteps.join("\n")}`,
              }
            : m,
        ),
      )
    } catch (error) {
      console.error("Failed to generate AI summary:", error)
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
                ...m,
                summary: "Summary generation failed. Please try again or check the meeting transcript.",
                topics: ["Summary Error"],
              }
            : m,
        ),
      )
    }
  }

  const generateMindMap = (id: string) => {
    setTimeout(() => {
      const mindMap: MindMapNode = {
        id: "root",
        text: "Meeting Overview",
        x: 400,
        y: 200,
        children: [
          {
            id: "topics",
            text: "Key Topics",
            x: 200,
            y: 100,
            children: [
              { id: "topic1", text: "Strategy", x: 100, y: 50, children: [] },
              { id: "topic2", text: "Implementation", x: 100, y: 150, children: [] },
            ],
          },
          {
            id: "actions",
            text: "Action Items",
            x: 600,
            y: 100,
            children: [
              { id: "action1", text: "Follow-up", x: 700, y: 50, children: [] },
              { id: "action2", text: "Review", x: 700, y: 150, children: [] },
            ],
          },
        ],
      }

      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, mindMap } : m)))
    }, 3000)
  }

  const deleteMeeting = (id: string) => {
    setMeetings((prev) => prev.filter((m) => m.id !== id))
  }

  const updateMeetingNotes = (id: string, notes: string) => {
    setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, notes } : m)))
  }

  const getTotalStorageUsed = (): number => {
    return meetings.reduce((total, meeting) => total + (meeting.storageSize || 0), 0)
  }

  const getMeetingsThisMonth = (): number => {
    const now = new Date()
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    return meetings.filter((m) => m.startTime >= startOfMonth).length
  }

  const getMeetingsThisWeek = (): number => {
    const now = new Date()
    const startOfWeek = new Date(now.setDate(now.getDate() - now.getDay()))
    return meetings.filter((m) => m.startTime >= startOfWeek).length
  }

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        activeMeeting,
        scheduleMeeting,
        joinMeeting,
        endMeeting,
        updateMeetingTranscript,
        generateSummary,
        generateMindMap,
        deleteMeeting,
        updateMeetingNotes,
        getTotalStorageUsed,
        getMeetingsThisMonth,
        getMeetingsThisWeek,
      }}
    >
      {children}
    </MeetingContext.Provider>
  )
}

export function useMeeting() {
  const context = useContext(MeetingContext)
  if (context === undefined) {
    throw new Error("useMeeting must be used within a MeetingProvider")
  }
  return context
}
