/** 场馆类型（DB 层 CHECK 约束，仅这四种合法值） */
export type VenueType = '足球场' | '篮球场' | '羽毛球场' | '网球场'

export interface Venue {
  id: number
  name: string
  type: VenueType
  location: string
  image: string
}

/** 列表接口仅返回基础 5 字段，详情接口额外返回以下字段 */
export interface VenueDetail extends Venue {
  description: string
  opening_hours: string
  contact: string
}

/** 注册/登录接口的公开用户字段 */
export interface AuthUser {
  id: number
  username: string
  email: string
}

/** 注册/登录成功响应（注册即登录，两端点同构） */
export interface AuthResponse extends AuthUser {
  token: string
}

/** GET /api/captcha 响应：image 为 data:image/svg+xml;base64,... */
export interface CaptchaData {
  captcha_id: string
  image: string
}
