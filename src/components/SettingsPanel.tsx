import { useState } from "react"
import { Settings, Moon, Sun, User, AlertTriangle, ArrowLeft, Monitor } from "lucide-react"
import { useAuth } from "../contexts/AuthContext"
import { Link } from "react-router-dom"
import { motion, AnimatePresence } from "framer-motion"

export default function SettingsPanel() {
  const { user, deleteAccount, toggleDarkMode } = useAuth()
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [deleteConfirmText, setDeleteConfirmText] = useState("")
  const [activeTab, setActiveTab] = useState('appearance')



  const handleDeleteAccount = () => {
    if (deleteConfirmText === "DELETE") {
      deleteAccount()
    }
  }



  const containerVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { opacity: 1, y: 0, transition: { duration: 0.4, staggerChildren: 0.1 } }
  }

  const itemVariants = {
    hidden: { opacity: 0, x: -20 },
    visible: { opacity: 1, x: 0 }
  }

  return (
    <motion.div 
      initial="hidden" animate="visible" variants={containerVariants}
      className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 pb-12 transition-colors duration-300"
    >
      
      {/* Header Area */}
      <motion.div variants={itemVariants} className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div className="flex items-center space-x-4">
          <Link
            to="/"
            className="p-2.5 rounded-xl transition-all text-theme-icon hover:text-theme-accent hover:bg-theme-accent/10 border border-transparent hover:border-theme-accent/20"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          <div className="p-3 rounded-2xl bg-gradient-to-br from-theme-accent/20 to-yellow-600/20 border border-theme-accent/30 shadow-[0_0_15px_rgba(255,193,7,0.15)]">
            <Settings className="w-7 h-7 text-theme-accent" />
          </div>
          <div>
            <h2 className="text-3xl font-bold tracking-tight text-theme-text">Settings</h2>
            <p className="text-theme-icon mt-1">Manage your account preferences and app behavior.</p>
          </div>
        </div>
      </motion.div>

      <div className="flex flex-col lg:flex-row gap-8">
        
        {/* Sidebar Nav */}
        <motion.div variants={itemVariants} className="lg:w-64 flex-shrink-0">
          <div className="sticky top-32 space-y-2 bg-theme-card/50 p-3 rounded-2xl border border-theme-card-border backdrop-blur-xl">
            {[
              { id: 'appearance', icon: Monitor, label: 'Appearance' },
              { id: 'account', icon: User, label: 'Account Data' },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`w-full flex items-center space-x-3 px-4 py-3 rounded-xl transition-all font-medium text-left ${
                  activeTab === tab.id 
                    ? "bg-theme-accent text-black shadow-md" 
                    : "text-theme-icon hover:bg-theme-bg hover:text-theme-text"
                }`}
              >
                <tab.icon className={`w-5 h-5 ${activeTab === tab.id ? "text-black" : ""}`} />
                <span>{tab.label}</span>
              </button>
            ))}
          </div>
        </motion.div>

        {/* Content Area */}
        <div className="flex-1">
          <AnimatePresence mode="wait">
            <motion.div
              key={activeTab}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              transition={{ duration: 0.2 }}
              className="bg-theme-card/80 backdrop-blur-xl rounded-3xl border border-theme-card-border shadow-xl overflow-hidden min-h-[500px]"
            >
              
              {activeTab === 'appearance' && (
                <div className="p-8">
                  <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-theme-card-border/50">
                    <Monitor className="w-6 h-6 text-theme-accent" />
                    <div>
                      <h3 className="text-2xl font-bold text-theme-text">Appearance</h3>
                      <p className="text-theme-icon text-sm">Customize how MeetBuddy AI looks on your device.</p>
                    </div>
                  </div>
                  
                  <div className="space-y-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* Light Mode */}
                      <label className={`relative flex flex-col items-center p-6 border-2 rounded-2xl cursor-pointer transition-all ${!user?.darkMode ? "border-theme-accent bg-theme-accent/5" : "border-theme-card-border bg-theme-bg hover:border-theme-accent/50"}`}>
                        <input type="radio" name="theme" checked={!user?.darkMode} onChange={() => user?.darkMode && toggleDarkMode()} className="sr-only" />
                        <div className="p-4 rounded-full bg-yellow-100 text-amber-500 mb-4 shadow-inner">
                          <Sun className="w-8 h-8" />
                        </div>
                        <span className="font-bold text-theme-text text-lg">Light Mode</span>
                        <p className="text-sm text-theme-icon mt-1 text-center">Clean and bright for daytime use.</p>
                        {!user?.darkMode && <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-theme-accent shadow-[0_0_10px_var(--accent-yellow)]" />}
                      </label>

                      {/* Dark Mode */}
                      <label className={`relative flex flex-col items-center p-6 border-2 rounded-2xl cursor-pointer transition-all ${user?.darkMode ? "border-theme-accent bg-theme-accent/5" : "border-theme-card-border bg-theme-bg hover:border-theme-accent/50"}`}>
                        <input type="radio" name="theme" checked={user?.darkMode || false} onChange={() => !user?.darkMode && toggleDarkMode()} className="sr-only" />
                        <div className="p-4 rounded-full bg-gray-800 text-yellow-400 mb-4 shadow-inner">
                          <Moon className="w-8 h-8" />
                        </div>
                        <span className="font-bold text-theme-text text-lg">Dark Mode</span>
                        <p className="text-sm text-theme-icon mt-1 text-center">Sleek and easy on the eyes.</p>
                        {user?.darkMode && <div className="absolute top-4 right-4 w-3 h-3 rounded-full bg-theme-accent shadow-[0_0_10px_var(--accent-yellow)]" />}
                      </label>
                    </div>
                  </div>
                </div>
              )}



              {activeTab === 'account' && (
                <div className="p-8">
                  <div className="flex items-center space-x-3 mb-8 pb-4 border-b border-theme-card-border/50">
                    <User className="w-6 h-6 text-theme-accent" />
                    <div>
                      <h3 className="text-2xl font-bold text-theme-text">Account Data</h3>
                      <p className="text-theme-icon text-sm">Manage your profile, data, and security.</p>
                    </div>
                  </div>

                  <div className="space-y-6">
                    <div className="rounded-2xl p-6 bg-gradient-to-br from-theme-bg to-theme-card border border-theme-card-border flex flex-col md:flex-row items-center md:items-start space-y-4 md:space-y-0 md:space-x-6">
                      <div className="w-20 h-20 rounded-2xl bg-gradient-to-tr from-theme-accent to-yellow-600 flex items-center justify-center text-3xl font-black text-black shadow-lg shadow-theme-accent/20">
                        {user?.name?.charAt(0).toUpperCase()}
                      </div>
                      <div className="flex-1 text-center md:text-left pt-2">
                        <h4 className="text-2xl font-bold text-theme-text">{user?.name}</h4>
                        <p className="text-theme-icon mb-2">{user?.email}</p>
                      </div>
                    </div>

                    <div className="border border-red-500/20 rounded-2xl p-6 bg-red-500/5 relative overflow-hidden">
                      <div className="absolute top-0 left-0 w-1 h-full bg-red-500" />
                      
                      <div className="flex items-start space-x-4">
                        <div className="p-3 bg-red-500/10 rounded-xl text-red-500">
                          <AlertTriangle className="w-6 h-6" />
                        </div>
                        <div className="flex-1">
                          <h4 className="text-xl font-bold text-red-500 dark:text-red-400 mb-2">Danger Zone</h4>
                          <p className="text-theme-text opacity-80 mb-6">
                            Deleting your account is permanent. All associated meeting data, transcripts, and mind maps will be thoroughly wiped from our servers.
                          </p>

                          {!showDeleteConfirm ? (
                            <button
                              onClick={() => setShowDeleteConfirm(true)}
                              className="px-6 py-2.5 rounded-xl font-bold transition-all bg-red-500/10 text-red-500 hover:bg-red-500 hover:text-white border border-red-500/30 hover:shadow-[0_0_15px_rgba(239,68,68,0.4)]"
                            >
                              Delete Account
                            </button>
                          ) : (
                            <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} className="space-y-4 p-5 bg-red-500/10 border border-red-500/30 rounded-xl">
                              <div>
                                <label className="block text-sm font-bold mb-2 text-red-500 dark:text-red-400">
                                  Type "DELETE" to confirm your intent:
                                </label>
                                <input
                                  type="text"
                                  value={deleteConfirmText}
                                  onChange={(e) => setDeleteConfirmText(e.target.value)}
                                  className="w-full px-4 py-3 border-2 rounded-xl focus:ring-4 focus:border-red-500 outline-none transition-all bg-theme-bg/50 border-red-500/30 text-theme-text focus:ring-red-500/20 font-mono tracking-widest text-center uppercase"
                                  placeholder="DELETE"
                                />
                              </div>
                              <div className="flex flex-col sm:flex-row space-y-2 sm:space-y-0 sm:space-x-3 pt-2">
                                <button
                                  onClick={handleDeleteAccount}
                                  disabled={deleteConfirmText !== "DELETE"}
                                  className="flex-1 py-3 px-4 rounded-xl font-bold transition-all disabled:opacity-50 disabled:cursor-not-allowed bg-red-500 text-white hover:bg-red-600 shadow-md shadow-red-500/20 flex justify-center"
                                >
                                  Permanently Delete
                                </button>
                                <button
                                  onClick={() => {
                                    setShowDeleteConfirm(false)
                                    setDeleteConfirmText("")
                                  }}
                                  className="flex-1 py-3 px-4 border-2 rounded-xl font-bold transition-all border-theme-card-border text-theme-icon hover:bg-theme-bg hover:text-theme-text"
                                >
                                  Cancel Request
                                </button>
                              </div>
                            </motion.div>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </motion.div>
  )
}
