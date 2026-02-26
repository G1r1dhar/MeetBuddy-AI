""

import type React from "react"
import { createContext, useContext, useState, useEffect, useCallback } from "react"
import { meetingService, type Meeting, type TranscriptEntry, type MindMapNode, type CreateMeetingRequest } from "../services/meetingService"
export type { Meeting, TranscriptEntry, MindMapNode, CreateMeetingRequest }
import { useSocket } from "../hooks/useSocket"
import { useAuth } from "./AuthContext"

// Meeting, TranscriptEntry, and MindMapNode interfaces are now imported from meetingService

interface MeetingContextType {
  meetings: Meeting[]
  activeMeeting: Meeting | null
  loading: boolean
  error: string | null
  scheduleMeeting: (title: string, description: string, scheduledTime: Date, platform: string, meetingUrl?: string) => Promise<string>
  joinMeeting: (id: string) => Promise<void>
  endMeeting: (id: string) => Promise<void>
  updateMeetingTranscript: (id: string, entry: Omit<TranscriptEntry, 'id'>) => Promise<void>
  generateSummary: (id: string) => Promise<void>
  generateMindMap: (id: string) => Promise<void>
  deleteMeeting: (id: string) => Promise<void>
  updateMeetingNotes: (id: string, notes: string) => Promise<void>
  getMeetingById: (id: string) => Promise<Meeting>
  refreshMeetings: () => Promise<void>
  clearError: () => void
  getTotalStorageUsed: () => number
  getMeetingsThisMonth: () => number
  getMeetingsThisWeek: () => number
}

const MeetingContext = createContext<MeetingContextType | undefined>(undefined)

