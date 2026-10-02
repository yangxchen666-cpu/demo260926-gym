interface PaginationProps {
  page: number
  totalPages: number
  total: number
  onChange: (page: number) => void
}

/** 后台紧凑分页：上一页/下一页 + 页码与总数信息（每页 20 条，列表较短） */
export default function Pagination({
  page,
  totalPages,
  total,
  onChange,
}: PaginationProps) {
  const btn =
    'rounded-md border border-line bg-surface px-3 py-1.5 text-sm text-ink ' +
    'enabled:hover:bg-bg disabled:cursor-not-allowed disabled:opacity-40 ' +
    'focus-visible:outline-2 focus-visible:outline-accent'

  return (
    <nav
      aria-label="分页"
      className="mt-4 flex items-center justify-end gap-2 text-sm text-muted"
    >
      <span className="mr-2">
        第 {page} / {totalPages} 页 · 共 {total} 条
      </span>
      <button
        type="button"
        className={btn}
        disabled={page === 1}
        onClick={() => onChange(page - 1)}
      >
        上一页
      </button>
      <button
        type="button"
        className={btn}
        disabled={page === totalPages}
        onClick={() => onChange(page + 1)}
      >
        下一页
      </button>
    </nav>
  )
}
