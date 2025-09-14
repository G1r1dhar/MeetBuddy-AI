"use client"
import { AuthProvider } from "../src/contexts/AuthContext"
import { MeetingProvider } from "../src/contexts/MeetingContext"
import Dashboard from "../src/pages/Dashboard"

export default function Page() {
  return (
    <AuthProvider>
      <MeetingProvider>
        <div className="min-h-screen bg-black text-white">
          <Dashboard />
        </div>
      </MeetingProvider>
    </AuthProvider>
  )
}
