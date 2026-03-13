import { useState } from "react"
import { Link, useLocation } from "react-router-dom"
import { Video, Settings, Bell, User, LogOut, Home, X, Sparkles } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { motion, AnimatePresence } from "framer-motion"

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
  const location = useLocation()
  const pathname = location.pathname
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

  const iconVariants = {
    hover: { scale: 1.1, y: -2 },
    tap: { scale: 0.95 }
  }

  const navItemClass = (path: string) => `
    relative p-2.5 rounded-xl transition-all duration-300 flex items-center justify-center
    ${pathname === path 
      ? "bg-theme-accent text-black shadow-[0_4px_20px_rgba(255,193,7,0.3)]" 
      : "text-theme-icon hover:text-theme-accent hover:bg-theme-accent/10"
    }
  `

  return (
    <header className="fixed top-4 left-4 right-4 z-50 flex justify-center pointer-events-none">
      <motion.div 
        initial={{ y: -50, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 300, damping: 25 }}
        className="w-full max-w-7xl mx-auto pointer-events-auto"
      >
        <div className="bg-theme-card/85 backdrop-blur-xl border border-theme-card-border/50 shadow-lg dark:shadow-theme-accent/5 rounded-2xl px-4 sm:px-6 lg:px-8 transition-all duration-300">
          <div className="flex justify-between items-center h-16">
            
            {/* Logo area */}
            <div className="flex items-center">
              <Link to="/" className="flex items-center space-x-3 group outline-none">
                <motion.div 
                  whileHover={{ rotate: 15, scale: 1.1 }}
                  whileTap={{ scale: 0.9 }}
                  className="p-2.5 rounded-xl bg-gradient-to-br from-theme-accent to-yellow-600 text-black shadow-[0_0_15px_rgba(255,193,7,0.4)]"
                >
                  <Video className="h-5 w-5" />
                </motion.div>
                <div className="flex items-center overflow-hidden">
                  <span className="text-xl font-bold text-theme-text tracking-tight group-hover:bg-clip-text transition-colors">
                    MeetBuddy
                  </span>
                  <span className="text-xl font-black text-theme-accent ml-0.5">
                    AI
                  </span>
                  <motion.div
                    animate={{ rotate: [0, 15, -15, 0] }}
                    transition={{ repeat: Infinity, duration: 2, ease: "easeInOut", repeatDelay: 3 }}
                  >
                    <Sparkles className="w-4 h-4 ml-1 text-theme-accent opacity-80" />
                  </motion.div>
                </div>
              </Link>
            </div>

            {/* Navigation and Actions */}
            <div className="flex items-center space-x-2 sm:space-x-3">
              
              {/* Home */}
              <Link to="/" title="Dashboard" className="outline-none">
                <motion.div variants={iconVariants} whileHover="hover" whileTap="tap" className={navItemClass("/")}>
                  <Home className="h-5 w-5" />
                  {pathname === "/" && (
                    <motion.div layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-theme-accent -z-10" />
                  )}
                </motion.div>
              </Link>

              {/* Admin */}
              {isAdmin && (
                <Link to="/admin" title="Admin Panel" className="outline-none">
                  <motion.div variants={iconVariants} whileHover="hover" whileTap="tap" className={navItemClass("/admin")}>
                    <User className="h-5 w-5" />
                    {pathname === "/admin" && (
                      <motion.div layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-theme-accent -z-10" />
                    )}
                  </motion.div>
                </Link>
              )}

              {/* Settings */}
              <Link to="/settings" title="Settings" className="outline-none">
                <motion.div variants={iconVariants} whileHover="hover" whileTap="tap" className={navItemClass("/settings")}>
                  <Settings className="h-5 w-5" />
                  {pathname === "/settings" && (
                    <motion.div layoutId="nav-pill" className="absolute inset-0 rounded-xl bg-theme-accent -z-10" />
                  )}
                </motion.div>
              </Link>

              <div className="w-px h-8 bg-theme-card-border/60 mx-1" />

              {/* Notifications */}
              <div className="relative">
                <motion.button
                  variants={iconVariants}
                  whileHover="hover"
                  whileTap="tap"
                  onClick={() => setShowNotifications(!showNotifications)}
                  className={`relative p-2.5 rounded-xl transition-all outline-none flex items-center justify-center ${
                    showNotifications ? "bg-theme-accent/15 text-theme-accent" : "text-theme-icon hover:text-theme-accent hover:bg-theme-accent/10"
                  }`}
                >
                  <Bell className="h-5 w-5" />
                  <AnimatePresence>
                    {unreadCount > 0 && (
                      <motion.div 
                        initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }}
                        className="absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-black bg-theme-accent text-black shadow-[0_0_12px_rgba(255,193,7,0.6)] border-2 border-theme-bg"
                      >
                        {unreadCount}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.button>

                <AnimatePresence>
                  {showNotifications && (
                    <motion.div 
                      initial={{ opacity: 0, y: 10, scale: 0.95 }}
                      animate={{ opacity: 1, y: 0, scale: 1 }}
                      exit={{ opacity: 0, y: 10, scale: 0.95 }}
                      transition={{ duration: 0.2 }}
                      className="absolute right-0 top-full mt-4 w-80 sm:w-96 rounded-2xl shadow-2xl border z-50 bg-theme-card/95 backdrop-blur-xl border-theme-card-border dark:shadow-theme-accent/10 origin-top-right overflow-hidden"
                    >
                      <div className="p-4 border-b border-theme-card-border bg-theme-bg/50">
                        <div className="flex items-center justify-between">
                          <h3 className="font-bold text-theme-text flex items-center gap-2">
                            <Bell className="w-4 h-4 text-theme-accent" />
                            Notifications
                          </h3>
                          <div className="flex items-center space-x-3">
                            {unreadCount > 0 && (
                              <button
                                onClick={markAllAsRead}
                                className="text-xs font-semibold transition-colors text-theme-accent hover:text-yellow-400"
                              >
                                Mark all read
                              </button>
                            )}
                            <button
                              onClick={() => setShowNotifications(false)}
                              className="p-1 rounded-md transition-colors text-theme-icon hover:bg-theme-card-border hover:text-theme-text"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </div>

                      <div className="max-h-[60vh] overflow-y-auto scrollbar-thin scrollbar-thumb-theme-card-border scrollbar-track-transparent">
                        {notifications.length === 0 ? (
                          <div className="p-8 text-center flex flex-col items-center justify-center">
                            <div className="w-16 h-16 rounded-full bg-theme-accent/10 flex items-center justify-center mb-4">
                              <Bell className="w-8 h-8 text-theme-accent/50" />
                            </div>
                            <p className="text-sm font-medium text-theme-text opacity-70">
                              You're all caught up!
                            </p>
                            <p className="text-xs mt-1 text-theme-text opacity-50">
                              No new notifications at the moment.
                            </p>
                          </div>
                        ) : (
                          notifications.map((notification) => (
                            <motion.div
                              layout
                              key={notification.id}
                              className={`p-4 border-b border-theme-card-border/50 cursor-pointer transition-colors group ${
                                notification.read
                                  ? "hover:bg-theme-bg/60"
                                  : "bg-theme-accent/5 hover:bg-theme-accent/10"
                              }`}
                              onClick={() => markAsRead(notification.id)}
                            >
                              <div className="flex items-start space-x-4">
                                <div className={`p-2 rounded-xl transition-colors ${
                                  notification.read ? "bg-theme-bg" : "bg-theme-card shadow-sm"
                                }`}>
                                  <span className="text-xl leading-none">{getTypeIcon(notification.type)}</span>
                                </div>
                                <div className="flex-1 min-w-0 pt-0.5">
                                  <h4
                                    className={`text-sm font-semibold truncate ${
                                      notification.read ? "text-theme-text opacity-70" : "text-theme-accent"
                                    }`}
                                  >
                                    {notification.title}
                                  </h4>
                                  <p
                                    className={`text-sm mt-1 leading-snug line-clamp-2 ${
                                      notification.read ? "text-theme-text opacity-60" : "text-theme-text opacity-90"
                                    }`}
                                  >
                                    {notification.message}
                                  </p>
                                  <p className="text-xs mt-2 font-medium text-theme-text opacity-40 group-hover:opacity-60 transition-opacity">
                                    {notification.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                  </p>
                                </div>
                                {!notification.read && (
                                  <div className="w-2.5 h-2.5 rounded-full mt-1.5 bg-theme-accent shadow-[0_0_8px_var(--accent-yellow)] flex-shrink-0" />
                                )}
                              </div>
                            </motion.div>
                          ))
                        )}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* User Profile */}
              <div className="hidden sm:flex items-center space-x-3 pl-2 py-1.5 pr-1.5 rounded-full bg-theme-bg/50 border border-theme-card-border/50 backdrop-blur-sm">
                <span className="text-sm font-medium text-theme-text pl-2 max-w-[100px] truncate">{user?.name}</span>
                <span className="text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-gradient-to-r from-theme-accent to-yellow-600 text-black font-black shadow-sm">
                  {user?.role === "admin" ? "Admin" : "Pro"}
                </span>
              </div>

              {/* Logout */}
              <motion.button
                variants={iconVariants}
                whileHover="hover"
                whileTap="tap"
                onClick={logout}
                className="p-2.5 ml-1 rounded-xl transition-all text-theme-icon hover:text-red-500 hover:bg-red-500/15"
                title="Logout"
              >
                <LogOut className="h-5 w-5" />
              </motion.button>
            </div>
            
          </div>
        </div>
      </motion.div>
    </header>
  )
}
