import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { useAuth } from '../auth'
import type { CaptchaData } from '../types'

interface AuthModalProps {
  onClose: () => void
}

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/

/** 与服务端 RegisterRequest 同规则的中文预校验（服务端 422 仅作兜底） */
function validateRegister(
  username: string,
  email: string,
  password: string,
  confirmPassword: string,
): string | null {
  if (username.length < 2 || username.length > 20) return '用户名需为 2-20 个字符'
  if (!EMAIL_PATTERN.test(email)) return '邮箱格式不正确'
  if (password.length < 6) return '密码至少 6 位'
  if (password !== confirmPassword) return '两次输入的密码不一致'
  return null
}

export default function AuthModal({ onClose }: AuthModalProps) {
  const { login, register } = useAuth()
  const [mode, setMode] = useState<'login' | 'register'>('login')
  const [username, setUsername] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [captchaCode, setCaptchaCode] = useState('')
  const [remember, setRemember] = useState(false)
  const [captcha, setCaptcha] = useState<CaptchaData | null>(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  function refreshCaptcha() {
    fetch('/api/captcha')
      .then(res => res.json() as Promise<CaptchaData>)
      .then(setCaptcha)
      .catch(() => setCaptcha(null))
  }

  /* 挂载（弹窗打开）/ 切回登录视图时取一张验证码（register 不需要） */
  useEffect(() => {
    if (mode === 'login') refreshCaptcha()
  }, [mode])

  /* ESC 关闭 + 存续期间锁定背景滚动（点击遮罩不关闭，只能显式操作）；卸载时自动还原 */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [onClose])

  function switchMode(next: 'login' | 'register') {
    setMode(next)
    setError('')
    setPassword('')
    setConfirmPassword('')
    setCaptchaCode('')
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (submitting) return
    setError('')

    if (mode === 'register') {
      const msg = validateRegister(username.trim(), email.trim(), password, confirmPassword)
      if (msg !== null) {
        setError(msg)
        return
      }
      try {
        setSubmitting(true)
        await register(username.trim(), email.trim(), password, confirmPassword)
        onClose()
      } catch (err) {
        setError(err instanceof Error ? err.message : '注册失败，请稍后重试')
      } finally {
        setSubmitting(false)
      }
      return
    }

    if (!EMAIL_PATTERN.test(email.trim())) {
      setError('邮箱格式不正确')
      return
    }
    if (!captcha) {
      setError('验证码加载失败，请点击图片刷新')
      return
    }
    if (captchaCode.trim() === '') {
      setError('请输入验证码')
      return
    }
    try {
      setSubmitting(true)
      await login(
        email.trim(),
        password,
        captcha.captcha_id,
        captchaCode,
        remember,
      )
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败，请稍后重试')
      /* 登录失败后旧验证码已被服务端消费，自动换一张 */
      refreshCaptcha()
      setCaptchaCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const inputClass =
    'w-full border-2 border-ink bg-card px-3 py-2 text-sm outline-none transition-colors placeholder:text-muted/60 focus:border-flame'
  const labelClass = 'text-xs font-medium tracking-widest text-muted'

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label={mode === 'login' ? '登录' : '注册'}
        className="w-full max-w-sm border-2 border-ink bg-paper p-6 shadow-[6px_6px_0_#14120e]"
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="font-display text-2xl font-black italic">
            {mode === 'login' ? '登录' : '注册'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="关闭"
            className="-mr-1 -mt-1 shrink-0 rounded-full p-1.5 text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-flame"
          >
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <path d="M6 6l12 12M18 6 6 18" />
            </svg>
          </button>
        </div>
        <div className="pictorial-stripes mt-3" aria-hidden="true">
          <span></span>
          <span></span>
        </div>

        <form className="mt-5 flex flex-col gap-4" onSubmit={handleSubmit} noValidate>
          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-username" className={labelClass}>
                用户名
              </label>
              <input
                id="auth-username"
                type="text"
                value={username}
                onChange={e => setUsername(e.target.value)}
                autoComplete="username"
                placeholder="2-20 个字符"
                className={inputClass}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-email" className={labelClass}>
              邮箱
            </label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              autoComplete="email"
              placeholder="name@example.com"
              className={inputClass}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="auth-password" className={labelClass}>
              密码
            </label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
              placeholder={mode === 'login' ? '输入密码' : '至少 6 位'}
              className={inputClass}
            />
          </div>

          {mode === 'register' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-confirm" className={labelClass}>
                确认密码
              </label>
              <input
                id="auth-confirm"
                type="password"
                value={confirmPassword}
                onChange={e => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
                placeholder="再输入一次密码"
                className={inputClass}
              />
            </div>
          )}

          {mode === 'login' && (
            <div className="flex flex-col gap-1.5">
              <label htmlFor="auth-captcha" className={labelClass}>
                验证码
              </label>
              <div className="flex items-stretch gap-3">
                <input
                  id="auth-captcha"
                  type="text"
                  value={captchaCode}
                  onChange={e => setCaptchaCode(e.target.value)}
                  maxLength={4}
                  placeholder="输入右侧字符"
                  className={`${inputClass} flex-1 uppercase`}
                />
                {captcha ? (
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    aria-label="点击刷新验证码"
                    title="点击刷新验证码"
                    className="shrink-0 border-2 border-ink bg-card transition-colors hover:border-flame focus-visible:outline-2 focus-visible:outline-flame"
                  >
                    <img
                      src={captcha.image}
                      alt="图片验证码"
                      className="block h-11 w-35"
                    />
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={refreshCaptcha}
                    className="w-35 shrink-0 border-2 border-ink bg-card text-xs text-muted transition-colors hover:border-flame focus-visible:outline-2 focus-visible:outline-flame"
                  >
                    点击加载
                  </button>
                )}
              </div>
            </div>
          )}

          {mode === 'login' && (
            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={remember}
                onChange={e => setRemember(e.target.checked)}
                className="h-4 w-4 accent-flame"
              />
              记住登录状态（30 天内免登录）
            </label>
          )}

          {error !== '' && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-1 border-2 border-flame px-5 py-2 text-sm font-medium text-flame transition-colors hover:bg-flame hover:text-paper focus-visible:outline-2 focus-visible:outline-flame disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? '提交中…' : mode === 'login' ? '登录' : '注册并登录'}
          </button>

          <p className="text-sm text-muted">
            {mode === 'login' ? '还没有账号？' : '已有账号？'}
            <button
              type="button"
              onClick={() => switchMode(mode === 'login' ? 'register' : 'login')}
              className="ml-1 text-royal underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-flame"
            >
              {mode === 'login' ? '去注册' : '去登录'}
            </button>
          </p>
        </form>
      </div>
    </div>
  )
}
