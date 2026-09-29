import { useState } from 'react'
import { useAuth } from '../auth'
import AuthModal from './AuthModal'

/** 页面右上角的登录入口：访客显示「登录」，登录后显示用户名 +「退出」 */
export default function AuthButton() {
  const { user, status, logout } = useAuth()
  const [open, setOpen] = useState(false)

  /* 启动校验 token 期间不渲染，避免闪现「登录」又跳回已登录态 */
  if (status === 'checking') return null

  return (
    <>
      {status === 'authed' && user ? (
        <div className="flex items-center gap-3">
          <span
            className="max-w-32 truncate text-sm font-medium"
            title={user.username}
          >
            {user.username}
          </span>
          <button
            type="button"
            onClick={logout}
            className="border-2 border-ink bg-card px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-flame hover:text-flame focus-visible:outline-2 focus-visible:outline-flame"
          >
            退出
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="border-2 border-flame px-5 py-2 text-sm font-medium text-flame transition-colors hover:bg-flame hover:text-paper focus-visible:outline-2 focus-visible:outline-flame"
        >
          登录
        </button>
      )}

      {/* 条件挂载：关闭即卸载，重新打开时表单从空白开始 */}
      {open && <AuthModal onClose={() => setOpen(false)} />}
    </>
  )
}
