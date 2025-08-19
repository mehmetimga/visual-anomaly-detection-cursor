import React, { createContext, useContext, useState, useEffect } from 'react'
import { authApi } from '@/api/client'
import { useToast } from '@/components/ui/use-toast'

interface User {
  user_id: string
  email: string
}

interface AuthContextType {
  user: User | null
  token: string | null
  login: (email: string, password: string) => Promise<void>
  register: (email: string, password: string) => Promise<void>
  logout: () => void
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [token, setToken] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const { toast } = useToast()

  useEffect(() => {
    const storedToken = localStorage.getItem('token')
    const storedUser = localStorage.getItem('user')
    
    if (storedToken && storedUser) {
      setToken(storedToken)
      setUser(JSON.parse(storedUser))
    }
    
    setIsLoading(false)
  }, [])

  const login = async (email: string, password: string) => {
    try {
      const response = await authApi.login(email, password)
      const { token, user_id } = response
      
      const userData = { user_id, email }
      
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      
      setToken(token)
      setUser(userData)
      
      toast({
        title: "Login successful",
        description: "Welcome back!",
      })
    } catch (error) {
      toast({
        title: "Login failed",
        description: "Invalid email or password",
        variant: "destructive",
      })
      throw error
    }
  }

  const register = async (email: string, password: string) => {
    try {
      const response = await authApi.register(email, password)
      const { token, user_id } = response
      
      const userData = { user_id, email }
      
      localStorage.setItem('token', token)
      localStorage.setItem('user', JSON.stringify(userData))
      
      setToken(token)
      setUser(userData)
      
      toast({
        title: "Registration successful",
        description: "Welcome to Visual Anomaly Detection!",
      })
    } catch (error) {
      toast({
        title: "Registration failed",
        description: "Please try again with a different email",
        variant: "destructive",
      })
      throw error
    }
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    setToken(null)
    setUser(null)
    
    toast({
      title: "Logged out",
      description: "See you next time!",
    })
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        login,
        register,
        logout,
        isLoading,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider')
  }
  return context
}
