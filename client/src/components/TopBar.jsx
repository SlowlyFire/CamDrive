import { useNavigate } from 'react-router-dom'

export default function TopBar({ title, back, action }) {
  const navigate = useNavigate()
  return (
    <div className="bg-blue-900 text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
      {back && (
        <button onClick={() => navigate(back)} className="text-white text-xl leading-none pl-1">
          &#8594;
        </button>
      )}
      <span className="font-bold text-lg flex-1">{title}</span>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  )
}
