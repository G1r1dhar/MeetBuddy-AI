"use client"
import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./contexts/AuthContext"
import { MeetingProvider } from "./contexts/MeetingContext"
import Header from "./components/Header"
import Dashboard from "./pages/Dashboard"
import MeetingRoom from "./pages/MeetingRoom"
import AdminPanel from "./pages/AdminPanel"
import Login from "./pages/Login"
import SettingsPanel from "./components/SettingsPanel"
import { useAuth } from "./contexts/AuthContext"

function AppContent() {
  const { user, isAdmin } = useAuth()

  if (!user) {
    return <Login />
  }

  return (
    <div className="min-h-screen bg-black text-white">
      <Header />
      <main className="pt-16">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/meeting/:id" element={<MeetingRoom />} />
          <Route
            path="/settings"
            element={
              <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                <SettingsPanel />
              </div>
            }
          />
          {isAdmin && <Route path="/admin" element={<AdminPanel />} />}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <MeetingProvider>
          <AppContent />
        </MeetingProvider>
      </AuthProvider>
    </Router>
  )
}

export default App
