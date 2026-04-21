const MAP = {
  pending:                  { label: 'ממתין',          cls: 'bg-yellow-100 text-yellow-800' },
  uploading:                { label: 'מעלה לדרייב...', cls: 'bg-blue-100 text-blue-800' },
  approved:                 { label: 'אושר',           cls: 'bg-green-100 text-green-800' },
  partially_approved:       { label: 'אושר חלקית',    cls: 'bg-orange-100 text-orange-800' },
  rejected:                 { label: 'נדחה',           cls: 'bg-red-100 text-red-800' },
  reserve:                  { label: 'רזרבה',          cls: 'bg-yellow-100 text-yellow-800' },
  temporarily_disqualified: { label: 'נפסל זמנית',    cls: 'bg-orange-200 text-orange-900' },
  disqualified:             { label: 'נפסל',           cls: 'bg-red-200 text-red-900' },
}

export default function StatusBadge({ status }) {
  const { label, cls } = MAP[status] || MAP.pending
  return (
    <span className={`inline-block text-xs font-bold px-2 py-0.5 rounded-full ${cls}`}>
      {label}
    </span>
  )
}
