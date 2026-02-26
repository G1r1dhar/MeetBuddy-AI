import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom"
import { AuthProvider } from "./contexts/AuthContext"
import { MeetingProvider } from "./contexts/MeetingContext"
import ErrorBoundary from "./components/ErrorBoundary"
import ProtectedRoute from "./components/ProtectedRoute"
import LoadingSpinner from "./components/LoadingSpinner"
import Header from "./components/Header"
import Dashboard from "./pages/Dashboard"
import MeetingRoom from "./pages/MeetingRoom"
import AdminPanel from "./pages/AdminPanel"
import Login from "./pages/Login"
import Register from "./pages/Register"
import SettingsPanel from "./components/SettingsPanel"
import { useAuth } from "./contexts/AuthContext"
import { Toaster } from "sonner"

function AppContent() {
  const { loading } = useAuth()

  if (loading) {
    return <LoadingSpinner fullScreen text="Loading MeetBuddy AI..." />
  }

  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-black text-white">
              <Header />
              <main className="pt-16">
                <Dashboard />
              </main>
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/meeting/:id"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-black text-white">
              <Header />
              <main className="pt-16">
                <MeetingRoom />
              </main>
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/settings"
        element={
          <ProtectedRoute>
            <div className="min-h-screen bg-black text-white">
              <Header />
              <main className="pt-16">
                <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                  <SettingsPanel />
                </div>
              </main>
            </div>
          </ProtectedRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <ProtectedRoute requireAdmin>
            <div className="min-h-screen bg-black text-white">
              <Header />
              <main className="pt-16">
                <AdminPanel />
              </main>
            </div>
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

function App() {
  return (
    <ErrorBoundary>
      <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <AuthProvider>
          <MeetingProvider>
            <Toaster theme="dark" position="bottom-right" />
            <AppContent />
          </MeetingProvider>
        </AuthProvider>
      </Router>
    </ErrorBoundary>
  )
}

export default App
