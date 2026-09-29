export interface Venue {
  id: number
  name: string
  type: string
  location: string
  image: string
}

/** 列表接口仅返回基础 5 字段，详情接口额外返回以下字段 */
export interface VenueDetail extends Venue {
  description: string
  opening_hours: string
  contact: string
}
