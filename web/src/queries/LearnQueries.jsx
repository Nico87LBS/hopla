import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import {
  GetLearnCatalogue,
  GetLearnModules,
  GetLearnPlayer,
  ImportLearnModule,
  InstallLearnModule,
  RemoveLearnModule,
  SendLearnGame,
  SetLearnActivation,
} from '../utils/Fetcher'
import { flushQueue, loadPlayer, savePlayer } from '../utils/learn/store'

export const learnKeys = {
  catalogue: ['learn', 'catalogue'],
  modules: ['learn', 'modules'],
  player: userId => ['learn', 'player', userId],
}

// sendWaitingGames sends the games played offline; it never throws.
export const sendWaitingGames = () => flushQueue(SendLearnGame).catch(() => [])

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
