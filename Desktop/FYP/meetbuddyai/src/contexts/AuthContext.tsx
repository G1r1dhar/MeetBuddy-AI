"use client"

import type React from "react"
import { createContext, useContext, useState, useEffect } from "react"

interface User {
  id: string
  name: string
  email: string
  avatar: string
  role: "user" | "admin"
  createdAt: Date
  lastLogin: Date
  subscription: "free" | "pro" | "enterprise"
  storageUsed: number // in MB
  meetingsThisMonth: number
  darkMode: boolean
  notifications: {
    meetingReminders: boolean
    summaryReady: boolean
    adminMessages: boolean
  }
  preferences: {
    autoGenerateNotes: boolean
    enableRealTimeTranscript: boolean
    autoExportSummaries: boolean
  }
}

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  logout: () => void
  loading: boolean
  users: User[]
  addUser: (userData: Omit<User, "id" | "createdAt" | "lastLogin">) => void
  updateUser: (id: string, updates: Partial<User>) => void
  deleteUser: (id: string) => void
  deleteAccount: () => void
  toggleDarkMode: () => void
  updateNotificationSettings: (settings: User["notifications"]) => void
  updatePreferences: (preferences: User["preferences"]) => void
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [users, setUsers] = useState<User[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Initialize with minimal user data
    const sampleUsers: User[] = [
      {
        id: "1",
        name: "John Doe",
        email: "user@meetbuddy.ai",
        avatar:
          "https://images.pexels.com/photos/220453/pexels-photo-220453.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
        role: "user",
        createdAt: new Date("2024-01-15"),
        lastLogin: new Date(),
        subscription: "pro",
        storageUsed: 0,
        meetingsThisMonth: 0,
        darkMode: true,
        notifications: {
          meetingReminders: true,
          summaryReady: true,
          adminMessages: true,
        },
        preferences: {
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: false,
        },
      },
      {
        id: "2",
        name: "Admin User",
        email: "admin@meetbuddy.ai",
        avatar:
          "https://images.pexels.com/photos/415829/pexels-photo-415829.jpeg?auto=compress&cs=tinysrgb&w=150&h=150&fit=crop",
        role: "admin",
        createdAt: new Date("2024-01-01"),
        lastLogin: new Date(),
        subscription: "enterprise",
        storageUsed: 0,
        meetingsThisMonth: 0,
        darkMode: true,
        notifications: {
          meetingReminders: true,
          summaryReady: true,
          adminMessages: true,
        },
        preferences: {
          autoGenerateNotes: true,
          enableRealTimeTranscript: true,
          autoExportSummaries: true,
        },
      },
    ]
    setUsers(sampleUsers)

    // Check for existing session
    const savedUser = localStorage.getItem("meetbuddy_user")
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
    setLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    await new Promise((resolve) => setTimeout(resolve, 1000))

    const foundUser = users.find((u) => u.email === email)
    if (!foundUser) {
      setLoading(false)
      throw new Error("Invalid credentials")
    }

    const updatedUser = { ...foundUser, lastLogin: new Date() }
    setUser(updatedUser)
    localStorage.setItem("meetbuddy_user", JSON.stringify(updatedUser))
    setLoading(false)
  }

  const logout = () => {
    setUser(null)
    localStorage.removeItem("meetbuddy_user")
  }

  const addUser = (userData: Omit<User, "id" | "createdAt" | "lastLogin">) => {
    const newUser: User = {
      ...userData,
      id: Date.now().toString(),
      createdAt: new Date(),
      lastLogin: new Date(),
    }
    setUsers((prev) => [...prev, newUser])
  }

  const updateUser = (id: string, updates: Partial<User>) => {
    setUsers((prev) => prev.map((u) => (u.id === id ? { ...u, ...updates } : u)))
    if (user && user.id === id) {
      const updatedUser = { ...user, ...updates }
      setUser(updatedUser)
      localStorage.setItem("meetbuddy_user", JSON.stringify(updatedUser))
    }
  }

  const deleteUser = (id: string) => {
    setUsers((prev) => prev.filter((u) => u.id !== id))
  }

  const deleteAccount = () => {
    logout()
    alert("Account deleted successfully")
  }

  const toggleDarkMode = () => {
    // Dark mode is now permanently enabled
    return
  }

  const updateNotificationSettings = (notifications: User["notifications"]) => {
    if (user) {
      const updatedUser = { ...user, notifications }
      setUser(updatedUser)
      localStorage.setItem("meetbuddy_user", JSON.stringify(updatedUser))
    }
  }

  const updatePreferences = (preferences: User["preferences"]) => {
    if (user) {
      const updatedUser = { ...user, preferences }
      setUser(updatedUser)
      localStorage.setItem("meetbuddy_user", JSON.stringify(updatedUser))
    }
  }

  const isAdmin = user?.role === "admin"

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        login,
        logout,
        loading,
        users,
        addUser,
        updateUser,
        deleteUser,
        deleteAccount,
        toggleDarkMode,
        updateNotificationSettings,
        updatePreferences,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider")
  }
  return context
}
