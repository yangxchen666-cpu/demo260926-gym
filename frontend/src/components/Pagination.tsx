import { useState } from 'react'

interface PaginationProps {
  page: number
  totalPages: number
  onChange: (page: number) => void
}

/** 生成页码序列；超过 8 页时只保留当前页前二后二，其余折叠为省略号 */
function pageList(page: number, totalPages: number): (number | '…')[] {
  if (totalPages <= 8) {
    return Array.from({ length: totalPages }, (_, i) => i + 1)
  }

  const keep = [page - 2, page - 1, page, page + 1, page + 2]
  const sorted = [...new Set(keep.filter(p => p >= 1 && p <= totalPages))].sort(
    (a, b) => a - b,
  )

  const list: (number | '…')[] = []
  let prev = 0
  for (const p of sorted) {
    if (p - prev > 1) list.push('…')
    list.push(p)
    prev = p
  }
  if (prev < totalPages) list.push('…')
  return list
}

export default function Pagination({
  page,
  totalPages,
  onChange,
}: PaginationProps) {
  const [draft, setDraft] = useState('')

  const commit = () => {
    const n = parseInt(draft, 10)
    setDraft('')
    if (Number.isNaN(n)) return
    const target = Math.min(Math.max(n, 1), totalPages)
    if (target !== page) onChange(target)
  }

  const arrowClass =
    'border-2 border-ink bg-card px-3 py-1.5 text-sm font-medium text-ink transition-colors ' +
    'enabled:hover:border-flame enabled:hover:text-flame ' +
    'disabled:cursor-not-allowed disabled:opacity-40 ' +
    'focus-visible:outline-2 focus-visible:outline-flame'

  return (
    <nav
      aria-label="分页"
      className="mt-10 flex flex-wrap items-center justify-center gap-1.5"
    >
      <button
        type="button"
        className={arrowClass}
        disabled={page === 1}
        onClick={() => onChange(1)}
      >
        首页
      </button>

      <button
        type="button"
        className={arrowClass}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>

      {pageList(page, totalPages).map((item, i) =>
        item === '…' ? (
          <span
            key={`ellipsis-${i}`}
            className="px-1 text-sm text-muted"
            aria-hidden="true"
          >
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            aria-current={item === page ? 'page' : undefined}
            aria-label={`第 ${item} 页`}
            onClick={() => onChange(item)}
            className={
              'h-9 w-9 border-2 text-sm font-bold transition-colors focus-visible:outline-2 focus-visible:outline-flame ' +
              (item === page
                ? 'border-flame bg-flame text-paper'
                : 'border-ink bg-card text-ink hover:border-flame hover:text-flame')
            }
          >
            {item}
          </button>
        ),
      )}

      <button
        type="button"
        className={arrowClass}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>

      <button
        type="button"
        className={arrowClass}
        disabled={page === totalPages}
        onClick={() => onChange(totalPages)}
      >
        末页
      </button>

      <span
        className="ml-3 flex h-9 items-center gap-1.5 border-2 border-ink bg-card px-2.5 text-sm text-muted focus-within:border-flame"
        aria-label={`直达指定页，共 ${totalPages} 页`}
      >
        <input
          type="text"
          inputMode="numeric"
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') commit()
            if (e.key === 'Escape') setDraft('')
          }}
          onBlur={commit}
          placeholder="页码"
          aria-label={`输入页码直达，共 ${totalPages} 页`}
          className="w-10 bg-transparent text-center text-ink outline-none placeholder:text-muted/60"
        />
        <span aria-hidden="true">/ {totalPages}</span>
      </span>
    </nav>
  )
}
