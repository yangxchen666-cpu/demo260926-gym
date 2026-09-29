import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import type { AuthResponse, AuthUser } from './types'

/** 「记住登录状态」勾选 → localStorage（30 天免登录），否则 sessionStorage（关浏览器失效） */
const TOKEN_KEY = 'demo001-token'

export type AuthStatus = 'checking' | 'authed' | 'guest'

function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY) ?? sessionStorage.getItem(TOKEN_KEY)
}

function saveToken(token: string, remember: boolean): void {
  clearToken()
  ;(remember ? localStorage : sessionStorage).setItem(TOKEN_KEY, token)
}

function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
  sessionStorage.removeItem(TOKEN_KEY)
}

/** 服务端错误 → 中文提示：字符串 detail 原样，pydantic 数组 detail 给通用文案 */
async function apiError(res: Response): Promise<Error> {
  let message = `请求失败（${res.status}），请稍后重试`
  try {
    const data: unknown = await res.json()
    if (typeof data === 'object' && data !== null && 'detail' in data) {
      const { detail } = data as { detail: unknown }
      if (typeof detail === 'string') message = detail
      else if (Array.isArray(detail)) message = '输入格式有误，请检查'
    }
  } catch {
    /* 非 JSON 响应，保留默认文案 */
  }
  return new Error(message)
}

interface AuthContextValue {
  user: AuthUser | null
  status: AuthStatus
  login(
    email: string,
    password: string,
    captchaId: string,
    captchaCode: string,
    remember: boolean,
  ): Promise<void>
  register(
    username: string,
    email: string,
    password: string,
    confirmPassword: string,
  ): Promise<void>
  logout(): void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  /* 无 token 直接从访客态起步（惰性初始化，避免 effect 内同步 setState） */
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>(() =>
    readToken() === null ? 'guest' : 'checking',
  )

  /* 刷新页面时凭已有 token 恢复登录态；失效则清掉回到访客态 */
  useEffect(() => {
    const token = readToken()
    if (!token) return
    fetch('/api/me', { headers: { Authorization: `Bearer ${token}` } })
      .then(async res => {
        if (!res.ok) throw new Error(String(res.status))
        return (await res.json()) as Promise<AuthUser>
      })
      .then(data => {
        setUser(data)
        setStatus('authed')
      })
      .catch(() => {
        clearToken()
        setStatus('guest')
      })
  }, [])

  async function auth(
    path: string,
    body: Record<string, unknown>,
    remember: boolean,
  ): Promise<void> {
    const res = await fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (!res.ok) throw await apiError(res)
    const data = (await res.json()) as AuthResponse
    saveToken(data.token, remember)
    setUser({ id: data.id, username: data.username, email: data.email })
    setStatus('authed')
  }

  const value: AuthContextValue = {
    user,
    status,
    login: (email, password, captchaId, captchaCode, remember) =>
      auth('/api/auth/login', {
        email,
        password,
        captcha_id: captchaId,
        captcha_code: captchaCode,
        remember,
      }, remember),
    register: (username, email, password, confirmPassword) =>
      auth('/api/auth/register', {
        username,
        email,
        password,
        confirm_password: confirmPassword,
      }, true),
    logout() {
      clearToken()
      setUser(null)
      setStatus('guest')
    },
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext)
  if (ctx === null) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
