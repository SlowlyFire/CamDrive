import { useRef, useEffect } from 'react'

export default function SignaturePad({ value, onChange }) {
  const canvasRef = useRef(null)
  const isDrawing = useRef(false)
  const lastPos = useRef(null)
  const initialized = useRef(false)

  // Draw a saved signature onto the canvas when value is loaded from IDB/server.
  // The `initialized` flag prevents external value changes from overwriting a
  // signature the user is actively drawing.
  useEffect(() => {
    if (initialized.current || !value) return
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    const img = new Image()
    img.onload = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
      initialized.current = true
    }
    img.src = value
  }, [value])

  // Prevent page scroll while the finger is drawing (needs non-passive listener).
  // `touchAction: none` on the canvas handles most browsers, but this is the
  // belt-and-suspenders fallback.
  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const prevent = (e) => { if (isDrawing.current) e.preventDefault() }
    canvas.addEventListener('touchmove', prevent, { passive: false })
    return () => canvas.removeEventListener('touchmove', prevent)
  }, [])

  function getPos(e) {
    const canvas = canvasRef.current
    const rect = canvas.getBoundingClientRect()
    // Scale from CSS pixels → canvas pixel space (canvas may be CSS-scaled)
    const scaleX = canvas.width / rect.width
    const scaleY = canvas.height / rect.height
    const src = e.touches ? e.touches[0] : e
    return {
      x: (src.clientX - rect.left) * scaleX,
      y: (src.clientY - rect.top) * scaleY,
    }
  }

  function startDraw(e) {
    isDrawing.current = true
    initialized.current = true // claim canvas; stop external value from overwriting
    lastPos.current = getPos(e)
  }

  function draw(e) {
    if (!isDrawing.current || !lastPos.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1e3a5f'
    ctx.stroke()
    lastPos.current = pos
  }

  function endDraw() {
    if (!isDrawing.current) return
    isDrawing.current = false
    lastPos.current = null
    onChange(canvasRef.current.toDataURL('image/png'))
  }

  function clear() {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    initialized.current = false
    onChange(null)
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs font-bold text-gray-500">חתימה</span>
        <button
          type="button"
          onClick={clear}
          className="text-xs text-red-500 font-bold px-2 py-0.5 border border-red-200 rounded-lg"
        >
          נקה
        </button>
      </div>
      <canvas
        ref={canvasRef}
        width={320}
        height={130}
        style={{ width: '100%', aspectRatio: '320/130', touchAction: 'none' }}
        className="border-2 border-dashed border-gray-300 rounded-xl bg-white cursor-crosshair"
        onMouseDown={startDraw}
        onMouseMove={draw}
        onMouseUp={endDraw}
        onMouseLeave={endDraw}
        onTouchStart={startDraw}
        onTouchMove={draw}
        onTouchEnd={endDraw}
      />
    </div>
  )
}
