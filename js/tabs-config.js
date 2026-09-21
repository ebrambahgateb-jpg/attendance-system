// ═══════════════════════════════════════════════════════
//   Tabs Registry — Single Source of Truth
//   ⚡ أضف أي تاب جديد هنا وسيظهر تلقائيًا في كل مكان
// ═══════════════════════════════════════════════════════

// ═══════════════════════════════════════════════════════
//   ⚡ الواجهات (Workspaces)
// ═══════════════════════════════════════════════════════
export const WORKSPACES = {
  OWNER: {
    id: 'Owner',
    label: 'واجهة المالك',
    icon: '👑',
    description: 'إدارة كاملة للنظام'
  },
  ADMIN: {
    id: 'Admin',
    label: 'واجهة المدير',
    icon: '⚙️',
    description: 'إدارة كاملة ما عدا الحسابات والإعدادات'
  },
  SCANNER: {
    id: 'Scanner',
    label: 'واجهة الماسح',
    icon: '📷',
    description: 'المسح وتسجيل الحضور'
  },
  USER: {
    id: 'User',
    label: 'واجهة المستخدم',
    icon: '🎭',
    description: 'حسابي، حضوري، الأحداث'
  }
};

// ═══════════════════════════════════════════════════════
//   ⚡ التابات (Tabs Registry)
//   workspace: الواجهة اللي التاب بيظهر فيها
// ═══════════════════════════════════════════════════════
export const TABS_REGISTRY = [
  {
    id: 'dashboard',
    label: 'لوحة التحكم',
    icon: '🏠',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadDashboardInit',
    isPage: false
  },
  {
    id: 'profile',
    label: 'حسابي',
    icon: '👤',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadProfileLazy',
    isPage: false
  },
  {
    id: 'my-events',
    label: 'حضوري',
    icon: '🎯',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadMyEventsLazy',
    isPage: false
  },
  {
    id: 'my-attendance',
    label: 'سجل حضورك بنفسك',
    icon: '📱',
    workspaces: ['Owner', 'Admin', 'Scanner'],
    ownerOnly: false,
    handler: 'loadMyAttendanceLazy',
    isPage: false
  },
  {
    id: 'scanner',
    label: 'الماسح',
    icon: '📷',
    workspaces: ['Owner', 'Admin', 'Scanner'],
    ownerOnly: false,
    handler: null,
    isPage: true,
    pageUrl: 'scanner.html'
  },
  {
    id: 'events',
    label: 'الأحداث',
    icon: '📅',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadEventsLazy',
    isPage: false
  },
  {
    id: 'people',
    label: 'الأشخاص',
    icon: '👥',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: 'loadPeopleLazy',
    isPage: false
  },
  {
    id: 'attendance',
    label: 'الحضور',
    icon: '✅',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: 'loadAttendanceLazy',
    isPage: false
  },
  {
    id: 'reports',
    label: 'التقارير',
    icon: '📈',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: null,
    isPage: false
  },
  {
    id: 'logs',
    label: 'السجلات',
    icon: '📋',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: null,
    isPage: false
  },
  {
    id: 'archive',
    label: 'الأرشيف',
    icon: '📦',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: null,
    isPage: false
  },
  {
    id: 'accounts',
    label: 'الحسابات',
    icon: '🔑',
    workspaces: ['Owner'],
    ownerOnly: true,
    handler: 'loadAccountsLazy',
    isPage: false
  },
  {
    id: 'settings',
    label: 'الإعدادات',
    icon: '⚙️',
    workspaces: ['Owner'],
    ownerOnly: true,
    handler: 'loadSettingsLazy',
    isPage: false
  }
];

// ═══════════════════════════════════════════════════════
//   Helpers
// ═══════════════════════════════════════════════════════

// ⚡ التابات المتاحة للتعديل (بدون owner-only)
export const EDITABLE_TABS = TABS_REGISTRY.filter(t => !t.ownerOnly);

// ⚡ التابات الخاصة بالـOwner فقط
export const OWNER_ONLY_TABS = TABS_REGISTRY.filter(t => t.ownerOnly);

// ⚡ قائمة الـIDs
export const OWNER_ONLY_TAB_IDS = OWNER_ONLY_TABS.map(t => t.id);
export const EDITABLE_TAB_IDS = EDITABLE_TABS.map(t => t.id);
export const ALL_TAB_IDS = TABS_REGISTRY.map(t => t.id);

// ⚡ جلب تابات واجهة معينة
export function getTabsForWorkspace(workspaceId) {
  return TABS_REGISTRY.filter(tab =>
    tab.workspaces && tab.workspaces.includes(workspaceId)
  );
}

// ⚡ جلب تاب بالـ ID
export function getTabById(id) {
  return TABS_REGISTRY.find(t => t.id === id);
}

// ⚡ جلب workspace بالـ ID
export function getWorkspaceById(id) {
  return Object.values(WORKSPACES).find(w => w.id === id);
}

// ⚡ كل الـ IDs المتاحة للـ workspace
export function getWorkspaceTabIds(workspaceId) {
  return getTabsForWorkspace(workspaceId).map(t => t.id);
}
