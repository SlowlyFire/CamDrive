import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Home from './pages/Home'
import TeamLogin from './pages/team/TeamLogin'
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
import FuelShare from './pages/FuelShare'
import FuelCards from './pages/team/FuelCards'
import InspectionForm1651 from './pages/team/InspectionForm1651'

function RequireAuth({ children }) {
  const token = localStorage.getItem('adminToken')
  return token ? children : <Navigate to="/admin/login" replace />
}

function RequireTeamCode({ children }) {
  const code = localStorage.getItem('teamCode')
  return code ? children : <Navigate to="/team/login" replace />
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />

        {/* Team */}
        <Route path="/team/login" element={<TeamLogin />} />
        <Route path="/team" element={<RequireTeamCode><TeamSelect /></RequireTeamCode>} />
        <Route path="/team/menu" element={<RequireTeamCode><TeamMenu /></RequireTeamCode>} />
        <Route path="/team/new" element={<RequireTeamCode><NewInspection /></RequireTeamCode>} />
        <Route path="/team/pending" element={<RequireTeamCode><PendingInspections /></RequireTeamCode>} />
        <Route path="/team/inspection/:id" element={<RequireTeamCode><InspectionView /></RequireTeamCode>} />
        <Route path="/team/fuel-cards" element={<RequireTeamCode><FuelCards /></RequireTeamCode>} />
        <Route path="/team/inspection/:id/form-1651" element={<RequireTeamCode><InspectionForm1651 /></RequireTeamCode>} />

        {/* Admin */}
        <Route path="/admin/login" element={<Login />} />
        <Route path="/admin" element={<RequireAuth><Dashboard /></RequireAuth>} />
        <Route path="/admin/inspection/:id" element={<RequireAuth><InspectionDetail /></RequireAuth>} />
        <Route path="/admin/vehicle/:plate" element={<RequireAuth><VehicleHistory /></RequireAuth>} />

        {/* Public share — no code required */}
        <Route path="/share/:token" element={<Share />} />
        <Route path="/fuel-share/:token" element={<FuelShare />} />

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  )
}
