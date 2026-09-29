import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import VenueDetailPage from './pages/VenueDetailPage'
import VenueDirectoryPage from './pages/VenueDirectoryPage'

export default function App() {
  const location = useLocation()

  /* 进入详情页回到顶部；返回列表时浏览器会尽量恢复滚动位置 */
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <Routes>
      <Route path="/" element={<VenueDirectoryPage />} />
      <Route path="/venues/:id" element={<VenueDetailPage />} />
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}
