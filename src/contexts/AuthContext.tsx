import type React from "react"
import { createContext, useContext, useState, useEffect, useRef } from "react"
import { authService, type User, type LoginRequest, type UpdateUserRequest, type RegisterRequest } from "../services/authService"
import { apiClient } from "../services/apiClient"

// User interface is now imported from authService

interface AuthContextType {
  user: User | null
  isAdmin: boolean
  login: (email: string, password: string) => Promise<void>
  register: (userData: RegisterRequest) => Promise<void>
  logout: () => void
  loading: boolean
  error: string | null
  clearError: () => void
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
  const [error, setError] = useState<string | null>(null)
  const initializationAttempted = useRef(false)

  useEffect(() => {
    const initializeAuth = async () => {
      // Prevent multiple initialization attempts (React Strict Mode)
      if (initializationAttempted.current) return
      initializationAttempted.current = true

      try {
        setLoading(true)

        // Check if user is authenticated
        if (authService.isAuthenticated()) {
          try {
            // Try to get current user from API
            const currentUser = await authService.getCurrentUser()
            setUser(currentUser)

            // Load all users if admin (for admin panel)
            if (currentUser.role === 'admin') {
              try {
                const allUsers = await authService.getAllUsers()
                setUsers(allUsers)
              } catch (error) {
                console.warn('Failed to load all users:', error)
                // Continue without all users data
              }
            }
          } catch (error) {
            console.warn('Token invalid or expired, clearing auth:', error)
            // Clear invalid token
            apiClient.clearToken()
            setUser(null)
            setUsers([])
          }
        } else {
          // No token, user is not authenticated
          setUser(null)
          setUsers([])
        }
      } catch (error) {
        console.error('Failed to initialize auth:', error)
        // Clear invalid token (but don't make API call to avoid rate limiting)
        apiClient.clearToken()
        setUser(null)
        setUsers([])
      } finally {
        setLoading(false)
        // Ensure starting theme is based on user preference or dark
        document.documentElement.classList.add('dark')
      }
    }

    initializeAuth()
  }, [])

  const login = async (email: string, password: string) => {
    try {
      setLoading(true)
      setError(null)

      const loginData: LoginRequest = { email, password }
      const response = await authService.login(loginData)

      setUser(response.user)

      // Load all users if admin
      if (response.user.role === 'admin') {
        try {
          const allUsers = await authService.getAllUsers()
          setUsers(allUsers)
        } catch (error) {
          console.warn('Failed to load all users after login:', error)
        }
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Login failed"
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const register = async (userData: RegisterRequest) => {
    try {
      setLoading(true)
      setError(null)

      const response = await authService.register(userData)

      setUser(response.user)

    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : "Registration failed"
      setError(errorMessage)
      throw err
    } finally {
      setLoading(false)
    }
  }

  const logout = async () => {
    try {
      await authService.logout()
    } catch (error) {
      console.warn('Logout API call failed:', error)
    } finally {
      setUser(null)
      setUsers([])
      setError(null)
    }
  }

  const clearError = () => {
    setError(null)
  }

  const addUser = async (userData: Omit<User, "id" | "createdAt" | "lastLogin">) => {
    try {
      const newUser = await authService.createUser(userData)
      setUsers((prev) => [...prev, newUser])
    } catch (error) {
      console.error('Failed to add user:', error)
      throw error
    }
  }

  const updateUser = async (id: string, updates: Partial<User>) => {
    try {
      if (user && user.id === id) {
        // Update current user
        const updateData: UpdateUserRequest = {
          name: updates.name,
          avatar: updates.avatar,
          notifications: updates.notifications,
          preferences: updates.preferences,
        }
        const updatedUser = await authService.updateUser(updateData)
        setUser(updatedUser)

        // Update in users list if present
        setUsers((prev) => prev.map((u) => (u.id === id ? updatedUser : u)))
      } else {
        // Admin updating another user
        const updatedUser = await authService.updateUserAsAdmin(id, updates)
        setUsers((prev) => prev.map((u) => (u.id === id ? updatedUser : u)))
      }
    } catch (error) {
      console.error('Failed to update user:', error)
      throw error
    }
  }

  const deleteUser = async (id: string) => {
    try {
      await authService.deleteUserAsAdmin(id)
      setUsers((prev) => prev.filter((u) => u.id !== id))
    } catch (error) {
      console.error('Failed to delete user:', error)
      throw error
    }
  }

  const deleteAccount = async () => {
    try {
      await authService.deleteAccount()
      setUser(null)
      setUsers([])
      setError(null)
    } catch (error) {
      console.error('Failed to delete account:', error)
      throw error
    }
  }

  const toggleDarkMode = () => {
    if (user) {
      const newDarkMode = !user.darkMode
      setUser({ ...user, darkMode: newDarkMode })
    }
  }

  useEffect(() => {
    if (user?.darkMode !== false) {
      document.documentElement.classList.add('dark')
    } else {
      document.documentElement.classList.remove('dark')
    }
  }, [user?.darkMode])

  const updateNotificationSettings = async (notifications: User["notifications"]) => {
    if (user) {
      try {
        const updatedUser = await authService.updateUser({ notifications })
        setUser(updatedUser)
      } catch (error) {
        console.error('Failed to update notification settings:', error)
        throw error
      }
    }
  }

  const updatePreferences = async (preferences: User["preferences"]) => {
    if (user) {
      try {
        const updatedUser = await authService.updateUser({ preferences })
        setUser(updatedUser)
      } catch (error) {
        console.error('Failed to update preferences:', error)
        throw error
      }
    }
  }

  const isAdmin = user?.role === "admin"

  return (
    <AuthContext.Provider
      value={{
        user,
        isAdmin,
        login,
        register,
        logout,
        loading,
        error,
        clearError,
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
