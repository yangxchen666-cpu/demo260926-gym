import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiFetch, AuthRedirectError } from '../api'
import ConfirmDialog from '../components/ConfirmDialog'
import Pagination from '../components/Pagination'
import { updateParams } from '../search-params'
import { VENUE_TYPES } from '../types'
import type { Paged, VenueRow } from '../types'

const PAGE_SIZE = 20

type Status = 'loading' | 'error' | 'ready'

export default function VenueListPage() {
  /* 筛选状态存于 URL（?q=&type=&page=）：后退、分享链接均可还原 */
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const typeFilter = searchParams.get('type') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1

  const [items, setItems] = useState<VenueRow[]>([])
  const [total, setTotal] = useState(0)
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState(q)
  const [reloadTick, setReloadTick] = useState(0)
  const [pendingDelete, setPendingDelete] = useState<VenueRow | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  /* 后退/分享还原 URL 时，把 q 同步回输入框 */
  useEffect(() => {
    setQuery(q)
  }, [q])

  /* 搜索词防抖 300ms 后写入 URL；换词回到第 1 页（replace 避免逐键堆积历史） */
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

  /* 列表数据；请求序号防竞态（过期响应不得覆盖新结果） */
  const seq = useRef(0)
  useEffect(() => {
    const cur = ++seq.current
    setStatus('loading')
    const params = new URLSearchParams({
      q,
      type: typeFilter,
      page: String(page),
      page_size: String(PAGE_SIZE),
    })
    apiFetch<Paged<VenueRow>>(`/api/venues?${params}`)
      .then(data => {
        if (cur !== seq.current) return
        setItems(data.items)
        setTotal(data.total)
        const tp = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > tp) {
          /* 删除后总页数变少：把页码拉回末页（第 1 页不写入，保持 URL 干净） */
          updateParams(setSearchParams, prev => {
            if (tp === 1) prev.delete('page')
            else prev.set('page', String(tp))
          })
        }
        setStatus('ready')
      })
      .catch(err => {
        if (cur !== seq.current) return
        if (err instanceof AuthRedirectError) return // 401 已整页跳登录
        setStatus('error')
      })
  }, [q, typeFilter, page, reloadTick, setSearchParams])

  async function confirmDelete() {
    if (!pendingDelete) return
    setDeleting(true)
    try {
      await apiFetch(`/api/venues/${pendingDelete.id}`, { method: 'DELETE' })
      setNotice(`已删除场馆「${pendingDelete.name}」`)
      setPendingDelete(null)
      setReloadTick(t => t + 1)
    } catch (err) {
      if (err instanceof AuthRedirectError) return
      const msg = err instanceof Error ? err.message : ''
      setPendingDelete(null)
      if (msg === 'venue not found') {
        /* 已被他人删除：当作成功处理，刷新列表 */
        setNotice(`场馆「${pendingDelete.name}」已被删除，列表已刷新`)
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
          <h1 className="text-xl font-semibold">场馆管理</h1>
          {status === 'ready' && (
            <p className="mt-1 text-sm text-muted" aria-live="polite">
              共 {total} 个场馆
            </p>
          )}
        </div>
        <Link
          to="/venues/new"
          className="rounded-md bg-accent px-3 py-1.5 text-sm text-white hover:bg-accent-strong focus-visible:outline-2 focus-visible:outline-accent-strong"
        >
          新增场馆
        </Link>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="搜索名称或位置"
          aria-label="搜索场馆"
          className={`${inputClass} w-64`}
        />
        <select
          value={typeFilter}
          onChange={e =>
            updateParams(setSearchParams, params => {
              if (e.target.value) params.set('type', e.target.value)
              else params.delete('type')
              params.delete('page')
            })
          }
          aria-label="按类型筛选"
          className={`${inputClass} w-36`}
        >
          <option value="">全部类型</option>
          {VENUE_TYPES.map(t => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
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
          <p className="font-medium">场馆数据加载失败</p>
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
                  <th className={th}>名称</th>
                  <th className={th}>类型</th>
                  <th className={th}>位置</th>
                  <th className={th}>操作</th>
                </tr>
              </thead>
              <tbody>
                {items.map(v => (
                  <tr key={v.id} className="border-t border-line hover:bg-bg">
                    <td className="px-3 py-2 text-muted">{v.id}</td>
                    <td className="px-3 py-2 font-medium">{v.name}</td>
                    <td className="px-3 py-2">{v.type}</td>
                    <td className="max-w-72 truncate px-3 py-2 text-muted">
                      {v.location}
                    </td>
                    <td className="whitespace-nowrap px-3 py-2">
                      <Link
                        to={`/venues/${v.id}/edit`}
                        className="text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent"
                      >
                        编辑
                      </Link>
                      <button
                        type="button"
                        onClick={() => setPendingDelete(v)}
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
                      暂无场馆
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
          title="删除场馆"
          message={`确定删除「${pendingDelete.name}」吗？该操作不可恢复。`}
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
