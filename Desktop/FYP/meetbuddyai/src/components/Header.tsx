"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { Video, Settings, Bell, User, LogOut, Home, X } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"

interface Notification {
  id: string
  title: string
  message: string
  type: "meeting" | "system" | "reminder"
  timestamp: Date
  read: boolean
}

export default function Header() {
  const { user, logout, isAdmin } = useAuth()
  const pathname = usePathname()
  const [showNotifications, setShowNotifications] = useState(false)
  const [notifications, setNotifications] = useState<Notification[]>([
    {
      id: "1",
      title: "Welcome to MeetBuddy AI",
      message: "Start by scheduling your first Google Meet session for AI-powered analysis.",
      type: "system",
      timestamp: new Date(),
      read: false,
    },
  ])

  const unreadCount = notifications.filter((n) => !n.read).length

  const markAsRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
  }

  const markAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })))
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "meeting":
        return "📅"
      case "reminder":
        return "⏰"
      case "system":
        return "🔔"
      default:
        return "📢"
    }
  }

  return (
    <header
      className={`fixed top-0 left-0 right-0 z-50 ${
        user?.darkMode
          ? "bg-gray-900 border-yellow-500/20 shadow-lg shadow-yellow-500/10"
          : "bg-white border-gray-200 shadow-sm"
      } border-b`}
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          <div className="flex items-center">
            <Link href="/" className="flex items-center space-x-2">
              <div
                className={`p-2 rounded-lg ${
                  user?.darkMode ? "bg-yellow-500/20 text-yellow-400" : "bg-indigo-100 text-indigo-600"
                }`}
              >
                <Video className="h-6 w-6" />
              </div>
              <div>
                <span className={`text-xl font-bold ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>
                  MeetBuddy
                </span>
                <span className={`text-xl font-bold ${user?.darkMode ? "text-white" : "text-indigo-600"}`}>AI</span>
              </div>
            </Link>
          </div>

          <div className="flex items-center space-x-4">
            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setShowNotifications(!showNotifications)}
                className={`relative p-2 rounded-lg transition-colors ${
                  user?.darkMode
                    ? "text-gray-300 hover:text-yellow-400 hover:bg-yellow-500/10"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <div
                    className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-xs font-bold ${
                      user?.darkMode ? "bg-yellow-500 text-black" : "bg-red-500 text-white"
                    }`}
                  >
                    {unreadCount}
                  </div>
                )}
              </button>

              {showNotifications && (
                <div
                  className={`absolute right-0 top-full mt-2 w-80 rounded-xl shadow-lg border z-50 ${
                    user?.darkMode
                      ? "bg-gray-800 border-yellow-500/20 shadow-yellow-500/10"
                      : "bg-white border-gray-200"
                  }`}
                >
                  <div className={`p-4 border-b ${user?.darkMode ? "border-yellow-500/20" : "border-gray-200"}`}>
                    <div className="flex items-center justify-between">
                      <h3 className={`font-semibold ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>
                        Notifications
                      </h3>
                      <div className="flex items-center space-x-2">
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllAsRead}
                            className={`text-xs transition-colors ${
                              user?.darkMode
                                ? "text-yellow-400 hover:text-yellow-300"
                                : "text-indigo-600 hover:text-indigo-700"
                            }`}
                          >
                            Mark all read
                          </button>
                        )}
                        <button
                          onClick={() => setShowNotifications(false)}
                          className={`transition-colors ${
                            user?.darkMode ? "text-gray-400 hover:text-white" : "text-gray-400 hover:text-gray-600"
                          }`}
                        >
                          <X className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>

                  <div className="max-h-96 overflow-y-auto">
                    {notifications.length === 0 ? (
                      <div className="p-6 text-center">
                        <Bell
                          className={`w-8 h-8 mx-auto mb-2 ${user?.darkMode ? "text-gray-600" : "text-gray-300"}`}
                        />
                        <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-500"}`}>
                          No notifications yet
                        </p>
                      </div>
                    ) : (
                      notifications.map((notification) => (
                        <div
                          key={notification.id}
                          className={`p-4 border-b cursor-pointer transition-colors ${
                            user?.darkMode
                              ? `border-yellow-500/10 ${notification.read ? "hover:bg-gray-700/50" : "bg-yellow-500/5 hover:bg-yellow-500/10"}`
                              : `border-gray-100 ${notification.read ? "hover:bg-gray-50" : "bg-blue-50 hover:bg-blue-100"}`
                          }`}
                          onClick={() => markAsRead(notification.id)}
                        >
                          <div className="flex items-start space-x-3">
                            <span className="text-lg">{getTypeIcon(notification.type)}</span>
                            <div className="flex-1 min-w-0">
                              <h4
                                className={`text-sm font-medium ${
                                  user?.darkMode
                                    ? notification.read
                                      ? "text-gray-300"
                                      : "text-yellow-400"
                                    : notification.read
                                      ? "text-gray-700"
                                      : "text-gray-900"
                                }`}
                              >
                                {notification.title}
                              </h4>
                              <p
                                className={`text-sm mt-1 ${
                                  user?.darkMode
                                    ? notification.read
                                      ? "text-gray-500"
                                      : "text-gray-300"
                                    : notification.read
                                      ? "text-gray-500"
                                      : "text-gray-700"
                                }`}
                              >
                                {notification.message}
                              </p>
                              <p className={`text-xs mt-1 ${user?.darkMode ? "text-gray-600" : "text-gray-400"}`}>
                                {notification.timestamp.toLocaleTimeString()}
                              </p>
                            </div>
                            {!notification.read && (
                              <div
                                className={`w-2 h-2 rounded-full mt-2 ${
                                  user?.darkMode ? "bg-yellow-500" : "bg-blue-500"
                                }`}
                              />
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/"
              className={`p-2 rounded-lg transition-colors ${
                pathname === "/"
                  ? user?.darkMode
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-indigo-100 text-indigo-600"
                  : user?.darkMode
                    ? "text-gray-300 hover:text-yellow-400 hover:bg-yellow-500/10"
                    : "text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              }`}
              title="Dashboard"
            >
              <Home className="h-5 w-5" />
            </Link>

            {isAdmin && (
              <Link
                href="/admin"
                className={`p-2 rounded-lg transition-colors ${
                  pathname === "/admin"
                    ? user?.darkMode
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-purple-100 text-purple-600"
                    : user?.darkMode
                      ? "text-gray-300 hover:text-yellow-400 hover:bg-yellow-500/10"
                      : "text-gray-400 hover:text-gray-500 hover:bg-gray-100"
                }`}
                title="Admin Panel"
              >
                <User className="h-5 w-5" />
              </Link>
            )}

            <Link
              href="/settings"
              className={`p-2 rounded-lg transition-colors ${
                pathname === "/settings"
                  ? user?.darkMode
                    ? "bg-yellow-500/20 text-yellow-400"
                    : "bg-gray-100 text-gray-900"
                  : user?.darkMode
                    ? "text-gray-300 hover:text-yellow-400 hover:bg-yellow-500/10"
                    : "text-gray-400 hover:text-gray-500 hover:bg-gray-100"
              }`}
              title="Settings"
            >
              <Settings className="h-5 w-5" />
            </Link>

            <div
              className={`flex items-center space-x-2 px-3 py-2 rounded-lg ${
                user?.darkMode ? "bg-gray-800 border border-yellow-500/20" : "bg-gray-100"
              }`}
            >
              <span className={`text-sm ${user?.darkMode ? "text-gray-300" : "text-gray-700"}`}>{user?.name}</span>
              <span
                className={`text-xs px-2 py-1 rounded-full ${
                  user?.role === "admin"
                    ? user?.darkMode
                      ? "bg-yellow-500/20 text-yellow-400"
                      : "bg-purple-100 text-purple-800"
                    : user?.darkMode
                      ? "bg-gray-700 text-gray-300"
                      : "bg-blue-100 text-blue-800"
                }`}
              >
                {user?.role}
              </span>
            </div>

            <button
              onClick={logout}
              className={`p-2 rounded-lg transition-colors ${
                user?.darkMode
                  ? "text-gray-300 hover:text-red-400 hover:bg-red-500/10"
                  : "text-gray-400 hover:text-red-500 hover:bg-red-50"
              }`}
              title="Logout"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </div>
      </div>
    </header>
  )
}