export function MeetingProvider({ children }: { children: React.ReactNode }) {
  const [meetings, setMeetings] = useState<Meeting[]>([])
  const [activeMeeting, setActiveMeeting] = useState<Meeting | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hasInitialized, setHasInitialized] = useState(false) // Prevent multiple initializations

  // Get auth state to wait for authentication
  const { user, loading: authLoading } = useAuth()

  // Initialize socket connection
  const socket = useSocket({ autoConnect: true })

  // Define functions first to avoid hoisting issues
  const refreshMeetings = useCallback(async () => {
    try {
      console.log('🔄 MeetingContext: Starting to refresh meetings...');
      setLoading(true)
      setError(null)
      const allMeetings = await meetingService.getAllMeetings()
      console.log('✅ MeetingContext: Received meetings from service:', allMeetings.length);
      console.log('📋 MeetingContext: Meeting details:', allMeetings.map(m => ({ id: m.id, title: m.title, status: m.status })));
      setMeetings(allMeetings)
      setHasInitialized(true)
      console.log('✅ MeetingContext: Meetings state updated');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load meetings'
      console.error('❌ MeetingContext: Failed to load meetings:', err);
      setError(errorMessage)
    } finally {
      setLoading(false)
    }
  }, []) // No dependencies needed

  const joinMeeting = useCallback(async (id: string) => {
    try {
      setError(null)
      const updatedMeeting = await meetingService.startMeeting(id)
      setActiveMeeting(updatedMeeting)
      setMeetings((prev) => prev.map((m) => (m.id === id ? updatedMeeting : m)))

      if (socket.isConnected) {
        socket.joinMeeting(id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to join meeting'
      setError(errorMessage)
      throw err
    }
  }, [socket])

  const getMeetingById = useCallback(async (id: string): Promise<Meeting> => {
    try {
      setError(null)

      // If not found locally, fetch from API
      const meeting = await meetingService.getMeeting(id)

      // Update local state by merging with existing meeting data
      // This prevents API fetches from wiping out real-time WebSocket updates that
      // might not yet be fully persisted or processed by the backend database.
      setMeetings(prev => {
        const existingMeeting = prev.find(m => m.id === id)
        if (!existingMeeting) {
          return [...prev, meeting]
        }

        // Merge strategy: Keep existing local state for enriched fields if API returns empty
        return prev.map(m => m.id === id ? {
          ...meeting,
          // Preserve local state if API is missing these fields
          transcript: meeting.transcript?.length ? meeting.transcript : existingMeeting.transcript,
          summary: meeting.summary || existingMeeting.summary,
          topics: meeting.topics?.length ? meeting.topics : existingMeeting.topics,
          notes: meeting.notes || existingMeeting.notes,
          mindMap: meeting.mindMap || existingMeeting.mindMap,
          // Preserve status if local is recording but API says scheduled (can happen due to async sync)
          status: existingMeeting.status === 'RECORDING' && meeting.status === 'SCHEDULED'
            ? 'RECORDING' : meeting.status
        } : m)
      })

      return meeting
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to get meeting'
      setError(errorMessage)
      throw err
    }
  }, []) // Remove meetings dependency to prevent infinite loops

  useEffect(() => {
    // Only load meetings if user is authenticated and auth is not loading
    console.log('🔍 MeetingContext: Auth state changed:', { user: !!user, authLoading, hasInitialized });
    if (user && !authLoading && !hasInitialized) {
      console.log('✅ MeetingContext: User authenticated, loading meetings...');
      refreshMeetings()
    } else {
      console.log('⏳ MeetingContext: Waiting for authentication or already initialized...');
    }
  }, [user, authLoading, hasInitialized, refreshMeetings]) // Add hasInitialized to prevent multiple loads

  // Set up real-time event listeners
  useEffect(() => {
    // Meeting status updates
    const handleMeetingStatusChanged = (data: { meetingId: string; status: Meeting['status'] }) => {
      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? { ...meeting, status: data.status }
          : meeting
      ))

      if (activeMeeting?.id === data.meetingId) {
        setActiveMeeting(prev => prev ? { ...prev, status: data.status } : null)
      }
    }

    // New transcript entries
    const handleNewTranscriptEntry = (data: { meetingId: string; entry: TranscriptEntry }) => {
      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? {
            ...meeting,
            transcript: [...(meeting.transcript || []), data.entry]
          }
          : meeting
      ))

      if (activeMeeting?.id === data.meetingId) {
        setActiveMeeting(prev => prev ? {
          ...prev,
          transcript: [...(prev.transcript || []), data.entry]
        } : null)
      }
    }

    // AI summary generated
    const handleSummaryGenerated = (data: {
      meetingId: string;
      summary: string;
      topics: string[];
      keyPoints?: string[];
      actionItems?: string[];
      nextSteps?: string[];
    }) => {
      // Create notes from key points and action items
      const notes = [
        ...(data.keyPoints || []),
        ...(data.actionItems || []),
        ...(data.nextSteps || [])
      ].join('\n');

      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? {
            ...meeting,
            summary: data.summary,
            topics: data.topics,
            notes: notes || meeting.notes
          }
          : meeting
      ))

      if (activeMeeting?.id === data.meetingId) {
        setActiveMeeting(prev => prev ? {
          ...prev,
          summary: data.summary,
          topics: data.topics,
          notes: notes || prev.notes
        } : null)
      }
    }

    // Mind map generated
    const handleMindMapGenerated = (data: { meetingId: string; mindMap: any }) => {
      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? { ...meeting, mindMap: data.mindMap }
          : meeting
      ))

      if (activeMeeting?.id === data.meetingId) {
        setActiveMeeting(prev => prev ? {
          ...prev,
          mindMap: data.mindMap
        } : null)
      }
    }

    // Participant updates
    const handleParticipantJoined = (data: { meetingId: string; participant: string }) => {
      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? {
            ...meeting,
            participants: [...(meeting.participants || []), data.participant]
          }
          : meeting
      ))
    }

    const handleParticipantLeft = (data: { meetingId: string; participant: string }) => {
      setMeetings(prev => prev.map(meeting =>
        meeting.id === data.meetingId
          ? {
            ...meeting,
            participants: (meeting.participants || []).filter(p => p !== data.participant)
          }
          : meeting
      ))
    }

    // System notifications
    const handleSystemNotification = (data: { type: string; message: string; meetingId?: string }) => {
      console.log('System notification:', data)
      // You could show toast notifications here
    }

    const handleSystemError = (data: { error: string; meetingId?: string }) => {
      console.error('System error:', data)
      setError(data.error)
    }

    // Register event listeners
    socket.on('meeting:status-changed', handleMeetingStatusChanged)
    socket.on('transcript:new-entry', handleNewTranscriptEntry)
    socket.on('ai:summary-generated', handleSummaryGenerated)
    socket.on('ai:mindmap-generated', handleMindMapGenerated)
    socket.on('meeting:participant-joined', handleParticipantJoined)
    socket.on('meeting:participant-left', handleParticipantLeft)
    socket.on('system:notification', handleSystemNotification)
    socket.on('system:error', handleSystemError)

    // Cleanup listeners on unmount
    return () => {
      socket.off('meeting:status-changed', handleMeetingStatusChanged)
      socket.off('transcript:new-entry', handleNewTranscriptEntry)
      socket.off('ai:summary-generated', handleSummaryGenerated)
      socket.off('ai:mindmap-generated', handleMindMapGenerated)
      socket.off('meeting:participant-joined', handleParticipantJoined)
      socket.off('meeting:participant-left', handleParticipantLeft)
      socket.off('system:notification', handleSystemNotification)
      socket.off('system:error', handleSystemError)
    }
  }, [socket, activeMeeting?.id])

  const clearError = () => {
    setError(null)
  }

  const scheduleMeeting = async (title: string, description: string, scheduledTime: Date, platform: string, meetingUrl?: string): Promise<string> => {
    try {
      setError(null)
      const meetingData: CreateMeetingRequest = {
        title,
        description,
        scheduledTime: scheduledTime, // Keep as Date object for now, will be converted in service
        platform,
        meetingUrl,
      }
      const newMeeting = await meetingService.createMeeting(meetingData)
      setMeetings((prev) => [...prev, newMeeting])
      return newMeeting.id
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to schedule meeting'
      setError(errorMessage)
      throw err
    }
  }

  const endMeeting = async (id: string) => {
    try {
      setError(null)
      const updatedMeeting = await meetingService.endMeeting(id)
      setMeetings((prev) => prev.map((m) => (m.id === id ? updatedMeeting : m)))
      setActiveMeeting(null)

      // Leave the meeting room via socket
      if (socket.isConnected) {
        socket.leaveMeeting(id)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to end meeting'
      setError(errorMessage)
      throw err
    }
  }

  const updateMeetingTranscript = async (id: string, entry: Omit<TranscriptEntry, 'id'>) => {
    try {
      setError(null)
      const newEntry = await meetingService.addTranscriptEntry(id, entry)
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, transcript: [...(m.transcript || []), newEntry] } : m)))

      // Send real-time transcript update via socket
      if (socket.isConnected) {
        socket.emit.transcriptUpdate(id, entry)
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update transcript'
      setError(errorMessage)
      throw err
    }
  }

  const generateSummary = async (id: string) => {
    try {
      setError(null)

      // Request summary generation via socket for real-time updates
      if (socket.isConnected) {
        socket.emit.generateSummary(id)
      }

      // Also call the API for fallback
      const summaryData = await meetingService.generateSummary(id)
      setMeetings((prev) =>
        prev.map((m) =>
          m.id === id
            ? {
              ...m,
              summary: summaryData.summary,
              topics: summaryData.topics,
              notes: summaryData.notes,
            }
            : m,
        ),
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate summary'
      setError(errorMessage)
      console.error("Failed to generate AI summary:", err)

      // Update meeting with error state
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
      throw err
    }
  }

  const generateMindMap = async (id: string) => {
    try {
      setError(null)

      // Request mind map generation via socket for real-time updates
      if (socket.isConnected) {
        socket.emit.generateMindMap(id)
      }

      // Also call the API for fallback
      const mindMap = await meetingService.generateMindMap(id)
      setMeetings((prev) => prev.map((m) => (m.id === id ? { ...m, mindMap } : m)))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate mind map'
      setError(errorMessage)
      throw err
    }
  }

  const deleteMeeting = async (id: string) => {
    try {
      setError(null)
      await meetingService.deleteMeeting(id)
      setMeetings((prev) => prev.filter((m) => m.id !== id))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to delete meeting'
      setError(errorMessage)
      throw err
    }
  }

  const updateMeetingNotes = async (id: string, notes: string) => {
    try {
      setError(null)
      const updatedMeeting = await meetingService.updateMeeting(id, { notes })
      setMeetings((prev) => prev.map((m) => (m.id === id ? updatedMeeting : m)))
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update notes'
      setError(errorMessage)
      throw err
    }
  }

  const getTotalStorageUsed = (): number => {
    return meetingService.calculateTotalStorageUsed(meetings)
  }

  const getMeetingsThisMonth = (): number => {
    return meetingService.calculateMeetingsThisMonth(meetings)
  }

  const getMeetingsThisWeek = (): number => {
    return meetingService.calculateMeetingsThisWeek(meetings)
  }

  return (
    <MeetingContext.Provider
      value={{
        meetings,
        activeMeeting,
        loading,
        error,
        scheduleMeeting,
        joinMeeting,
        endMeeting,
        updateMeetingTranscript,
        generateSummary,
        generateMindMap,
        deleteMeeting,
        updateMeetingNotes,
        getMeetingById,
        refreshMeetings,
        clearError,
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
