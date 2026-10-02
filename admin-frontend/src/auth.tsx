import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { apiError, apiFetch, clearToken, readToken, saveToken } from './api'
import type { AdminInfo, LoginResponse } from './types'

export type AuthStatus = 'checking' | 'authed' | 'guest'

interface AdminAuthContextValue {
  admin: AdminInfo | null
  status: AuthStatus
  login(email: string, password: string): Promise<void>
  logout(): void
}

const AdminAuthContext = createContext<AdminAuthContextValue | null>(null)

export function AdminAuthProvider({ children }: { children: ReactNode }) {
  /* 无 token 直接从未登录态起步（惰性初始化，避免 effect 内同步 setState） */
  const [admin, setAdmin] = useState<AdminInfo | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    readToken() === null ? 'guest' : 'checking',
  )

  /* 刷新页面时凭已有 token 恢复登录态；失效则清掉回到未登录
     （token 无效时 apiFetch 已清 token 并跳 /login，这里兜底置 guest） */
  useEffect(() => {
    const token = readToken()
    if (!token) return
    apiFetch<AdminInfo>('/api/me')
      .then(data => {
        setAdmin(data)
        setStatus('authed')
      })
      .catch(() => {
        clearToken()
        setStatus('guest')
      })
  }, [])

  async function login(email: string, password: string): Promise<void> {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    })
    if (!res.ok) throw await apiError(res)
    const data = (await res.json()) as LoginResponse
    saveToken(data.token)
    setAdmin({ id: data.id, email: data.email })
    setStatus('authed')
  }

  const value: AdminAuthContextValue = {
    admin,
    status,
    login,
    logout() {
      clearToken()
      setAdmin(null)
      setStatus('guest')
    },
  }

  return (
    <AdminAuthContext.Provider value={value}>
      {children}
    </AdminAuthContext.Provider>
  )
}

export function useAdminAuth(): AdminAuthContextValue {
  const ctx = useContext(AdminAuthContext)
  if (ctx === null) {
    throw new Error('useAdminAuth must be used within AdminAuthProvider')
  }
  return ctx
}
