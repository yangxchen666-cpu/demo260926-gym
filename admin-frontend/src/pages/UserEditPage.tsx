import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { apiFetch, AuthRedirectError } from '../api'
import type { UserRow } from '../types'

type LoadStatus = 'loading' | 'notfound' | 'error' | 'ready'

interface FormState {
  username: string
  email: string
  password: string
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

interface FormErrors {
  username?: string
  email?: string
  password?: string
}

/** 前端预校验，规则与服务端对齐：username 2-20、email 格式、密码 6-128（编辑态可留空） */
function validate(form: FormState, isEdit: boolean): FormErrors {
  const errors: FormErrors = {}
  const username = form.username.trim()
  if (username.length < 2 || username.length > 20) {
    errors.username = '用户名需 2-20 个字符'
  }
  if (!EMAIL_PATTERN.test(form.email)) {
    errors.email = '邮箱格式不正确'
  }
  if (form.password === '' && !isEdit) {
    errors.password = '请设置初始密码'
  } else if (form.password !== '' && form.password.length < 6) {
    errors.password = '密码长度至少 6 位'
  }
  return errors
}

/** 新建/编辑二合一：编辑态密码留空 = 不修改 */
export default function UserEditPage() {
  const { id } = useParams()
  const navigate = useNavigate()
  const isEdit = id !== undefined
  const parsedId = isEdit ? Number(id) : NaN

  const [form, setForm] = useState<FormState>({
    username: '',
    email: '',
    password: '',
  })
  const [loadStatus, setLoadStatus] = useState<LoadStatus>(() =>
    isEdit ? 'loading' : 'ready',
  )
  const [reloadTick, setReloadTick] = useState(0)
  const [errors, setErrors] = useState<FormErrors>({})
  const [serverError, setServerError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!isEdit) return
    if (!Number.isInteger(parsedId) || parsedId < 1) {
      setLoadStatus('notfound')
      return
    }
    let cancelled = false
    apiFetch<UserRow>(`/api/users/${parsedId}`)
      .then(data => {
        if (cancelled) return
        setForm({
          username: data.username,
          email: data.email,
          password: '',
        })
        setLoadStatus('ready')
      })
      .catch(err => {
        if (cancelled) return
        if (err instanceof AuthRedirectError) return
        const msg = err instanceof Error ? err.message : ''
        if (msg === 'user not found') setLoadStatus('notfound')
        else setLoadStatus('error')
      })
    return () => {
      cancelled = true
    }
  }, [isEdit, parsedId, reloadTick])

  function set<K extends keyof FormState>(key: K, value: string) {
    setForm(prev => ({ ...prev, [key]: value }))
    setErrors(prev => ({ ...prev, [key]: undefined }))
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    const nextErrors = validate(form, isEdit)
    setErrors(nextErrors)
    if (Object.values(nextErrors).some(Boolean)) return
    setSubmitting(true)
    setServerError(null)
    try {
      if (isEdit) {
        await apiFetch<UserRow>(`/api/users/${parsedId}`, {
          method: 'PUT',
          body: {
            username: form.username.trim(),
            email: form.email,
            password: form.password === '' ? null : form.password,
          },
        })
      } else {
        await apiFetch<UserRow>('/api/users', {
          method: 'POST',
          body: {
            username: form.username.trim(),
            email: form.email,
            password: form.password,
          },
        })
      }
      navigate('/users')
    } catch (err) {
      if (err instanceof AuthRedirectError) return
      const msg = err instanceof Error ? err.message : ''
      if (msg === 'user not found') {
        setServerError('该用户已被删除，无法保存')
      } else {
        setServerError(msg || '保存失败，请重试')
      }
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full rounded-md border border-line bg-surface px-3 py-1.5 text-sm ' +
    'focus:border-accent focus:outline-none'
  const labelClass = 'mb-1 block text-sm text-muted'
  const errorClass = 'mt-1 text-sm text-danger'

  return (
    <div className="max-w-xl">
      <Link
        to="/users"
        className="text-sm text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
      >
        ← 返回用户列表
      </Link>
      <h1 className="mt-3 text-xl font-semibold">
        {isEdit ? '编辑用户' : '新增用户'}
      </h1>

      {loadStatus === 'loading' && (
        <p className="py-10 text-center text-sm text-muted">加载中…</p>
      )}

      {loadStatus === 'notfound' && (
        <div className="py-10 text-center">
          <p className="font-medium">该用户不存在或已被删除</p>
          <Link
            to="/users"
            className="mt-4 inline-block rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg"
          >
            返回列表
          </Link>
        </div>
      )}

      {loadStatus === 'error' && (
        <div className="py-10 text-center">
          <p className="font-medium">用户数据加载失败</p>
          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong"
          >
            重新加载
          </button>
        </div>
      )}

      {loadStatus === 'ready' && (
        <form
          className="mt-4 rounded-lg border border-line bg-surface p-6"
          onSubmit={handleSubmit}
          noValidate
        >
          <div className="space-y-4">
            <div>
              <label htmlFor="username" className={labelClass}>
                用户名
              </label>
              <input
                id="username"
                value={form.username}
                onChange={e => set('username', e.target.value)}
                className={inputClass}
              />
              {errors.username && (
                <p className={errorClass}>{errors.username}</p>
              )}
            </div>
            <div>
              <label htmlFor="email" className={labelClass}>
                邮箱
              </label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={e => set('email', e.target.value)}
                className={inputClass}
              />
              {errors.email && <p className={errorClass}>{errors.email}</p>}
            </div>
            <div>
              <label htmlFor="password" className={labelClass}>
                {isEdit ? '重置密码（留空 = 不修改）' : '初始密码'}
              </label>
              <input
                id="password"
                type="password"
                value={form.password}
                onChange={e => set('password', e.target.value)}
                placeholder={isEdit ? '留空表示不修改密码' : '至少 6 位'}
                autoComplete="new-password"
                className={inputClass}
              />
              {errors.password && (
                <p className={errorClass}>{errors.password}</p>
              )}
            </div>
          </div>

          {serverError && (
            <p className="mt-4 text-sm text-danger" role="alert">
              {serverError}
            </p>
          )}

          <div className="mt-6 flex justify-end gap-3">
            <Link
              to="/users"
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
            >
              取消
            </Link>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-md bg-accent px-4 py-1.5 text-sm text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-strong disabled:opacity-50"
            >
              {submitting ? '保存中…' : '保存'}
            </button>
          </div>
        </form>
      )}
    </div>
  )
}
