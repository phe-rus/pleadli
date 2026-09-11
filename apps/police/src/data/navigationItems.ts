import {
  AlarmClock,
  AlertCircleIcon,
  ArchiveIcon,
  BarChartIcon,
  BinocularsIcon,
  Building06Icon,
  Car01Icon,
  CellsIcon,
  DashboardBrowsingIcon,
  File02Icon,
  FileIcon,
  FingerPrintCheckIcon,
  FolderViewIcon,
  GunIcon,
  ListViewIcon,
  Mic01Icon,
  Notebook01Icon,
  Search01Icon,
  Share08Icon,
  ShieldKeyIcon,
  SirenIcon,
  UserGroupIcon,
  UserIcon,
} from '@hugeicons/core-free-icons'

export const stationNav = [
  { icon: DashboardBrowsingIcon, label: 'Overview', to: '/', exact: true },
  // Quick Global Search
  {
    icon: Search01Icon,
    label: 'Search',
    to: '/search',
    children: [
      { icon: UserGroupIcon, label: 'People', to: '/search/people' },
      { icon: FileIcon, label: 'Files', to: '/search/files' },
      // Custody & Legal Compliance
      { icon: CellsIcon, label: 'Cell Lock-up & 48h', to: '/search/custody' },
      { icon: AlarmClock, label: 'Bonds & Sureties', to: '/search/bonds' },
    ]
  },
  // Counter & Initial Intake
  { icon: Notebook01Icon, label: 'Station Diary (SD)', to: '/sd-log' },
  { icon: SirenIcon, label: 'Incidents', to: '/incidents' },
  { icon: FolderViewIcon, label: 'Case Intake', to: '/intake' },
  // CID & Investigations Pipeline
  { icon: BinocularsIcon, label: 'Investigations', to: '/investigations' },
  { icon: Mic01Icon, label: 'Statements', to: '/statements' },
  { icon: FingerPrintCheckIcon, label: 'Evidence & Exhibits', to: '/evidence' },
  { icon: File02Icon, label: 'Charge Sheets & Forms', to: '/legal-forms' },
  // Stores, Armory & Assets
  {
    icon: ArchiveIcon,
    label: 'Stores & Armory',
    to: '/stores',
    children: [
      { icon: GunIcon, label: 'Armory Register', to: '/stores/armory' },
      { icon: ArchiveIcon, label: 'Impounded Assets', to: '/stores/impounded' },
    ]
  },
  { icon: Car01Icon, label: 'Vehicles', to: '/vehicles' },
  // Operational Support & Station Admin
  { icon: Share08Icon, label: 'Referrals & Dispatches', to: '/referrals' },
  { icon: UserIcon, label: 'Duty Roster', to: '/roster' },
  { icon: BarChartIcon, label: 'Reports & Analytics', to: '/reports' },
  {
    icon: Building06Icon,
    label: 'Station Admin',
    to: '/station',
    children: [
      { icon: Building06Icon, label: 'Profile', to: '/station/profile' },
      { icon: UserGroupIcon, label: 'Establishment', to: '/station/establishment' },
      { icon: ShieldKeyIcon, label: 'Officers', to: '/station/officers' },
    ]
  },
  {
    icon: ListViewIcon,
    label: 'Logs',
    to: '/logs',
    children: [
      { icon: AlertCircleIcon, label: 'Backup Requests', to: '/logs/backup-alerts' },
      { icon: ListViewIcon, label: 'Remote Access Activity', to: '/logs/remote-access' },
    ]
  },
] as const