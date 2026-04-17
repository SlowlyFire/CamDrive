import { useNavigate } from 'react-router-dom'

export default function Home() {
  const navigate = useNavigate()

  function goTeam() {
    navigate('/team')
  }

  function goAdmin() {
    const token = localStorage.getItem('adminToken')
    navigate(token ? '/admin' : '/admin/login')
  }

  return (
    <div className="min-h-screen bg-blue-900 flex flex-col items-center justify-center gap-8 px-6">
      <div className="text-center mb-4">
        <h1 className="text-white text-4xl font-black tracking-tight">CamDrive</h1>
        <p className="text-blue-300 text-md mt-1">מערכת בחינות כלי צמ״ה</p>
        <p className="text-blue-300 text-sm mt-1">יצ״מ מרכז אימפריה</p>
      </div>

      <button
        onClick={goTeam}
        className="w-full max-w-xs bg-white text-blue-900 font-black text-2xl py-8 rounded-2xl shadow-lg active:scale-95 transition-transform"
      >
        צוות שטח
      </button>

      <button
        onClick={goAdmin}
        className="w-full max-w-xs bg-blue-700 border-2 border-blue-400 text-white font-black text-2xl py-8 rounded-2xl shadow-lg active:scale-95 transition-transform"
      >
        מנהל
      </button>
    </div>
  )
}
