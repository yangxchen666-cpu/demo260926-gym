import { Link } from 'react-router-dom'
import type { Venue } from '../types'
import { typeColorClass } from '../typeColors'

export default function VenueCard({ venue }: { venue: Venue }) {
  return (
    <Link
      to={`/venues/${venue.id}`}
      aria-label={`查看${venue.name}详情`}
      className="group block h-full border-2 border-ink bg-card transition-colors hover:border-flame focus-visible:outline-2 focus-visible:outline-flame"
    >
      <div className="relative aspect-400/260 overflow-hidden bg-line/50">
        <span className="absolute left-2 top-2 z-10 bg-ink/85 px-1.5 py-0.5 font-display text-lg font-black italic leading-none tracking-widest text-paper">
          {String(venue.id).padStart(3, '0')}
        </span>
        <span
          className={`absolute bottom-0 right-0 z-10 px-2 py-0.5 text-xs font-bold text-paper ${typeColorClass(venue.type)}`}
        >
          {venue.type}
        </span>
        <img
          src={venue.image}
          alt={`${venue.name}外观照片`}
          loading="lazy"
          className="venue-thumb h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
        />
      </div>

      <div className="px-4 py-3">
        {/* 名称区固定两行高（2.75em = 2 × leading-snug）：长名称换行也不撑高卡片 */}
        <h3 className="font-display text-lg font-bold leading-snug line-clamp-2 min-h-[2.75em]">
          {venue.name}
        </h3>
        <p className="mt-1.5 truncate text-sm text-muted">{venue.location}</p>
      </div>
    </Link>
  )
}
