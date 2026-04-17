export default function Spinner({ size = 8 }) {
  return (
    <div className={`w-${size} h-${size} border-4 border-blue-900/20 border-t-blue-900 rounded-full animate-spin`} />
  )
}
