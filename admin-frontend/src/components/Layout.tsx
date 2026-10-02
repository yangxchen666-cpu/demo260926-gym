import { NavLink, Outlet } from 'react-router-dom'
import { useAdminAuth } from '../auth'

/** 后台布局：顶栏（站名 + 导航 + 管理员信息/退出）+ 内容区 */
export default function Layout() {
  const { admin, logout } = useAdminAuth()

  const navClass = ({ isActive }: { isActive: boolean }) =>
    isActive ? 'text-accent font-medium' : 'text-muted hover:text-ink'

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex h-14 items-center gap-8 border-b border-line bg-surface px-6">
        <span className="font-semibold">场馆目录 · 管理后台</span>
        <nav className="flex items-center gap-5 text-sm">
          <NavLink to="/venues" className={navClass}>
            场馆管理
          </NavLink>
          <NavLink to="/users" className={navClass}>
            用户管理
          </NavLink>
        </nav>
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="text-muted">{admin?.email}</span>
          <button
            type="button"
            onClick={logout}
            className="rounded-md border border-line bg-surface px-3 py-1.5 hover:bg-bg focus-visible:outline-2 focus-visible:outline-accent"
          >
            退出
          </button>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-8">
        <Outlet />
      </main>
    </div>
  )
}
