import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'
import Spinner from '../../components/Spinner'
import TopBar from '../../components/TopBar'

export default function TeamSelect() {
  const navigate = useNavigate()
  const [people, setPeople] = useState([])
  const [selected, setSelected] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.get('/people').then((r) => {
      setPeople(r.data)
      const saved = localStorage.getItem('myName')
      if (saved && r.data.find((p) => p.name === saved)) setSelected(saved)
    }).finally(() => setLoading(false))
  }, [])

  function proceed() {
    if (!selected) return
    localStorage.setItem('myName', selected)
    navigate('/team/menu')
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col" dir="rtl">
      <TopBar title="CamDrive — כניסה" back="/" />

      <div className="flex-1 p-4">
        <p className="text-gray-600 mb-4 font-semibold">מי אתה?</p>

        {loading ? (
          <div className="flex justify-center py-12"><Spinner /></div>
        ) : (
          <div className="flex flex-col gap-3">
            {people.map((p) => (
              <button
                key={p._id}
                onClick={() => setSelected(p.name)}
                className={`py-5 rounded-xl text-lg font-bold border-2 transition-colors ${
                  selected === p.name
                    ? 'bg-blue-900 text-white border-blue-900'
                    : 'bg-white text-gray-800 border-gray-200'
                }`}
              >
                {p.name}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="p-4">
        <button
          onClick={proceed}
          disabled={!selected}
          className="w-full py-4 bg-blue-900 text-white font-black text-xl rounded-xl disabled:opacity-40"
        >
          המשך
        </button>
      </div>
    </div>
  )
}
