import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { setFamilyCurrency } from '../utils/currency'
import { setFamilyTimezone } from '../utils/familyTime'
import {
  GetAllFamilyMembers,
  GetAllUsers,
  GetChildUsers,
  GetFamilyCurrency,
  GetFamilyTimezone,
  GetUserProfile,
  SetFamilyCurrency,
  SetFamilyTimezone,
  SetMemberAway,
} from '../utils/Fetcher'
import { offlineDB } from '../utils/OfflineDB'

// Helper to check if we have a valid token
const isTokenValid = () => {
  const token = localStorage.getItem('token')
  if (!token) return false

  const expiry = localStorage.getItem('token_expiry')
  if (!expiry) return true // No expiry set, assume valid

  return new Date() < new Date(expiry)
}

export const useAllUsers = () => {
  return useQuery({
    queryKey: ['allUsers'],
    queryFn: GetAllUsers,
  })
}

export const useFamilyMembers = () => {
  const queryClient = useQueryClient()
  const token = localStorage.getItem('token')

  const { data, error, isLoading } = useQuery({
    queryKey: ['allFamilyMembers'],
    queryFn: async () => {
      try {
        const result = await GetAllFamilyMembers()
        // Cache for offline use
        if (result?.res) {
          offlineDB.saveKV('family_members', result.res).catch(() => {})
        }
        return result
      } catch {
        const cached = await offlineDB.getKV('family_members')
        if (cached) return { res: cached }
        return { res: [] }
      }
    },
    // NavBar's avatar mounts this on every route, including the signed-out
    // ones. Without the gate the 401 tips ApiClient into a forced logout that
    // hard-navigates to /login — which is what used to eat family invites.
    enabled: !!token,
  })

  const handleRefetch = () => {
    queryClient.invalidateQueries({ queryKey: ['allFamilyMembers'] })
  }

  return { data, error, isLoading, handleRefetch }
}

// Marks a child away (at the other parent's home) or back home. Her tasks,
// streak and quests wait while she is away.
export const useSetMemberAway = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: ({ away, memberId }) => SetMemberAway(memberId, away),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFamilyMembers'] })
      queryClient.invalidateQueries({ queryKey: ['chores'] })
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

// The family's time zone, which every date shown follows. Setting it here
// makes moment use it everywhere.
export const useFamilyTimezone = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: ['familyTimezone'],
    queryFn: async () => {
      const result = await GetFamilyTimezone()
      setFamilyTimezone(result.res?.timezone)
      return result.res
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!localStorage.getItem('token'),
  })

// What the family earns: setting it gives its words to every text.
export const useFamilyCurrency = ({ enabled = true } = {}) =>
  useQuery({
    queryKey: ['familyCurrency'],
    queryFn: async () => {
      const result = await GetFamilyCurrency()
      setFamilyCurrency(result.res?.currency)
      return result.res
    },
    staleTime: 10 * 60 * 1000,
    enabled: enabled && !!localStorage.getItem('token'),
  })

export const useSetFamilyCurrency = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: currency => SetFamilyCurrency(currency),
    onSuccess: result => {
      setFamilyCurrency(result.res?.currency)
      queryClient.setQueryData(['familyCurrency'], result.res)
    },
  })
}

// Moves the family to another time zone, such as on holiday; tasks keep
// their time of day.
export const useSetFamilyTimezone = () => {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: timezone => SetFamilyTimezone(timezone),
    onSuccess: result => {
      setFamilyTimezone(result.res?.timezone)
      queryClient.setQueryData(['familyTimezone'], result.res)
      queryClient.invalidateQueries({ queryKey: ['chores'] })
      queryClient.invalidateQueries({ queryKey: ['games'] })
    },
  })
}

export const useUserProfile = ({ enabled = true } = {}) => {
  const queryClient = useQueryClient()
  const token = localStorage.getItem('token')

  const { data, error, isLoading } = useQuery({
    queryKey: ['userProfile', token],
    queryFn: async () => {
      if (!token) {
        return null
      }

      try {
        const resp = await GetUserProfile()
        const result = await resp.json()
        // if we got 403 then user probably deleted their account and token is still valid. navigate to login
        if (result?.res) {
          await offlineDB.saveKV('user_profile', result.res)
        }
        return result.res || null
      } catch {
        // API unreachable — only serve cached profile for authenticated sessions
        return await offlineDB.getKV('user_profile')
      }
    },
    staleTime: 30 * 60 * 1000,
    gcTime: 30 * 60 * 1000,
    enabled: enabled && !!token,
  })
  return {
    data,
    error,
    isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['userProfile'] }),
  }
}

export const useChildUsers = () => {
  const queryClient = useQueryClient()

  const { data, error, isLoading } = useQuery({
    queryKey: ['childUsers'],
    queryFn: async () => {
      if (!isTokenValid()) {
        return null
      }
      const resp = await GetChildUsers()
      const result = await resp.json()
      return result.res || []
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    gcTime: 10 * 60 * 1000, // 10 minutes
  })

  return {
    data,
    error,
    isLoading,
    refetch: () => queryClient.invalidateQueries({ queryKey: ['childUsers'] }),
  }
}
