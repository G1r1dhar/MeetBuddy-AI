"use client"
import { AuthProvider } from "../../../src/contexts/AuthContext"
import { MeetingProvider } from "../../../src/contexts/MeetingContext"
import MeetingRoom from "../../../src/pages/MeetingRoom"

export default function MeetingPage({ params }: { params: { id: string } }) {
  return (
    <AuthProvider>
      <MeetingProvider>
        <MeetingRoom meetingId={params.id} />
      </MeetingProvider>
    </AuthProvider>
  )
}
