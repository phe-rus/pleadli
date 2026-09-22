import { overviewOptions, pendingRequestsOptions, stationsOptions } from '@/features/command'
import { installationOptions } from '@/features/session'
import { OverviewSwitch } from '@/features/overview'
import { backupAlertsOptions } from '@/features/officers'
import { recentActivityOptions } from '@/features/activity'
import { casesOptions } from '@/features/cases'
import { custodyRecordsOptions } from '@/features/custody'
import { dutyAssignmentsOptions } from '@/features/duty'
import { referralsOptions } from '@/features/referrals'
import { stationDiaryOptions } from '@/features/station-diary'
import { statementsOptions } from '@/features/statements'
import { stationProfileOptions } from '@/features/station-admin'
import { createFileRoute } from '@tanstack/react-router'

export const Route = createFileRoute('/_public/')({
  loader: async ({ context }) => {
    // A command holds no station records, so it reads its own figures instead.
    const installation = await context.queryClient.ensureQueryData(installationOptions())
    if (installation.mode === 'command') {
      await Promise.all([
        context.queryClient.query({ ...overviewOptions(), staleTime: 'static' }),
        context.queryClient.query({ ...stationsOptions(), staleTime: 'static' }),
        context.queryClient.query({ ...pendingRequestsOptions(), staleTime: 'static' }),
      ])
      return
    }
    await Promise.all([
      context.queryClient.query({ ...custodyRecordsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...casesOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...stationDiaryOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...dutyAssignmentsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...statementsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...stationProfileOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...backupAlertsOptions(), staleTime: 'static' }),
      context.queryClient.query({ ...referralsOptions(''), staleTime: 'static' }),
      context.queryClient.query({ ...recentActivityOptions(), staleTime: 'static' }),
    ])
  },
  component: OverviewSwitch,
})
