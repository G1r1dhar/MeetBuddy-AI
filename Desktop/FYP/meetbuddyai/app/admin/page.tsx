"use client"
import { AuthProvider } from "../../src/contexts/AuthContext"
import { MeetingProvider } from "../../src/contexts/MeetingContext"
import AdminPanel from "../../src/pages/AdminPanel"

export default function AdminPage() {
  return (
    <AuthProvider>
      <MeetingProvider>
        <div className="min-h-screen bg-black text-white">
          <AdminPanel />
        </div>
      </MeetingProvider>
    </AuthProvider>
  )
}
