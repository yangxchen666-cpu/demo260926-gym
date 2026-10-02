import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch, AuthRedirectError } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { updateParams } from '../search-params'
import type { Paged, UserRow } from '../types'

const PAGE_SIZE = 20

type Status = 'loading' | 'error' | 'ready'

/** ISO 时间 → 本地可读格式；解析失败原样返回 */
function formatTime(iso: string): string {
  const d = new Date(iso)
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString('zh-CN', { hour12: false })
}

export default function UserListPage() {
  /* 筛选状态存于 URL（?q=&page=） */
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1

  const [items, setItems] = useState<UserRow[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState(q)
  const [reloadTick, setReloadTick] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<UserRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  /* 后退/分享还原 URL 时，把 q 同步回输入框 */
  useEffect(() => {
    setQuery(q)
  }, [q])

  /* 搜索词防抖 300ms 后写入 URL；换词回到第 1 页 */
  useEffect(() => {
    const t = setTimeout(() => {
      const trimmed = query.trim()
      if (trimmed === q) return
      updateParams(
        setSearchParams,
        params => {
          if (trimmed) params.set('q', trimmed)
          else params.delete('q')
          params.delete('page')
        },
        { replace: true },
      )
    }, 300)
    return () => clearTimeout(t)
  }, [query, q, setSearchParams])

  /* 列表数据；请求序号防竞态 */
  const seq = useRef(0)
  useEffect(() => {
    const cur = ++seq.current
    setStatus('loading')
    const params = new URLSearchParams({
      q,
      page: String(page),
      page_size: String(PAGE_SIZE),
    })
    apiFetch<Paged<UserRow>>(`/api/users?${params}`)
      .then(data => {
        if (cur !== seq.current) return
        setItems(data.items)
        setTotal(data.total)
        const tp = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > tp) {
          updateParams(setSearchParams, prev => {
            if (tp === 1) prev.delete('page')
            else prev.set('page', String(tp))
          })
        }
        setStatus('ready')
      })
      .catch(err => {
        if (cur !== seq.current) return
        if (err instanceof AuthRedirectError) return
        setStatus('error')
      })
  }, [q, page, reloadTick, setSearchParams])

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/api/users/${pendingDelete.id}`, { method: 'DELETE' })
      setNotice(`已删除用户「${pendingDelete.username}」`)
      setPendingDelete(null)
      setReloadTick(t => t + 1)
    } catch (err) {
      if (err instanceof AuthRedirectError) return
      const msg = err instanceof Error ? err.message : ''
      setPendingDelete(null)
      if (msg === 'user not found') {
        setNotice(`用户「${pendingDelete.username}」已被删除，列表已刷新`)
        setReloadTick(t => t + 1)
      } else {
        setNotice(`删除失败：${msg}`)
      }
    } finally {
      setDeleting(false)
    }
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const firstLoad = items.length === 0 && status === 'loading'

  const th = 'px-3 py-2 text-left font-medium text-muted whitespace-nowrap'
  const inputClass =
    'rounded-md border border-line bg-surface px-3 py-1.5 text-sm ' +
    'focus:border-accent focus:outline-none'

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">用户管理</h1>
          {status === 'ready' && (
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              共 {total} 位用户
            </p>
          )}
        </div>
        <Link
          to="/users/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-strong"
        >
          新增用户
        </Link>
      </div>

      <div className="mt-4">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索用户名或邮箱"
          aria-label="搜索用户"
          className={`${inputClass} w-64`}
        />
      </div>

      {notice && (
        <p
          className="mt-3 rounded-md border border-line bg-surface px-3 py-2 text-sm text-muted"
          role="status"
        >
          {notice}
        </p>
      )}

      {firstLoad && <p className="py-10 text-center text-sm text-muted">加载中…</p>}

      {status === 'error' && (
        <div className="py-10 text-center">
          <p className="font-medium">用户数据加载失败</p>
          <p className="mt-1 text-sm text-muted">
            请确认 admin-backend 服务与数据库已启动
          </p>
          <button
            type="button"
            onClick={() => setReloadTick(t => t + 1)}
            className="mt-4 rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-strong"
          >
            重新加载
          </button>
        </div>
      )}

      {status !== 'error' && !firstLoad && (
        <>
          <div className="mt-4 overflow-x-auto rounded-lg border border-line bg-surface">
            <table className="w-full text-sm">
              <thead className="bg-bg">
                <tr>
                  <th className={th}>ID</th>
                  <th className={th}>用户名</th>
                  <th className={th}>邮箱</th>
                  <th className={th}>注册时间</th>
                  <th className={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(u => (
                  <tr key={u.id} className="border-t border-line hover:bg-bg">
                    <td className="px-3 py-2 text-muted">{u.id}</td>
                    <td className="px-3 py-2 font-medium">{u.username}</td>
                    <td className="px-3 py-2 text-muted">{u.email}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-muted">
                      {formatTime(u.created_at)}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        to={`/users/${u.id}/edit`}
                        className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(u)}
                        className="ml-3 text-danger hover:underline focus-visible:outline-2 focus-visible:outline-danger"
                      >
                        删除
                      </button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr>
                    <td
                      colSpan={5}
                      className="px-3 py-10 text-center text-muted"
                    >
                      暂无用户
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <Pagination
            page={current}
            totalPages={totalPages}
            total={total}
            onChange={target =>
              updateParams(setSearchParams, params => {
                if (target === 1) params.delete('page')
                else params.set('page', String(target))
              })
            }
          />
        </>
      )}

      {pendingDelete && (
        <ConfirmDialog
          title="删除用户"
          message={`确定删除用户「${pendingDelete.username}」（${pendingDelete.email}）吗？该操作不可恢复。`}
          onConfirm={confirmDelete}
          onCancel={() => setPendingDelete(null)}
        />
      )}
      {pendingDelete && deleting && (
        <p className="sr-only" role="status">
          正在删除…
        </p>
      )}
    </div>
  )
}
