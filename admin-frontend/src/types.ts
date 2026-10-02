export type VenueType = '足球场' | '篮球场' | '羽毛球场' | '网球场'

/** 四类与数据库 CHECK 约束、后端 Literal 校验对齐，前端常量即可（无需接口拉取） */
export const VENUE_TYPES: readonly VenueType[] = [
  '足球场',
  '篮球场',
  '羽毛球场',
  '网球场',
]

export interface VenueRow {
  id: number
  name: string
  type: VenueType
  location: string
  image: string
  description: string
  opening_hours: string
  contact: string
}

export interface UserRow {
  id: number
  username: string
  email: string
  created_at: string
}

export interface AdminInfo {
  id: number
  email: string
}

export interface LoginResponse extends AdminInfo {
  token: string
}

export interface Paged<T> {
  total: number
  page: number
  page_size: number
  items: T[]
}
