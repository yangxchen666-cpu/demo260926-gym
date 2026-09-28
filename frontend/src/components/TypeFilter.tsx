import { typeColorClass } from '../typeColors'

interface TypeFilterProps {
  types: string[]
  value: string
  onChange: (value: string) => void
}

export default function TypeFilter({
  types,
  value,
  onChange,
}: TypeFilterProps) {
  return (
    <div className="relative mt-3 ml-auto block w-44">
      <span
        className={`absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full ${typeColorClass(value)}`}
        aria-hidden="true"
      />

      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        aria-label="按场馆类型筛选"
        className="w-full appearance-none border-2 border-ink bg-card py-2.5 pl-8 pr-9 text-sm font-medium text-ink transition-colors hover:border-flame focus:border-flame focus:outline-none"
      >
        <option value="">全部类型</option>
        {types.map(t => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>

      <svg
        className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        aria-hidden="true"
      >
        <path d="m6 9 6 6 6-6" />
      </svg>
    </div>
  )
}
