import type { Venue } from '../types'

/** 类别双色映射：橙 / 宝蓝，画报线路色 */
const TYPE_COLOR: Record<string, string> = {
  体育馆: 'bg-flame',
  网球中心: 'bg-flame',
  音乐厅: 'bg-flame',
  篮球馆: 'bg-flame',
  游泳馆: 'bg-royal',
  剧院: 'bg-royal',
  会展中心: 'bg-royal',
  足球场: 'bg-royal',
}

export default function VenueCard({ venue }: { venue: Venue }) {
  return (
    <article className="group border-2 border-ink bg-card transition-colors hover:border-flame">
      <div className="relative aspect-400/260 overflow-hidden bg-line/50">
        <span className="absolute left-2 top-2 z-10 bg-ink/85 px-1.5 py-0.5 font-display text-lg font-black italic leading-none tracking-widest text-paper">
          {String(venue.id).padStart(3, '0')}
        </span>
        <span
          className={`absolute bottom-0 right-0 z-10 px-2 py-0.5 text-xs font-bold text-paper ${
            TYPE_COLOR[venue.type] ?? 'bg-ink'
          }`}
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
        <h3 className="font-display text-lg font-bold leading-snug">
          {venue.name}
        </h3>
        <p className="mt-1.5 truncate text-sm text-muted">{venue.location}</p>
      </div>
    </article>
  )
}
