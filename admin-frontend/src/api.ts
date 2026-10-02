/** 管理端 token 存取：key 与前台 'demo001-token' 隔离，同浏览器互不污染 */
const TOKEN_KEY = 'demo001-admin-token'

export function readToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function saveToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token)
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY)
}

/** 401（未登录/过期）触发的跳转中错误：页面层捕获后直接忽略（正在整页跳登录页） */
export class AuthRedirectError extends Error {
  constructor() {
    super('登录已过期，请重新登录')
    this.name = 'AuthRedirectError'
  }
}

/** 服务端错误 → 中文提示：字符串 detail 原样，pydantic 数组 detail 给通用文案 */
export async function apiError(res: Response): Promise<Error> {
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

/** 自动带 Bearer 的 fetch 封装；401 清 token 并整页跳登录（覆盖会话中途过期） */
export async function apiFetch<T>(
  path: string,
  init?: { method?: string; body?: unknown },
): Promise<T> {
  const headers: Record<string, string> = {}
  const token = readToken()
  if (token) headers.Authorization = `Bearer ${token}`
  if (init?.body !== undefined) headers['Content-Type'] = 'application/json'
  const res = await fetch(path, {
    method: init?.method ?? 'GET',
    headers,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  })
  if (!res.ok) {
    if (res.status === 401) {
      clearToken()
      window.location.assign('/login')
      throw new AuthRedirectError()
    }
    throw await apiError(res)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}
