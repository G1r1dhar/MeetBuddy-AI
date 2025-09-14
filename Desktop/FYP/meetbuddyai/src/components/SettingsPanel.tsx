"use client"

import { useState } from "react"
import { Settings, Moon, Sun, User, Bell, Shield, AlertTriangle, Save, ArrowLeft, Check } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import Link from "next/link"

export default function SettingsPanel() {
  const { user, deleteAccount, toggleDarkMode, updateNotificationSettings, updatePreferences } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [saved, setSaved] = useState(false)

  const [notifications, setNotifications] = useState(
    user?.notifications || {
      meetingReminders: true,
      summaryReady: true,
      adminMessages: true,
    },
  )

  const [preferences, setPreferences] = useState(
    user?.preferences || {
      autoGenerateNotes: true,
      enableRealTimeTranscript: true,
      autoExportSummaries: false,
    },
  )

  const handleDeleteAccount = () => {
    if (deleteConfirmText === "DELETE") {
      deleteAccount()
    }
  }

  const handleSaveSettings = () => {
    updateNotificationSettings(notifications)
    updatePreferences(preferences)
    setSaved(true)
    setTimeout(() => setSaved(false), 2000)
  }

  const handleNotificationChange = (key: keyof typeof notifications, value: boolean) => {
    setNotifications((prev) => ({ ...prev, [key]: value }))
  }

  const handlePreferenceChange = (key: keyof typeof preferences, value: boolean) => {
    setPreferences((prev) => ({ ...prev, [key]: value }))
  }

  return (
    <div className={`min-h-screen pt-16 ${user?.darkMode ? "bg-black" : "bg-gray-50"}`}>
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div
          className={`rounded-xl border p-6 ${
            user?.darkMode
              ? "bg-gray-900 border-yellow-500/20 shadow-lg shadow-yellow-500/10"
              : "bg-white border-gray-200"
          }`}
        >
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center space-x-3">
              <Link
                href="/"
                className={`p-2 rounded-lg transition-colors ${
                  user?.darkMode
                    ? "text-gray-400 hover:text-yellow-400 hover:bg-yellow-500/10"
                    : "text-gray-400 hover:text-gray-600 hover:bg-gray-100"
                }`}
              >
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div className={`p-2 rounded-lg ${user?.darkMode ? "bg-yellow-500/20" : "bg-gray-100"}`}>
                <Settings className={`w-6 h-6 ${user?.darkMode ? "text-yellow-400" : "text-gray-600"}`} />
              </div>
              <h2 className={`text-xl font-semibold ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>
                Settings
              </h2>
            </div>
            <button
              onClick={handleSaveSettings}
              className={`flex items-center space-x-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                saved
                  ? user?.darkMode
                    ? "bg-green-500/20 text-green-400"
                    : "bg-green-100 text-green-700"
                  : user?.darkMode
                    ? "bg-yellow-500 text-black hover:bg-yellow-400"
                    : "bg-indigo-600 text-white hover:bg-indigo-700"
              }`}
            >
              {saved ? <Check className="w-4 h-4" /> : <Save className="w-4 h-4" />}
              <span>{saved ? "Saved!" : "Save Changes"}</span>
            </button>
          </div>

          <div className="space-y-8">
            {/* Theme Settings */}
            <div>
              <h3 className={`text-lg font-medium mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                Appearance
              </h3>
              <div
                className={`rounded-lg p-4 ${
                  user?.darkMode ? "bg-gray-800 border border-yellow-500/20" : "bg-gray-50"
                }`}
              >
                <h4 className={`font-medium mb-3 ${user?.darkMode ? "text-yellow-400" : "text-gray-900"}`}>Theme</h4>
                <div className="space-y-3">
                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="theme"
                      checked={!user?.darkMode}
                      onChange={() => user?.darkMode && toggleDarkMode()}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <div className="ml-3 flex items-center space-x-2">
                      <Sun className="w-4 h-4 text-yellow-500" />
                      <span className={`text-sm font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                        Light Mode
                      </span>
                    </div>
                  </label>

                  <label className="flex items-center cursor-pointer">
                    <input
                      type="radio"
                      name="theme"
                      checked={user?.darkMode || false}
                      onChange={() => !user?.darkMode && toggleDarkMode()}
                      className="text-yellow-500 focus:ring-yellow-500"
                    />
                    <div className="ml-3 flex items-center space-x-2">
                      <Moon className="w-4 h-4 text-yellow-500" />
                      <span className={`text-sm font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                        Dark Mode (Premium)
                      </span>
                    </div>
                  </label>
                </div>
                <p className={`text-xs mt-2 ${user?.darkMode ? "text-gray-400" : "text-gray-500"}`}>
                  Choose your preferred theme for MeetBuddy AI
                </p>
              </div>
            </div>

            {/* Notifications */}
            <div>
              <h3 className={`text-lg font-medium mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                Notifications
              </h3>
              <div className="space-y-4">
                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <Bell className={`w-5 h-5 ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`} />
                    <div>
                      <p className={`font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                        Meeting Reminders
                      </p>
                      <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        Get notified 15 minutes before Google Meet sessions
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.meetingReminders}
                    onChange={(e) => handleNotificationChange("meetingReminders", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <Shield className={`w-5 h-5 ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`} />
                    <div>
                      <p className={`font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                        AI Summary Ready
                      </p>
                      <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        Notify when meeting analysis is complete
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.summaryReady}
                    onChange={(e) => handleNotificationChange("summaryReady", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                </label>

                <label className="flex items-center justify-between cursor-pointer">
                  <div className="flex items-center space-x-3">
                    <Bell className={`w-5 h-5 ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`} />
                    <div>
                      <p className={`font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>System Updates</p>
                      <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>
                        Important announcements and feature updates
                      </p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={notifications.adminMessages}
                    onChange={(e) => handleNotificationChange("adminMessages", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                </label>
              </div>
            </div>

            {/* Google Meet Preferences */}
            <div>
              <h3 className={`text-lg font-medium mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>
                Google Meet Preferences
              </h3>
              <div className="space-y-4">
                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.autoGenerateNotes}
                    onChange={(e) => handlePreferenceChange("autoGenerateNotes", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                  <span className={`ml-2 text-sm ${user?.darkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Auto-generate meeting notes from Google Meet
                  </span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.enableRealTimeTranscript}
                    onChange={(e) => handlePreferenceChange("enableRealTimeTranscript", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                  <span className={`ml-2 text-sm ${user?.darkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Enable real-time transcript capture
                  </span>
                </label>

                <label className="flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={preferences.autoExportSummaries}
                    onChange={(e) => handlePreferenceChange("autoExportSummaries", e.target.checked)}
                    className={`rounded border-gray-300 focus:ring-2 ${
                      user?.darkMode ? "text-yellow-500 focus:ring-yellow-500" : "text-indigo-600 focus:ring-indigo-500"
                    }`}
                  />
                  <span className={`ml-2 text-sm ${user?.darkMode ? "text-gray-300" : "text-gray-700"}`}>
                    Auto-export summaries to email
                  </span>
                </label>
              </div>
            </div>

            {/* Account */}
            <div>
              <h3 className={`text-lg font-medium mb-4 ${user?.darkMode ? "text-white" : "text-gray-900"}`}>Account</h3>
              <div className="space-y-4">
                <div
                  className={`rounded-lg p-4 ${
                    user?.darkMode ? "bg-gray-800 border border-yellow-500/20" : "bg-gray-50"
                  }`}
                >
                  <div className="flex items-center space-x-3">
                    <User className={`w-5 h-5 ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`} />
                    <div>
                      <p className={`font-medium ${user?.darkMode ? "text-white" : "text-gray-900"}`}>{user?.name}</p>
                      <p className={`text-sm ${user?.darkMode ? "text-gray-400" : "text-gray-600"}`}>{user?.email}</p>
                      <p className={`text-xs capitalize ${user?.darkMode ? "text-gray-500" : "text-gray-500"}`}>
                        {user?.subscription} Plan • {user?.storageUsed}MB used
                      </p>
                    </div>
                  </div>
                </div>

                <div
                  className={`border rounded-lg p-4 ${
                    user?.darkMode ? "bg-red-900/20 border-red-500/30" : "bg-red-50 border-red-200"
                  }`}
                >
                  <div className="flex items-start space-x-3">
                    <AlertTriangle className={`w-5 h-5 mt-0.5 ${user?.darkMode ? "text-red-400" : "text-red-600"}`} />
                    <div className="flex-1">
                      <h4 className={`font-medium mb-2 ${user?.darkMode ? "text-red-400" : "text-red-900"}`}>
                        Delete Account
                      </h4>
                      <p className={`text-sm mb-4 ${user?.darkMode ? "text-red-300" : "text-red-700"}`}>
                        This action cannot be undone. All your Google Meet recordings, transcripts, notes, and data will
                        be permanently deleted.
                      </p>

                      {!showDeleteConfirm ? (
                        <button
                          onClick={() => setShowDeleteConfirm(true)}
                          className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                            user?.darkMode
                              ? "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                              : "bg-red-600 text-white hover:bg-red-700"
                          }`}
                        >
                          Delete Account
                        </button>
                      ) : (
                        <div className="space-y-3">
                          <div>
                            <label
                              className={`block text-sm font-medium mb-1 ${
                                user?.darkMode ? "text-red-400" : "text-red-900"
                              }`}
                            >
                              Type "DELETE" to confirm:
                            </label>
                            <input
                              type="text"
                              value={deleteConfirmText}
                              onChange={(e) => setDeleteConfirmText(e.target.value)}
                              className={`w-full px-3 py-2 border rounded-lg focus:ring-2 focus:border-transparent ${
                                user?.darkMode
                                  ? "bg-gray-800 border-red-500/30 text-white focus:ring-red-500"
                                  : "border-red-300 focus:ring-red-500"
                              }`}
                              placeholder="DELETE"
                            />
                          </div>
                          <div className="flex space-x-2">
                            <button
                              onClick={() => {
                                setShowDeleteConfirm(false)
                                setDeleteConfirmText("")
                              }}
                              className={`px-3 py-2 border rounded-lg text-sm transition-colors ${
                                user?.darkMode
                                  ? "border-gray-600 text-gray-300 hover:bg-gray-700"
                                  : "border-gray-300 text-gray-700 hover:bg-gray-50"
                              }`}
                            >
                              Cancel
                            </button>
                            <button
                              onClick={handleDeleteAccount}
                              disabled={deleteConfirmText !== "DELETE"}
                              className={`px-3 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                                user?.darkMode
                                  ? "bg-red-500 text-white hover:bg-red-600"
                                  : "bg-red-600 text-white hover:bg-red-700"
                              }`}
                            >
                              Permanently Delete
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
