import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import TeamSelect from './pages/team/TeamSelect'
import TeamMenu from './pages/team/TeamMenu'
import NewInspection from './pages/team/NewInspection'
import PendingInspections from './pages/team/PendingInspections'
import InspectionView from './pages/team/InspectionView'
import Login from './pages/admin/Login'
import Dashboard from './pages/admin/Dashboard'
import InspectionDetail from './pages/admin/InspectionDetail'
import VehicleHistory from './pages/admin/VehicleHistory'
import Share from './pages/Share'

function RequireAuth({ children }) {
  const token = localStorage.getItem('adminToken')
  return token ? children : <Navigate to="/admin/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Team */}
        <Route path="/team" element={<TeamSelect />} />
        <Route path="/team/menu" element={<TeamMenu />} />
        <Route path="/team/new" element={<NewInspection />} />
        <Route path="/team/pending" element={<PendingInspections />} />
        <Route path="/team/inspection/:id" element={<InspectionView />} />

        {/* Admin */}
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/admin/inspection/:id" element={<RequireAuth><InspectionDetail /></RequireAuth>} />
        <Route path="/admin/vehicle/:plate" element={<RequireAuth><VehicleHistory /></RequireAuth>} />

        {/* Public share */}
        <Route path="/share/:token" element={<Share />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
