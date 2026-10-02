import { useEffect } from 'react'
import { Navigate, Route, Routes, useLocation } from 'react-router-dom'
import RequireAdmin from './components/RequireAdmin'
import LoginPage from './pages/LoginPage'
import UserEditPage from './pages/UserEditPage'
import UserListPage from './pages/UserListPage'
import VenueEditPage from './pages/VenueEditPage'
import VenueListPage from './pages/VenueListPage'

export default function App() {
  const location = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [location.pathname])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route element={<RequireAdmin />}>
        <Route path="/venues" element={<VenueListPage />} />
        <Route path="/venues/new" element={<VenueEditPage />} />
        <Route path="/venues/:id/edit" element={<VenueEditPage />} />
        <Route path="/users" element={<UserListPage />} />
        <Route path="/users/new" element={<UserEditPage />} />
        <Route path="/users/:id/edit" element={<UserEditPage />} />
      </Route>
      <Route path="/" element={<Navigate to="/venues" replace />} />
      <Route path="*" element={<Navigate to="/venues" replace />} />
    </Routes>
  )
}
