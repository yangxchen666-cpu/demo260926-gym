import { Navigate } from 'react-router-dom'
import { useAdminAuth } from '../auth'
import Layout from './Layout'

/** 受保护路由守卫：checking 渲染 null（不闪烁），guest 跳登录，authed 进布局 */
export default function RequireAdmin() {
  const { status } = useAdminAuth()

  if (status === 'checking') return null
  if (status === 'guest') return <Navigate to="/login" replace />
  return <Layout />
}
