"use client"
import { AuthProvider } from "../../src/contexts/AuthContext"
import { MeetingProvider } from "../../src/contexts/MeetingContext"
import SettingsPanel from "../../src/components/SettingsPanel"

export default function SettingsPage() {
  return (
    <AuthProvider>
      <MeetingProvider>
        <div className="min-h-screen bg-black text-white">
          <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <SettingsPanel />
          </div>
        </div>
      </MeetingProvider>
    </AuthProvider>
  )
}
