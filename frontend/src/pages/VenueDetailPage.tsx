import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { VenueDetail } from '../types'
import { typeColorClass } from '../typeColors'

type Status = 'loading' | 'ready' | 'notfound' | 'error'

/** 卡片缩略图 400/260 与详情大图 1200/780 同比例：同一 picsum seed，仅放大尺寸 */
function heroImage(url: string): string {
  return url.replace(/\/400\/260$/, '/1200/780')
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="border-2 border-ink bg-card px-4 py-3">
      <dt className="text-xs font-medium tracking-widest text-muted">
        {label}
      </dt>
      <dd className="mt-1.5 font-medium">{children}</dd>
    </div>
  )
}

export default function VenueDetailPage() {
  const { id } = useParams()
  const venueId = Number(id)
  const valid = Number.isInteger(venueId) && venueId >= 1

  const [venue, setVenue] = useState<VenueDetail | null>(null)
  const [fetchStatus, setFetchStatus] = useState<Status>('loading')
  const [reloadTick, setReloadTick] = useState(0)
  /* 非法 id（非正整数）不发请求，直接呈现未找到 */
  const status: Status = valid ? fetchStatus : 'notfound'

  /* 服务端拉取单个场馆；请求序号防竞态（id 变化时过期响应不得覆盖新结果） */
  const seq = useRef(0)
  useEffect(() => {
    if (!valid) return
    const cur = ++seq.current
    setFetchStatus('loading')
    fetch(`/api/venues/${venueId}`)
      .then(res => {
        if (res.ok) return res.json() as Promise<VenueDetail>
        return Promise.reject(new Error(String(res.status)))
      })
      .then(data => {
        if (cur !== seq.current) return
        setVenue(data)
        setFetchStatus('ready')
      })
      .catch(err => {
        if (cur !== seq.current) return
        setFetchStatus(err.message === '404' ? 'notfound' : 'error')
      })
  }, [venueId, valid, reloadTick])

  /* 标签页标题随场馆名更新，离开时由路由壳无需清理（下个页面会覆写） */
  useEffect(() => {
    document.title =
      status === 'ready' && venue ? `${venue.name} · 场馆目录` : '场馆目录'
  }, [status, venue])

  return (
    <div className="min-h-screen bg-paper font-sans text-ink">
      {/* 阅读列比目录页窄，控制大图与正文的展示尺寸 */}
      <div className="mx-auto max-w-2xl px-5 pb-16 sm:px-8">
        <div className="pt-8 sm:pt-10">
          <Link
            to="/"
            className="inline-block border-2 border-ink bg-card px-4 py-1.5 text-sm font-medium text-ink transition-colors hover:border-flame hover:text-flame focus-visible:outline-2 focus-visible:outline-flame"
          >
            ← 返回场馆目录
          </Link>
        </div>

        {status === 'loading' && (
          <p className="py-16 text-center text-muted">加载中…</p>
        )}

        {status === 'notfound' && (
          <div className="py-16 text-center">
            <p className="font-display text-xl font-black italic">
              未找到该场馆
            </p>
            <p className="mt-2 text-sm text-muted">它可能已下线，或链接有误</p>
            <Link
              to="/"
              className="mt-5 inline-block border-2 border-flame px-5 py-2 text-sm font-medium text-flame transition-colors hover:bg-flame hover:text-paper focus-visible:outline-2 focus-visible:outline-flame"
            >
              返回场馆目录
            </Link>
          </div>
        )}

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

        {status === 'ready' && venue && (
          <article className="mt-8">
            <header>
              <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
                <h1 className="font-display text-4xl font-black italic leading-none tracking-tight sm:text-5xl">
                  {venue.name}
                </h1>
                <p className="pb-1 text-sm font-medium tracking-widest text-muted">
                  VENUE NO.{String(venue.id).padStart(3, '0')}
                </p>
              </div>
              <div className="pictorial-stripes mt-5" aria-hidden="true">
                <span></span>
                <span></span>
              </div>
            </header>

            <figure className="mt-6 border-2 border-ink bg-line/50">
              <div className="relative aspect-1200/780 overflow-hidden">
                <span className="absolute left-3 top-3 z-10 bg-ink/85 px-2 py-1 font-display text-2xl font-black italic leading-none tracking-widest text-paper">
                  {String(venue.id).padStart(3, '0')}
                </span>
                <span
                  className={`absolute bottom-0 right-0 z-10 px-3 py-1 text-sm font-bold text-paper ${typeColorClass(venue.type)}`}
                >
                  {venue.type}
                </span>
                {/* LCP 元素，无需懒加载 */}
                <img
                  src={heroImage(venue.image)}
                  alt={`${venue.name}外观照片`}
                  className="h-full w-full object-cover"
                />
              </div>
            </figure>

            <dl className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Fact label="场馆类型">
                <span
                  className={`px-2 py-0.5 text-xs font-bold text-paper ${typeColorClass(venue.type)}`}
                >
                  {venue.type}
                </span>
              </Fact>
              <Fact label="开放时间">{venue.opening_hours}</Fact>
              <Fact label="场馆位置">{venue.location}</Fact>
              <Fact label="客服联系方式">
                <a
                  href={`tel:${venue.contact.replace(/[^0-9]/g, '')}`}
                  className="text-royal underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-flame"
                >
                  {venue.contact}
                </a>
              </Fact>
            </dl>

            <section className="mt-8">
              <h2 className="font-display text-2xl font-black italic">
                场馆简介
              </h2>
              <p className="mt-3 border-l-4 border-flame pl-4 leading-relaxed">
                {venue.description}
              </p>
            </section>
          </article>
        )}
      </div>
    </div>
  )
}
