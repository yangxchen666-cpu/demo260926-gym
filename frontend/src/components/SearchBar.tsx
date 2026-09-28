interface SearchBarProps {
  value: string
  onChange: (value: string) => void
}

export default function SearchBar({ value, onChange }: SearchBarProps) {
  return (
    <div className="mt-8 flex items-center gap-3 border-2 border-ink bg-card px-3 transition-colors focus-within:border-flame">
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        className="h-5 w-5 shrink-0 text-ink"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>

      <input
        type="text"
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder="输入场馆名称或城市"
        aria-label="搜索场馆"
        className="w-full bg-transparent py-2.5 text-lg outline-none placeholder:text-muted/60"
      />

      {value !== '' && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="清空搜索"
          className="shrink-0 rounded-full p-1 text-muted transition-colors hover:bg-ink/5 hover:text-ink focus-visible:outline-2 focus-visible:outline-flame"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M6 6l12 12M18 6 6 18" />
          </svg>
        </button>
      )}
    </div>
  )
}
