import type { Venue } from '../types'
import VenueCard from './VenueCard'

interface VenueGridProps {
  venues: Venue[]
  query: string
}

export default function VenueGrid({ venues, query }: VenueGridProps) {
  if (venues.length === 0) {
    return (
      <div className="py-16 text-center">
        <p className="font-display text-2xl font-black italic">
          未找到与「{query}」相关的场馆
        </p>
        <p className="mt-2 text-sm text-muted">
          换个名称或城市试试，例如「羽毛球」或「上海」
        </p>
      </div>
    )
  }

  return (
    <ul className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-5">
      {venues.map(venue => (
        <li key={venue.id}>
          <VenueCard venue={venue} />
        </li>
      ))}
    </ul>
  )
}
