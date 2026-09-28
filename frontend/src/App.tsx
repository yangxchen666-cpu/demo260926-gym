import { useEffect, useMemo, useState } from 'react'
import type { Venue } from './types'
import Pagination from './components/Pagination'
import SearchBar from './components/SearchBar'
import VenueGrid from './components/VenueGrid'

const PAGE_SIZE = 12

type Status = 'loading' | 'error' | 'ready'

export default function App() {
  const [venues, setVenues] = useState<Venue[]>([])
  const [status, setStatus] = useState<Status>('loading')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)

  const load = () => {
    setStatus('loading')
    fetch('/venues.json')
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        return res.json() as Promise<Venue[]>
      })
      .then(data => {
        setVenues(data)
        setStatus('ready')
      })
      .catch(() => setStatus('error'))
  }

  useEffect(load, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return venues
    return venues.filter(
      v =>
        v.name.toLowerCase().includes(q) ||
        v.location.toLowerCase().includes(q),
    )
  }, [venues, query])

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const current = Math.min(page, totalPages)
  const paged = useMemo(
    () => filtered.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE),
    [filtered, current],
  )

  const counting = query.trim() !== ''

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      <div className="mx-auto max-w-6xl px-5 pb-16 sm:px-8">
        <header className="pt-12 sm:pt-16">
          <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
            <h1 className="-ml-2 font-display text-5xl font-black italic leading-none tracking-tight sm:-ml-3 sm:text-6xl">
              场馆名录
            </h1>
            {status === 'ready' && (
              <p
                className="pb-1 text-sm font-medium tracking-widest text-muted"
                aria-live="polite"
              >
                {counting ? (
                  <>
                    命中{' '}
                    <span className="font-black text-flame">
                      {filtered.length}
                    </span>{' '}
                    / {venues.length} VENUES
                  </>
                ) : (
                  <>{venues.length} VENUES · 8 TYPES</>
                )}
              </p>
            )}
          </div>
          <div className="pictorial-stripes mt-5" aria-hidden="true">
            <span></span>
            <span></span>
          </div>
          <p className="mt-3 text-sm text-muted">
            输入场馆名称或所在城市，即时检索
          </p>
        </header>

        <SearchBar
          value={query}
          onChange={value => {
            setQuery(value)
            setPage(1)
          }}
        />

        <main className="mt-8">
          {status === 'loading' && (
            <p className="py-16 text-center text-muted">加载中…</p>
          )}

          {status === 'error' && (
            <div className="py-16 text-center">
              <p className="font-display text-xl font-black italic">
                场馆数据加载失败
              </p>
              <p className="mt-2 text-sm text-muted">请检查网络连接后重试</p>
              <button
                type="button"
                onClick={load}
                className="mt-5 border-2 border-flame px-5 py-2 text-sm font-medium text-flame transition-colors hover:bg-flame hover:text-paper focus-visible:outline-2 focus-visible:outline-flame"
              >
                重新加载
              </button>
            </div>
          )}

          {status === 'ready' && (
            <>
              <VenueGrid venues={paged} query={query.trim()} />
              {filtered.length > PAGE_SIZE && (
                <Pagination
                  page={current}
                  totalPages={totalPages}
                  onChange={setPage}
                />
              )}
            </>
          )}
        </main>
      </div>
    </div>
  )
}
