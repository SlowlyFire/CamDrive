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
  hydraulicSystem: [
    'גובה השמן במיכל ההידראולי',
    'נזילות חיצוניות במערכת',
    'בדיקת רעשים במערכת ההידראולית',
    'בדיקת פעולות הידראוליות/הפעלה',
  ],
  brakes: [
    'כושר עצירת כל צד בנפרד',
    'נזילות חיצוניות',
    'בדיקת בלם חום',
    'מצב בלם יד',
  ],
  wheelSteering: [
    'בדיקת חופשים במערכת היגוי',
    'מצב בוכנות הגה',
    'פין נעילה למערכת היגוי',
  ],
  trackSystem: [
    'מצב הפלטות והשרשראות',
    'מצב גלילונים/רוליקים',
    'מצב גלגלי מתח/היידלר',
    'מצב גלגלי הינע/ספרוקטיס',
    'בדיקה ויזואלית למערכת הזחל',
  ],
  gearSystem: [
    'בדיקת שמן תיבת הילוכים',
    'תקינות פעולת תיבת ההילוכים',
  ],
  tires: [
    'מצב צמיגים + חישוקים',
  ],
  workTest: [
    'בדיקת הכלי בעבודה',
    'התחממות מנוע',
    'כושר נסיעה/עצירה בכביש',
  ],
  levels: [
    'בדיקת מצב שולחן וסוכן',
  ],
  compactor: [
    'עבודת המכבש בויברציה',
    'בדיקת פעולת המדחס',
    'דליפות אוויר בצנרת',
    'דליפת אוויר מהמיכל ומהמערכות',
    'תקינות מערכת רצועות',
  ],
  scarifier: [
    'מערכת הידרוסטטית בהפעלת תוף',
    'מערכת רצועות להפעלת תוף',
    'משאבת שמן תוף',
    'מנוע הידרוסטטי תוף',
    'תוף מצב כללי/מסבים',
    'אצבעות בתוף חסרים/שבורים',
    'מיכל מים',
    'משאבת מים',
    'מערכת פיזור',
    'צנרת מים',
    'מספר גלילונים לא תקינים',
    'מסוע עליון',
    'מצב כללי סרט',
    'מנוע מסוע עליון/תחתון',
    'מבחן עבודה',
    'נסיעה קדימה אחורה',
    'סיבוב תוף אחורה/קדימה',
    'הפעלת מערכת הקרצוף בעומס מלא',
    'התקדמות בתיאום נסיעה/קרצוף',
  ],
}

export const SECTION_LABELS = {
  documents:       'מסמכים',
  operatorCabin:   'תא מפעיל',
  engineCheck:     'בדיקת מנוע',
  steeringSystem:  'מערכת ההיגוי',
  hydraulicSystem: 'מערכת ההידראולית',
  brakes:          'בלמים',
  wheelSteering:   'מערכת היגוי אופני',
  trackSystem:     'מערכת הזחל',
  gearSystem:      'מערכת הילוכים',
  tires:           'צמיגים-אופני',
  workTest:        'מבחן עבודה',
  levels:          'מפלסות',
  compactor:       'מכבש',
  scarifier:       'מקרפפת',
}

export const FORM_PAGES = [
  {
    title: 'עמוד 1',
    sections: ['documents', 'operatorCabin', 'engineCheck', 'steeringSystem', 'hydraulicSystem', 'brakes', 'wheelSteering', 'trackSystem', 'gearSystem'],
  },
  {
    title: 'עמוד 2',
    sections: ['tires', 'workTest', 'levels', 'compactor', 'scarifier'],
  },
  {
    title: 'נזקים',
    sections: [],
  },
  {
    title: 'חתימות',
    sections: [],
    defaultOpen: 'documenter',
  },
]

export const SIGNATURE_BLOCKS = [
  {
    key: 'documenter',
    title: 'פרטי המתעד',
    fields: [
      { key: 'fullName', label: 'שם מלא' },
      { key: 'idNumber', label: "מס' אישי / ת.ז." },
      { key: 'date',     label: 'תאריך', type: 'date' },
      { key: 'notes',    label: 'הערות' },
    ],
  },
  {
    key: 'vehicleHandover',
    title: 'פרטי מוסר הכלי',
    fields: [
      { key: 'fullName',          label: 'שם מלא' },
      { key: 'idNumber',          label: 'ת.ז.' },
      { key: 'date',              label: 'תאריך', type: 'date' },
      { key: 'isRegisteredOwner', label: 'בעל הרכב רשום ברישיון?', type: 'toggle' },
    ],
  },
  {
    key: 'enlistmentClerk',
    title: 'פרטי פקיד הגיוס',
    formTypes: ['enlistment'],
    fields: [
      { key: 'fullName', label: 'שם מלא' },
      { key: 'idNumber', label: "מס' אישי / ת.ז." },
      { key: 'date',     label: 'תאריך', type: 'date' },
      { key: 'notes',    label: 'הערות' },
    ],
  },
  {
    key: 'creditingClerk',
    title: 'פרטי פקיד מזכה',
    formTypes: ['release'],
    fields: [
      { key: 'fullName', label: 'שם מלא' },
      { key: 'idNumber', label: "מס' אישי / ת.ז." },
      { key: 'date',     label: 'תאריך', type: 'date' },
      { key: 'notes',    label: 'הערות' },
    ],
  },
  {
    key: 'regularUnitRep',
    title: 'פרטי נציג יחידת סדיר',
    fields: [
      { key: 'fullName', label: 'שם מלא' },
      { key: 'idNumber', label: "מס' אישי / ת.ז." },
      { key: 'date',     label: 'תאריך', type: 'date' },
      { key: 'notes',    label: 'הערות' },
    ],
  },
  {
    key: 'vehiclePresence',
    title: 'אישור התייצבות הכלי לצה"ל בתרגיל',
    fields: [
      { key: 'licensePlate',  label: "מס' רישוי" },
      { key: 'date',          label: 'תאריך', type: 'date' },
      { key: 'clerkIdNumber', label: "פקיד הגיוס — מס' אישי" },
      { key: 'clerkFullName', label: 'פקיד הגיוס — שם מלא' },
    ],
  },
]

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
    sections: Object.fromEntries(
      Object.entries(SECTION_ITEMS).map(([key, items]) => [
        key,
        items.map((label) => ({ label, value: null })),
      ])
    ),
    damageTable: [
      { location: '', description: '' },
      { location: '', description: '' },
      { location: '', description: '' },
    ],
    signatures: {
      documenter:      { fullName: '', idNumber: '', date: '', notes: '', signatureImage: null },
      vehicleHandover: { fullName: '', idNumber: '', date: '', isRegisteredOwner: null, signatureImage: null },
      enlistmentClerk: { fullName: '', idNumber: '', date: '', notes: '', signatureImage: null },
      creditingClerk:  { fullName: '', idNumber: '', date: '', notes: '', signatureImage: null },
      regularUnitRep:  { fullName: '', idNumber: '', date: '', notes: '', signatureImage: null },
      vehiclePresence: { licensePlate: '', date: '', clerkIdNumber: '', clerkFullName: '', signatureImage: null },
    },
    status: 'draft',
  }
}
