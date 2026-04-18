const MAP = {
  pending:            { label: 'ממתין',       cls: 'bg-yellow-100 text-yellow-800' },
  approved:           { label: 'אושר',        cls: 'bg-green-100 text-green-800' },
  partially_approved: { label: 'אושר חלקית', cls: 'bg-orange-100 text-orange-800' },
  rejected:           { label: 'נדחה',        cls: 'bg-red-100 text-red-800' },
}

export default function StatusBadge({ status }) {
  const { label, cls } = MAP[status] || MAP.pending
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}
