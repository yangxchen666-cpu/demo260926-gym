import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Venue } from '../types'
import Pagination from '../components/Pagination'
import SearchBar from '../components/SearchBar'
import TypeFilter from '../components/TypeFilter'
import VenueGrid from '../components/VenueGrid'
import AuthButton from '../components/AuthButton'

const PAGE_SIZE = 12

type Status = 'loading' | 'error' | 'ready'

interface VenuesResponse {
  total: number
  page: number
  page_size: number
  items: Venue[]
}

/** 修改查询参数的回调式封装，避免覆盖未涉及的其他参数 */
function updateParams(
  setSearchParams: ReturnType<typeof useSearchParams>[1],
  mutate: (params: URLSearchParams) => void,
  { replace = false }: { replace?: boolean } = {},
) {
  setSearchParams(
    prev => {
      const next = new URLSearchParams(prev)
      mutate(next)
      return next
    },
    { replace },
  )
}

export default function VenueDirectoryPage() {
  /* 筛选状态存于 URL（?q=&type=&page=）：从详情页返回、分享链接均可还原 */
  const [searchParams, setSearchParams] = useSearchParams()
  const q = searchParams.get('q') ?? ''
  const typeFilter = searchParams.get('type') ?? ''
  const pageParam = Number(searchParams.get('page'))
  const page = Number.isInteger(pageParam) && pageParam >= 1 ? pageParam : 1

  const [items, setItems] = useState<Venue[]>([])
  const [total, setTotal] = useState(0)
  const [types, setTypes] = useState<string[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState(q)
  const [reloadTick, setReloadTick] = useState(0)

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

  /* 类型列表一次性拉取，失败时静默降级为仅「全部类型」 */
  useEffect(() => {
    fetch('/api/venue-types')
      .then(r => r.json() as Promise<string[]>)
      .then(setTypes)
      .catch(() => setTypes([]))
  }, [])

  /* 服务端搜索/筛选/分页；请求序号防竞态（过期响应不得覆盖新结果） */
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
    fetch(`/api/venues?${params}`)
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<VenuesResponse>
      })
      .then(data => {
        if (cur !== seq.current) return
        setItems(data.items)
        setTotal(data.total)
        const tp = Math.max(1, Math.ceil(data.total / PAGE_SIZE))
        if (page > tp) {
          /* 筛选后总页数变少：把页码拉回末页（默认第 1 页不写入，保持 URL 干净） */
          updateParams(setSearchParams, prev => {
            if (tp === 1) prev.delete('page')
            else prev.set('page', String(tp))
          })
        }
        setStatus('ready')
      })
      .catch(() => {
        if (cur !== seq.current) return
        setStatus('error')
      })
  }, [q, typeFilter, page, reloadTick, setSearchParams])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const counting = q !== '' || typeFilter !== ''
  const firstLoad = items.length === 0 && status === 'loading'

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <header className="pt-12 sm:pt-16">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="-ml-2 font-display text-5xl font-black italic leading-none tracking-tight sm:-ml-3 sm:text-6xl">
              场馆目录
            </h1>
            {/* 右侧分组：分组右缘与卡片网格最右一列右缘对齐（同一容器的 padding 边缘） */}
            <div className="flex items-center gap-4">
              {status === 'ready' && (
                <p
                  className="pb-1 text-sm font-medium tracking-widest text-muted"
                  aria-live="polite"
                >
                  {counting ? (
                    <>
                      命中{' '}
                      <span className="font-black text-flame">{total}</span>{' '}
                      VENUES
                    </>
                  ) : (
                    <>
                      {total} VENUES · {types.length} TYPES
                    </>
                  )}
                </p>
              )}
              <AuthButton />
            </div>
          </div>
          <div className="pictorial-stripes mt-5" aria-hidden="true">
            <span></span>
            <span></span>
          </div>
          <p className="mt-3 text-sm text-muted">
            输入场馆名称或所在城市，即时检索
          </p>
        </header>

        <SearchBar value={query} onChange={setQuery} />

        <TypeFilter
          types={types}
          value={typeFilter}
          onChange={value =>
            updateParams(setSearchParams, params => {
              if (value) params.set('type', value)
              else params.delete('type')
              params.delete('page')
            })
          }
        />

        <main className="mt-8">
          {firstLoad && <p className="py-16 text-center text-muted">加载中…</p>}

          {status === 'error' && (
            <div className="py-16 text-center">
              <p className="font-display text-xl font-black italic">
                场馆数据加载失败
              </p>
              <p className="mt-2 text-sm text-muted">
                请确认后端服务与数据库已启动
              </p>
              <button
                type="button"
                onClick={() => setReloadTick(t => t + 1)}
                className="mt-5 border-2 border-flame px-5 py-2 text-sm font-medium text-flame transition-colors hover:bg-flame hover:text-paper focus-visible:outline-2 focus-visible:outline-flame"
              >
                重新加载
              </button>
            </div>
          )}

          {status !== 'error' && !firstLoad && (
            <>
              <VenueGrid venues={items} query={q} />
              {total > PAGE_SIZE && (
                <Pagination
                  page={current}
                  totalPages={totalPages}
                  onChange={target =>
                    updateParams(setSearchParams, params => {
                      if (target === 1) params.delete('page')
                      else params.set('page', String(target))
                    })
                  }
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
