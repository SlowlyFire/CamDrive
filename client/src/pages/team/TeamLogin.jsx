import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../../utils/api'

export default function TeamLogin() {
  const navigate = useNavigate()
  const [code, setCode] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  async function submit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/team-login', { code })
      localStorage.setItem('teamCode', code)
      navigate('/team')
    } catch {
      setError('קוד שגוי')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-blue-900 flex items-center justify-center p-6" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 w-full max-w-sm">
        <h1 className="text-2xl font-black text-blue-900 mb-2 text-center">צוות שטח</h1>
        <p className="text-gray-500 text-sm text-center mb-6">הזן את קוד הצוות כדי להמשיך</p>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <input
            type="password"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="קוד צוות"
            autoFocus
            className="border-2 border-gray-300 rounded-xl px-4 py-3 text-lg focus:border-blue-900 outline-none text-center tracking-widest"
          />
          {error && <p className="text-red-600 text-sm text-center font-semibold">{error}</p>}
          <button
            type="submit"
            disabled={loading || !code}
            className="py-3 bg-blue-900 text-white font-black text-lg rounded-xl disabled:opacity-50"
          >
            {loading ? 'בודק…' : 'כניסה'}
          </button>
        </form>
      </div>
    </div>
  )
}
