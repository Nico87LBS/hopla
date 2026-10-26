import { useCallback, useMemo, useState } from 'react'

import { useUserProfile } from '../../../queries/UserQueries'
import { applyFilter } from '../../../utils/FilterEngine'

// The task list's filter of the moment: a label, a person, an insight or
// conditions picked in the filter sheet. Nothing is saved.
export const useCustomFilters = (chores, membersData, labels) => {
  const { data: userProfile } = useUserProfile()

  const [tempFilter, setTempFilter] = useState(null)
  const [tempFilterMeta, setTempFilterMeta] = useState(null)

  const context = useMemo(
    () => ({
      userId: userProfile?.id,
      members: membersData || [],
      labels: labels || [],
    }),
    [userProfile?.id, membersData, labels],
  )

  const hasFilterApplied = tempFilter !== null

  const filteredChores = useMemo(
    () => (tempFilter ? applyFilter(chores, tempFilter, context) : chores),
    [chores, tempFilter, context],
  )

  const clearActiveFilter = useCallback(() => {
    setTempFilter(null)
    setTempFilterMeta(null)
  }, [])

  const applyTempFilter = useCallback((filter, meta = null) => {
    setTempFilter(filter)
    setTempFilterMeta(meta)
  }, [])

  return {
    tempFilter,
    tempFilterMeta,
    filteredChores,
    clearActiveFilter,
    applyTempFilter,
    clearTempFilter: clearActiveFilter,
    hasFilterApplied,
  }
}
