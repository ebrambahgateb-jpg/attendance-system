// ═══════════════════════════════════════════════════════
//   Tabs Registry — Single Source of Truth
// ═══════════════════════════════════════════════════════

export const WORKSPACES = {
  OWNER: { id: 'Owner', label: 'واجهة المالك', icon: '👑', description: 'إدارة كاملة للنظام' },
  ADMIN: { id: 'Admin', label: 'واجهة المدير', icon: '⚙️', description: 'إدارة كاملة ما عدا الحسابات والإعدادات' },
  SCANNER: { id: 'Scanner', label: 'واجهة الماسح', icon: '📷', description: 'المسح وتسجيل الحضور' },
  USER: { id: 'User', label: 'واجهة المستخدم', icon: '🎭', description: 'حسابي، حضوري، الأحداث' }
};

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
    workspaces: ['User', 'Scanner'],
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
    id: 'schedule',
    label: 'الجدول',
    icon: '📊',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadScheduleLazy',
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
    handler: 'loadReportsLazy',
    isPage: false
  },
  {
    id: 'logs',
    label: 'السجلات',
    icon: '📋',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: 'loadLogsLazy',
    isPage: false
  },
    {
    id: 'chat',
    label: 'الرسائل',
    icon: '💬',
    workspaces: ['Owner', 'Admin', 'Scanner', 'User'],
    ownerOnly: false,
    handler: 'loadChatLazy',
    isPage: false
  },
  {
    id: 'archive',
    label: 'الأرشيف',
    icon: '📦',
    workspaces: ['Owner', 'Admin'],
    ownerOnly: false,
    handler: 'loadArchiveLazy',
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

export const EDITABLE_TABS = TABS_REGISTRY.filter(t => !t.ownerOnly);
export const OWNER_ONLY_TABS = TABS_REGISTRY.filter(t => t.ownerOnly);

export const OWNER_ONLY_TAB_IDS = OWNER_ONLY_TABS.map(t => t.id);
export const EDITABLE_TAB_IDS = EDITABLE_TABS.map(t => t.id);
export const ALL_TAB_IDS = TABS_REGISTRY.map(t => t.id);

export function getTabsForWorkspace(workspaceId) {
  return TABS_REGISTRY.filter(tab => tab.workspaces && tab.workspaces.includes(workspaceId));
}

export function getTabById(id) {
  return TABS_REGISTRY.find(t => t.id === id);
}

export function getWorkspaceById(id) {
  return Object.values(WORKSPACES).find(w => w.id === id);
}

export function getWorkspaceTabIds(workspaceId) {
  return getTabsForWorkspace(workspaceId).map(t => t.id);
}
