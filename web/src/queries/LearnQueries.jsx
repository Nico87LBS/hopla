import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  EditLearnCard,
  GetLearnCatalogue,
  GetLearnDetail,
  GetLearnModules,
  GetLearnPlayer,
  GetLearnStats,
  ImportLearnModule,
  InstallLearnModule,
  RemoveLearnModule,
  ResolveLearnReport,
  SendLearnGame,
  SendLearnReport,
  SetLearnActivation,
  SetLearnSetting,
} from '../utils/Fetcher'
import {
  flushQueue,
  flushReports,
  loadPlayer,
  queueReport,
  savePlayer,
} from '../utils/learn/store'

export const learnKeys = {
  catalogue: ['learn', 'catalogue'],
  detail: key => ['learn', 'detail', key],
  modules: ['learn', 'modules'],
  player: userId => ['learn', 'player', userId],
  stats: key => ['learn', 'stats', key],
}

// sendWaitingGames sends the games and reports kept offline; it never
// throws.
export const sendWaitingGames = async () => {
  await flushReports(SendLearnReport).catch(() => {})
  return flushQueue(SendLearnGame).catch(() => [])
}

// sendReport sends a report on a question, or keeps it for later when the
// server is out of reach. A report refused throws.
export const sendReport = async report => {
  try {
    await SendLearnReport(report)
  } catch (err) {
    if (err?.status >= 400 && err.status < 500 && err.status !== 401) {
      throw err
    }
    queueReport(report)
  }
}

// usePlayer is what a person plays, from the server when it answers, else as
// this device last kept it, so games go on offline.
export const usePlayer = userId =>
  useQuery({
    queryKey: learnKeys.player(userId),
    enabled: !!userId,
    networkMode: 'always',
    queryFn: async () => {
      await sendWaitingGames()
      try {
        const player = await GetLearnPlayer(userId)
        savePlayer(player)
        return { ...player, offline: false }
      } catch (err) {
        const kept = loadPlayer(userId)
        if (kept && !(err?.status >= 400 && err.status < 500)) {
          return { ...kept, offline: true }
        }
        throw err
      }
    },
  })

export const useLearnCatalogue = () =>
  useQuery({ queryKey: learnKeys.catalogue, queryFn: GetLearnCatalogue })

export const useLearnStats = key =>
  useQuery({
    queryKey: learnKeys.stats(key),
    queryFn: () => GetLearnStats(key),
  })

export const useLearnDetail = key =>
  useQuery({
    queryKey: learnKeys.detail(key),
    queryFn: () => GetLearnDetail(key),
  })

export const useLearnModules = () =>
  useQuery({ queryKey: learnKeys.modules, queryFn: GetLearnModules })

// useLearnChange runs a change to the modules and refreshes what it touches.
const useLearnChange = mutationFn => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn,
    onSuccess: res => {
      if (res?.modules) queryClient.setQueryData(learnKeys.modules, res)
      queryClient.invalidateQueries({ queryKey: ['learn'] })
    },
  })
}

export const useInstallModule = () => useLearnChange(InstallLearnModule)
export const useImportModule = () => useLearnChange(ImportLearnModule)
export const useRemoveModule = () => useLearnChange(RemoveLearnModule)
export const useSetActivation = () => useLearnChange(SetLearnActivation)
export const useSetSetting = () => useLearnChange(SetLearnSetting)
export const useEditCard = () => useLearnChange(EditLearnCard)
export const useResolveReport = () => useLearnChange(ResolveLearnReport)
