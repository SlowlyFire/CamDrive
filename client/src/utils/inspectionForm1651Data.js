export const SECTION_ITEMS = {
  documents: [
    'פנקס הכלי',
    'פנקס חפ"ר',
    'תעודת רישוי',
    'תעודת ביטוח',
    'ספר תיקונים 807',
  ],
  operatorCabin: [
    'מושב ורצפה',
    'חגורות בטיחות',
    'מראות',
    'שמשות ומגבים',
    'מד שע"מ',
    'לוח מחוונים ונורות',
    'מנגנוני נעילה',
    'מטף כיבוי אש',
    'ערכת עזרה ראשונה',
    'אמצעי פינוי',
  ],
  engineCheck: [
    'רמת שמן מנוע',
    'רמת נוזל קירור',
    'רמת שמן גיר',
    'רמת שמן הידראולי',
    'מסנן אוויר',
    'מצבר וחיבורים',
    'חגורת מניע',
    'דליפות שמן / נוזל',
    'נורית לחץ שמן',
    'נורית טמפרטורת מנוע',
  ],
  steeringSystem: [
    'רמת שמן הגה כוח',
    'צינורות ומחברים',
    'עמוד הגה',
    'זווית הגה',
  ],
}

export const SECTION_LABELS = {
  documents:      'מסמכים',
  operatorCabin:  'תא מפעיל',
  engineCheck:    'בדיקת מנוע',
  steeringSystem: 'מערכת ההיגוי',
}

export const HEADER_FIELDS = [
  { key: 'serialNumber',            label: 'מספר רישוי' },
  { key: 'enlistmentDate',          label: 'תאריך גיוס',           type: 'date' },
  { key: 'time',                    label: 'שעה',                  type: 'time' },
  { key: 'internalNumber',          label: "מס' פנימי" },
  { key: 'equipmentNumberAndModel', label: 'מספר הציוד ודגם' },
  { key: 'vehicleType',             label: 'סוג הכלי' },
  { key: 'engineHours',             label: 'שע"מ',                 type: 'number' },
  { key: 'yearModel',               label: 'שנתון',                type: 'number' },
  { key: 'securitySystemCode',      label: "קוד מע' מיגון" },
  { key: 'ownerName',               label: 'שם הבעלים' },
  { key: 'driverFullName',          label: 'שם פרטי ומשפחה - נהג' },
  { key: 'phoneNumber',             label: 'מספר טלפון',           type: 'tel' },
  { key: 'operatorMobileNumber',    label: "מס' נייד - מפעיל",    type: 'tel' },
  { key: 'enlistmentSiteName',      label: 'שם אתר הגיוס' },
  { key: 'creditSiteName',          label: 'שם אתר הזיכוי' },
  { key: 'releaseSiteName',         label: 'שם אתר השחרור' },
  { key: 'yatzamPhone',             label: 'טלפון יצ"מ',           type: 'tel' },
]

export function initFormData(formType) {
  return {
    formType: formType || 'enlistment',
    header: {
      serialNumber:            '',
      enlistmentDate:          '',
      time:                    '',
      internalNumber:          '',
      equipmentNumberAndModel: '',
      vehicleType:             '',
      engineHours:             '',
      yearModel:               '',
      securitySystemCode:      '',
      ownerName:               '',
      driverFullName:          '',
      phoneNumber:             '',
      operatorMobileNumber:    '',
      enlistmentSiteName:      '',
      creditSiteName:          '',
      releaseSiteName:         '',
      yatzamPhone:             '',
    },
    fuelGauge: { liters: '', level: null },
    sections: {
      documents:      SECTION_ITEMS.documents.map((label) => ({ label, value: null })),
      operatorCabin:  SECTION_ITEMS.operatorCabin.map((label) => ({ label, value: null })),
      engineCheck:    SECTION_ITEMS.engineCheck.map((label) => ({ label, value: null })),
      steeringSystem: SECTION_ITEMS.steeringSystem.map((label) => ({ label, value: null })),
    },
    status: 'draft',
  }
}
