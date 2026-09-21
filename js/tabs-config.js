// ═══════════════════════════════════════════════════════
//   Tabs Registry — Single Source of Truth
//   ⚡ أضف أي تاب جديد هنا وسيظهر تلقائيًا في كل مكان
// ═══════════════════════════════════════════════════════

export const TABS_REGISTRY = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    icon: '🏠',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin', 'Scanner', 'User'],
    handler: 'loadDashboardInit',
    isPage: false
  },
  {
    id: 'profile',
    label: 'حسابي',
    icon: '👤',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin', 'Scanner', 'User'],
    handler: 'loadProfileLazy',
    isPage: false
  },
  {
    id: 'my-attendance',
    label: 'سجل حضورك بنفسك',
    icon: '📱',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin', 'Scanner'],
    handler: 'loadMyAttendanceLazy',
    isPage: false
  },
  {
    id: 'scanner',
    label: 'الماسح',
    icon: '📷',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin', 'Scanner'],
    handler: null,          // ⚡ صفحة منفصلة
    isPage: true,
    pageUrl: 'scanner.html'
  },
  {
    id: 'events',
    label: 'الأحداث',
    icon: '🎯',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin', 'Scanner', 'User'],
    handler: 'loadEventsLazy',
    isPage: false
  },
  {
    id: 'people',
    label: 'الأشخاص',
    icon: '👥',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin'],
    handler: 'loadPeopleLazy',
    isPage: false
  },
  {
    id: 'attendance',
    label: 'الحضور',
    icon: '✅',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin'],
    handler: 'loadAttendanceLazy',
    isPage: false
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: '📈',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin'],
    handler: null,
    isPage: false
  },
  {
    id: 'logs',
    label: 'السجلات',
    icon: '📋',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin'],
    handler: null,
    isPage: false
  },
  {
    id: 'archive',
    label: 'الأرشيف',
    icon: '📦',
    ownerOnly: false,
    defaultRoles: ['Owner', 'Admin'],
    handler: null,
    isPage: false
  },
  {
    id: 'accounts',
    label: 'الحسابات',
    icon: '🔑',
    ownerOnly: true,       // ⚡ Owner فقط
    defaultRoles: ['Owner'],
    handler: 'loadAccountsLazy',
    isPage: false
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: '⚙️',
    ownerOnly: true,       // ⚡ Owner فقط
    defaultRoles: ['Owner'],
    handler: 'loadSettingsLazy',
    isPage: false
  }
];

// ⚡ التابات المتاحة للتعديل (بدون owner-only)
export const EDITABLE_TABS = TABS_REGISTRY.filter(t => !t.ownerOnly);

// ⚡ التابات الخاصة بالـOwner فقط
export const OWNER_ONLY_TABS = TABS_REGISTRY.filter(t => t.ownerOnly);

// ⚡ قائمة الـIDs
export const OWNER_ONLY_TAB_IDS = OWNER_ONLY_TABS.map(t => t.id);
export const EDITABLE_TAB_IDS = EDITABLE_TABS.map(t => t.id);
export const ALL_TAB_IDS = TABS_REGISTRY.map(t => t.id);

// ⚡ default permissions محسوبة تلقائيًا
export const DEFAULT_TAB_PERMISSIONS = {
  User: TABS_REGISTRY
    .filter(t => t.defaultRoles.includes('User'))
    .map(t => t.id),
  Admin: TABS_REGISTRY
    .filter(t => t.defaultRoles.includes('Admin'))
    .map(t => t.id),
  Scanner: TABS_REGISTRY
    .filter(t => t.defaultRoles.includes('Scanner'))
    .map(t => t.id)
};

// ⚡ Helper: جلب تاب بالـ ID
export function getTabById(id) {
  return TABS_REGISTRY.find(t => t.id === id);
}
