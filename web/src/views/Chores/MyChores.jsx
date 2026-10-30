import {
  Add,
  CalendarMonth,
  Check,
  CloudOff,
  EditCalendar,
  ExpandMore,
  Person,
  Remove,
  SearchOff,
  Style,
} from '@mui/icons-material'
import {
  Accordion,
  AccordionDetails,
  AccordionGroup,
  Box,
  Container,
  Typography,
} from '@mui/joy'
import { useMediaQuery } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import moment from 'moment'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate, useSearchParams } from 'react-router-dom'

import EmptyState from '../../components/common/EmptyState'
import { useImpersonateUser } from '../../contexts/ImpersonateUserContext.jsx'
import { useNavBarTitle } from '../../contexts/NavBarTitleContext'
import { useFilter } from '../../hooks/useFilter'
import { useChores, useRoutinesToday } from '../../queries/ChoreQueries'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  ChoreFilters,
  ChoresGrouper,
  ChoreSorter,
  isTaskFor,
} from '../../utils/Chores'
import { familyDay, fromPickedDay, pickedDay } from '../../utils/familyTime'
import { awayMemberIds, waitsForAbsent } from '../../utils/presence.js'
import { withoutWaitingSteps } from '../../utils/routines.js'
import { pullCopiesTogether } from '../../utils/taskSlots'
import TaskInput from '../components/AddTaskModal'
import CalendarDual from '../components/CalendarDual'
import CalendarMonthly from '../components/CalendarMonthly.jsx'
import LoadingComponent from '../components/Loading'
import { OPEN_QUICK_ADD_EVENT } from '../components/navigationEvents'
import { useLabels } from '../Labels/LabelQueries'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import ChoreListView from './ChoreListView.jsx'
import ChoreModals from './components/ChoreModals'
import ChoreToolbar from './components/ChoreToolbar'
import {
  conditionsToSelections,
  selectionsToConditions,
} from './components/FilterBuilderContent'
import MultiSelectToolbar from './components/MultiSelectToolbar'
import { useChoreActions } from './hooks/useChoreActions'
import { useChoreFilters } from './hooks/useChoreFilters'
import { useChoreModals } from './hooks/useChoreModals'
import { useCustomFilters } from './hooks/useCustomFilters'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { useMultiSelect } from './hooks/useMultiSelect'
import Sidepanel from './Sidepanel'
import { INSIGHT_FILTER_DEFS } from './SmartInsightsCard'

// Mirrors the assignee options in the toolbar, phrased to drop into a
// sentence ("none of them are assigned to you").
// Which assignee filters describe a subset of "everyone" — the empty-state
// copy for each lives under `chores:empty.assignee.*` as a whole sentence,
// since the fragment ("assigned to you") cannot be slotted mid-sentence in
// every language.

const ASSIGNEE_FILTER_KEYS = [
  'assigned_to_me',
  'available_for_me',
  'assigned_to_others',
  'assigned_to_me_tasks',
  'created_by_me',
]

const sortChores = (a, b, sortBy, direction) => {
  const multiplier = direction === 'desc' ? -1 : 1

  if (sortBy === 'smart') return ChoreSorter(a, b) * multiplier

  const dateField =
    sortBy === 'due_date'
      ? 'nextDueDate'
      : sortBy === 'created_date'
        ? 'createdAt'
        : 'updatedAt'
  const dateA = a[dateField] || a[`${dateField.replace('At', '')}_at`]
  const dateB = b[dateField] || b[`${dateField.replace('At', '')}_at`]

  // Unscheduled/unknown dates remain at the end in either direction.
  if (!dateA && !dateB) return 0
  if (!dateA) return 1
  if (!dateB) return -1
  return (new Date(dateA).getTime() - new Date(dateB).getTime()) * multiplier
}

const MyChores = () => {
  const { data: userProfile, isLoading: isUserProfileLoading } =
    useUserProfile()
  const { t } = useTranslation('chores')
  const isLargeScreen = useMediaQuery(theme => theme.breakpoints.up('md'))
  const { showError, showSuccess, showUndo, showWarning } = useNotification()
  const queryClient = useQueryClient()
  const { impersonatedUser } = useImpersonateUser()
  const Navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const { data: userLabels, isLoading: userLabelsLoading } = useLabels()
  const {
    data: choresData,
    error: choresErrorDetails,
    isError: choresError,
    isLoading: choresLoading,
    refetch: refetchChores,
  } = useChores(false)
  const { data: routines } = useRoutinesToday()
  const {
    data: membersData,
    isError: membersError,
    isLoading: membersLoading,
  } = useCircleMembers()

  const [chores, setChores] = useState([])
  const [addTaskModalOpen, setAddTaskModalOpen] = useState(false)
  // 'voice' | 'scan' | null — set by the quick-capture widget deep links
  const searchInputRef = useRef(null)
  const [selectedChoreSection, setSelectedChoreSection] = useState(
    localStorage.getItem('selectedChoreSection') || 'default',
  )
  const [choreSortBy, setChoreSortBy] = useState(
    () => localStorage.getItem('choreSortBy') || 'smart',
  )
  const [choreSortDirection, setChoreSortDirection] = useState(
    () => localStorage.getItem('choreSortDirection') || 'asc',
  )
  const [openChoreSections, setOpenChoreSections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('openChoreSections')) || {}
    } catch {
      return {}
    }
  })
  // Last `filterId` we saw in the URL, so the URL → filter-state effect can tell
  // a real URL change from its own write-back.
  const lastUrlFilterIdRef = useRef(null)
  // While an incoming deep link is being applied, the existing temp filter is
  // stale for one render. Keep its URL-sync effect from writing that old value
  // back over the new deep link and causing the two filters to oscillate.
  const applyingUrlFilterIdRef = useRef(null)
  const openSectionsInitializedRef = useRef(
    localStorage.getItem('openChoreSections') !== null,
  )
  // A list or a calendar; the old 'compact' list is the list now.
  const [viewMode, setViewMode] = useState(() =>
    localStorage.getItem('choreCardViewMode') === 'calendar'
      ? 'calendar'
      : 'default',
  )
  const [selectedCalendarDate, setSelectedCalendarDate] = useState(new Date())
  const [confirmModelConfig, setConfirmModelConfig] = useState({})

  const {
    searchFilteredChores,
    searchTerm,
    selectedChoreFilter,
    setSearchTerm,
    setSelectedChoreFilterWithCache,
  } = useChoreFilters({
    chores,
    impersonatedUser,
    userProfile,
  })

  const {
    clearSelection,
    enterMultiSelectWithChore,
    getSelectedChoresData,
    getSelectionSummary,
    isMultiSelectMode,
    selectAllVisibleChores,
    selectedChores,
    toggleChoreSelection,
    toggleMultiSelectMode,
    toggleSectionSelection,
  } = useMultiSelect()

  const { activeModal, closeModal, modalChore, modalData, openModal } =
    useChoreModals()

  const {
    applyTempFilter,
    clearActiveFilter,
    clearTempFilter,
    filteredChores: customFilteredChores,
    hasFilterApplied,
    tempFilter,
    tempFilterMeta,
  } = useCustomFilters(searchFilteredChores, membersData?.res, userLabels)

  const handleLabelSelect = useCallback(
    label => {
      clearActiveFilter()
      setSearchTerm('')
      applyTempFilter(
        {
          conditions: [{ type: 'label', operator: 'is', value: [label.id] }],
          operator: 'AND',
        },
        { name: label.name },
      )
    },
    [applyTempFilter, clearActiveFilter, setSearchTerm],
  )

  const choreViewTitle = tempFilter
    ? tempFilterMeta?.name || t('common:navigation.filters')
    : t('common:navigation.today')
  const labelSelector = useMemo(() => {
    const conditions = tempFilter?.conditions || []
    const condition = conditions.length === 1 ? conditions[0] : null
    const values = Array.isArray(condition?.value)
      ? condition.value
      : condition?.value != null
        ? [condition.value]
        : []
    if (condition?.type !== 'label' || values.length !== 1) return null

    return {
      items: userLabels || [],
      onSelect: handleLabelSelect,
      selectedId: values[0],
      type: 'label',
    }
  }, [handleLabelSelect, tempFilter?.conditions, userLabels])
  useNavBarTitle(choreViewTitle, labelSelector)

  const quickFilterDefs = useMemo(
    () => [
      {
        id: 'status',
        label: t('chores:group.dueDate'),
        type: 'single-select',
        icon: <CalendarMonth />,
        options: [
          {
            value: 'Overdue',
            label: t('chores:group.overdue'),
            color: 'danger',
          },
          {
            value: 'Due today',
            label: t('chores:group.dueToday'),
            color: 'warning',
          },
          { value: 'Due in week', label: t('chores:group.dueThisWeek') },
          { value: 'Due Later', label: t('chores:group.dueLater') },
          { value: 'No Due Date', label: t('chores:group.noDueDate') },
          {
            value: 'Pending Approval',
            label: t('chores:group.pendingApproval'),
          },
        ],
        filterFn: (item, value) => {
          const now = new Date()
          const d = item.nextDueDate ? new Date(item.nextDueDate) : null
          switch (value) {
            case 'Overdue':
              return d !== null && d < now
            case 'Due today':
              return d !== null && moment(d).isSame(now, 'day')
            case 'Due in week':
              return (
                d !== null &&
                d < new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000) &&
                d > now
              )
            case 'Due Later':
              return (
                d !== null && d > new Date(now.getTime() + 24 * 60 * 60 * 1000)
              )
            case 'No Due Date':
              return item.nextDueDate === null
            case 'Pending Approval':
              return item.status === 3
            default:
              return true
          }
        },
      },
      ...(userLabels?.length > 0
        ? [
            {
              id: 'label',
              label: t('chores:labels.label'),
              type: 'multi-select',
              icon: <Style />,
              options: userLabels.map(l => ({
                value: l.id,
                label: l.name,
                icon: (
                  <Box
                    component='span'
                    sx={{
                      display: 'inline-block',
                      width: 10,
                      height: 10,
                      borderRadius: '50%',
                      bgcolor: l.color || '#90a4ae',
                      flexShrink: 0,
                    }}
                  />
                ),
              })),
              filterFn: (item, values) =>
                item.labelsV2?.some(l => values.includes(l.id)) ?? false,
            },
          ]
        : []),
    ],
    [userLabels],
  )

  const {
    clearAll: clearQuickFilters,
    filteredData: quickFilteredChores,
    hasActiveFilters: hasQuickFilters,
    setFilter: setQuickFilter,
  } = useFilter(chores, quickFilterDefs)

  const processedChores = useMemo(() => {
    if (!choresData?.res) {
      return []
    }

    // The tasks of a child who is away wait until she is back.
    const awayIds = awayMemberIds(membersData?.res)
    // The steps of a routine show one at a time.
    let sortedChores = withoutWaitingSteps(
      choresData.res.filter(chore => !waitsForAbsent(chore, awayIds)),
      routines,
      moment().endOf('day').toDate(),
    ).sort(ChoreSorter)

    if (impersonatedUser) {
      sortedChores = sortedChores.filter(
        chore =>
          chore.assignedTo === impersonatedUser.userId ||
          chore.assignees?.some(a => a.userId === impersonatedUser.userId) ||
          chore.isPrivate === false,
      )
    }

    return sortedChores
  }, [choresData?.res, membersData?.res, impersonatedUser, routines])

  const choreSections = useMemo(() => {
    if (!chores.length || !userProfile?.id) {
      return []
    }

    // Determine which chores to group based on active filter type
    let choresToGroup = chores
    if (tempFilter) {
      // Advanced/custom filter active
      choresToGroup = customFilteredChores
    } else if (hasQuickFilters) {
      // Quick filter active (Due date, Labels)
      choresToGroup = quickFilteredChores
    }

    const sections = ChoresGrouper(
      selectedChoreSection,
      choresToGroup,
      ChoreFilters(impersonatedUser?.userId || userProfile?.id)[
        selectedChoreFilter
      ],
      choreSortDirection,
    )

    const sorted = sections.map(section => ({
      ...section,
      content: [...section.content].sort((a, b) =>
        sortChores(a, b, choreSortBy, choreSortDirection),
      ),
    }))
    // Each child's copy of a task shows once, in the section of the first:
    // only for groupings where a task sits in one section.
    if (!['default', 'due_date'].includes(selectedChoreSection)) return sorted
    return pullCopiesTogether(sorted).filter(
      (section, index) =>
        section.content.length > 0 || sorted[index].content.length === 0,
    )
  }, [
    chores,
    quickFilteredChores,
    customFilteredChores,
    tempFilter,
    hasQuickFilters,
    selectedChoreSection,
    selectedChoreFilter,
    choreSortBy,
    choreSortDirection,
    impersonatedUser?.userId,
    userProfile?.id,
  ])

  useEffect(() => {
    if (
      !choresLoading &&
      !membersLoading &&
      userProfile?.id &&
      membersData?.res &&
      choresData?.res
    ) {
      // throw new Error('FAKE ERROR') // For testing Sentry error tracking
      const processEffectAsync = async () => {
        // Sync local state with query data to ensure updates are reflected
        setChores(processedChores)

        // Don't set choreSections here - let the dedicated effect handle it
      }

      processEffectAsync()
    }
  }, [
    membersLoading,
    choresLoading,
    isUserProfileLoading,
    choresData?.res,
    membersData?.res,
    processedChores, // Added to ensure local state syncs when query data updates
    userProfile,
    impersonatedUser?.userId,
  ])

  useEffect(() => {
    if (openSectionsInitializedRef.current || choreSections.length === 0) return

    openSectionsInitializedRef.current = true
    const openSections = choreSections.reduce((acc, _section, index) => {
      acc[index] = true
      return acc
    }, {})
    setOpenChoreSections(openSections)
  }, [choreSections])

  // A global-search result can hand a query back to the task list as a scoped filter.
  useEffect(() => {
    const query = searchParams.get('search')
    if (query !== null) {
      setSearchTerm(query.toLowerCase())
      setSelectedCalendarDate(null)
      clearActiveFilter()
      clearQuickFilters()
    }
    // The setters above are intentionally applied only when URL search params change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams])

  // The + of the navigation opens the quick add here.
  useEffect(() => {
    const onOpen = () => setAddTaskModalOpen(true)
    window.addEventListener(OPEN_QUICK_ADD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_QUICK_ADD_EVENT, onOpen)
  }, [])

  // /chores?add_task=1 opens the quick-add modal once, and strips the param
  // so back/refresh doesn't re-trigger it.
  useEffect(() => {
    if (searchParams.get('add_task') === '1') {
      setAddTaskModalOpen(true)
      const params = new URLSearchParams(searchParams)
      params.delete('add_task')
      setSearchParams(params, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // Read and apply filters from URL parameters
  useEffect(() => {
    // Check for filterId (camelCase) or filter_id (snake_case) for advanced filters
    const rawFilterId =
      searchParams.get('filterId') || searchParams.get('filter_id')
    // Parse as number since filter IDs from the API are numeric
    const filterId = rawFilterId ? Number(rawFilterId) || rawFilterId : null

    const oldFilter = searchParams.get('filter')

    // This effect restores state from the URL; the effect below pushes state
    // back into the URL. Only act when the URL itself actually changed —
    // otherwise switching insights (state changes first, URL a tick later)
    // makes the two effects fight and flip between the old and new insight.
    const urlFilterIdChanged = lastUrlFilterIdRef.current !== rawFilterId
    lastUrlFilterIdRef.current = rawFilterId

    // Restore smart insight temp filter from URL (e.g. on page reload)
    // Insight IDs are strings (e.g. 'overdue'), saved filter IDs are numeric
    if (
      filterId &&
      INSIGHT_FILTER_DEFS[filterId] &&
      urlFilterIdChanged &&
      tempFilterMeta?.id !== filterId
    ) {
      const def = INSIGHT_FILTER_DEFS[filterId]
      applyingUrlFilterIdRef.current = rawFilterId
      applyTempFilter(def.filter, {
        id: filterId,
        name: t(`insights.filters.${filterId}`, def.name),
      })
      return
    }

    // Deep link from a member's avatar/search result (e.g. filterId=assignedTo:42)
    // — the assignee condition already exists in FilterEngine, so this just
    // wires a member id straight into a temp filter, the same way an insight does.
    if (
      typeof filterId === 'string' &&
      filterId.startsWith('assignedTo:') &&
      urlFilterIdChanged &&
      tempFilterMeta?.id !== filterId
    ) {
      const memberId = filterId.slice('assignedTo:'.length)
      const member = (membersData?.res || []).find(
        m => String(m.userId) === String(memberId),
      )
      const memberName = member?.displayName || member?.name || member?.username
      applyingUrlFilterIdRef.current = rawFilterId
      applyTempFilter(
        {
          conditions: [
            {
              type: 'assignee',
              operator: 'is',
              // Match the type FilterBuilderContent's chip selection compares
              // against (`m.userId`, usually a number) — the raw URL slice is
              // always a string, and Array.includes is strict-equality.
              value: member ? member.userId : memberId,
            },
          ],
          operator: 'AND',
        },
        {
          id: filterId,
          name: memberName ? `Assigned to ${memberName}` : 'Assigned to',
          icon: <Person sx={{ fontSize: '2rem', color: 'primary.main' }} />,
        },
      )
      return
    }

    if (!chores.length) return

    // Handle legacy filter parameter (e.g., filter=unplanned)
    if (oldFilter && !hasQuickFilters) {
      const filterMap = {
        unplanned: 'No Due Date',
        overdue: 'Overdue',
        today: 'Due today',
        week: 'Due in week',
        later: 'Due Later',
        pending: 'Pending Approval',
      }

      const filterName = filterMap[oldFilter.toLowerCase()]
      if (filterName) {
        setQuickFilter('status', filterName)
        setViewMode('default')
        setSelectedCalendarDate(null)
      }
    }
  }, [
    searchParams,
    chores,
    hasQuickFilters,
    membersData,
    applyTempFilter,
    setQuickFilter,
    setViewMode,
    setSelectedCalendarDate,
  ])

  // Sync tempFilterMeta (smart insight) → URL using filterId param
  // Insight IDs are strings (e.g. 'overdue') so they don't conflict with numeric saved filter IDs
  useEffect(() => {
    const insightId = tempFilterMeta?.id
    const params = new URLSearchParams(searchParams)
    const currentFilterId = params.get('filterId')

    // URL → state takes one render. During that render `tempFilterMeta` still
    // describes the previously selected person/insight; writing it to the URL
    // would undo the incoming widget deep link. Once state catches up, release
    // the guard so normal in-app filter changes can keep syncing to the URL.
    if (applyingUrlFilterIdRef.current === currentFilterId) {
      if (insightId === currentFilterId) {
        applyingUrlFilterIdRef.current = null
      }
      return
    }

    if (insightId && currentFilterId !== insightId) {
      params.delete('filter_id')
      params.delete('filter')
      params.set('filterId', insightId)
      Navigate(
        { pathname: '/chores', search: params.toString() },
        { replace: true },
      )
    } else if (
      !insightId &&
      currentFilterId &&
      INSIGHT_FILTER_DEFS[currentFilterId]
    ) {
      // Only clear filterId if it was set by an insight (not a numeric saved filter)
      params.delete('filterId')
      Navigate(
        { pathname: '/chores', search: params.toString() },
        { replace: true },
      )
    }
  }, [tempFilterMeta?.id, searchParams])

  const {
    handleAssigneeChange,
    handleBulkArchive,
    handleBulkAssignee,
    handleBulkComplete,
    handleBulkDelete,
    handleBulkDueDate,
    handleBulkLabels,
    handleBulkSkip,
    handleChangeDueDate,
    handleChoreAction,
    handleCompleteWithNote,
    handleCompleteWithPastDate,
  } = useChoreActions({
    chores,
    setChores,
    userProfile,
    impersonatedUser,
    showSuccess,
    showError,
    showWarning,
    showUndo,
    refetchChores,
    setConfirmModelConfig,
    openModal,
    closeModal,
    modalChore,
    getSelectedChoresData,
    clearSelection,
  })

  const getFilteredChores = useMemo(() => {
    if (tempFilter) {
      return customFilteredChores
    }

    if (searchTerm?.length > 0) {
      return searchFilteredChores
    }

    return hasQuickFilters ? quickFilteredChores : chores
  }, [
    chores,
    tempFilter,
    customFilteredChores,
    hasQuickFilters,
    quickFilteredChores,
    searchFilteredChores,
    searchTerm,
  ])

  // Drives the bulk-edit sheet's controls (current value per field, which
  // labels are on all vs some). Only worth computing while selecting.
  const selectionSummary = useMemo(
    () => (isMultiSelectMode ? getSelectionSummary(chores) : null),
    [isMultiSelectMode, getSelectionSummary, chores],
  )

  const { showKeyboardShortcuts } = useKeyboardShortcuts({
    isMultiSelectMode,
    selectedChores,
    searchTerm,
    searchFilter:
      hasQuickFilters || searchTerm?.length > 0 ? 'filtered' : 'All',
    filteredChores: getFilteredChores,
    choreSections,
    openChoreSections,
    handlers: {
      onOpenTaskModal: () => setAddTaskModalOpen(true),
      onNavigateToCreate: () => Navigate('/chores/create'),
      onFocusSearch: () => searchInputRef.current?.focus(),
      onCloseSearch: () => {
        setSearchTerm('')
      },
      onToggleMultiSelect: toggleMultiSelectMode,
      onEnableMultiSelectAndSelectAll: () => {
        toggleMultiSelectMode()
        setTimeout(() => {
          selectAllVisibleChores(null, choreSections, openChoreSections)
        }, 0)
      },
      onSelectAll: () =>
        selectAllVisibleChores(null, choreSections, openChoreSections),
      onClearSelection: clearSelection,
      onBulkComplete: handleBulkComplete,
      onBulkSkip: handleBulkSkip,
      onBulkArchive: handleBulkArchive,
      onBulkDelete: handleBulkDelete,
      onNavigateToArchived: () => Navigate('/archived'),
      onShowMessage: showSuccess,
    },
  })

  // Clicking a label chip on a task card feeds the advanced filter
  // (as a temp filter) rather than the legacy quick filters. Clicking the same
  // chip again removes that value, so chips toggle.
  const handleLabelFiltering = chipClicked => {
    const type = 'label'
    const value = chipClicked.label?.id
    if (value === undefined || value === null) return

    const selections = conditionsToSelections(tempFilter?.conditions)
    const currentValues = selections[type].values || []
    const isActive = currentValues.some(v => String(v) === String(value))
    selections[type] = {
      operator: selections[type].operator || 'is',
      values: isActive
        ? currentValues.filter(v => String(v) !== String(value))
        : [...currentValues, value],
    }

    const conditions = selectionsToConditions(selections)

    clearQuickFilters()
    setSelectedCalendarDate(null)

    if (conditions.length === 0) {
      clearTempFilter()
      clearActiveFilter()
      return
    }

    const chipName = chipClicked.label.name
    applyTempFilter(
      { conditions, operator: 'AND' },
      // Keep whatever the temp filter was already labelled as (e.g. an
      // in-progress saved-filter edit); only name it when starting fresh.
      tempFilterMeta ?? { name: chipName },
    )
  }

  // Helper to update URL with filter parameters
  const updateFilterUrl = (filterType, filterValue) => {
    const params = new URLSearchParams(searchParams)

    // Clear existing filter params
    params.delete('filter')
    params.delete('filterId')
    params.delete('filter_id')

    // Set new filter param (use filterId for advanced filters)
    if (filterType && filterValue) {
      params.set(filterType, filterValue)
    }

    // Always navigate with params
    Navigate(
      { pathname: '/chores', search: params.toString() },
      { replace: true },
    )
  }

  const clearTempFilterAndUrl = () => {
    clearTempFilter()
    updateFilterUrl(null, null)
  }

  const handleSearchChange = e => {
    clearActiveFilter()
    if (hasQuickFilters) {
      clearQuickFilters()
    }
    const search = e.target.value
    if (search === '') {
      setSearchTerm('')
      setSelectedCalendarDate(null)
      return
    }

    const term = search.toLowerCase()
    setSearchTerm(term)
    // Clear selected calendar date when search changes
    setSelectedCalendarDate(null)
  }
  const handleSearchClose = () => {
    setSearchTerm('')
    setSelectedCalendarDate(null)
    if (searchParams.has('search')) {
      const params = new URLSearchParams(searchParams)
      params.delete('search')
      setSearchParams(params, { replace: true })
    }
  }

  const setSelectedChoreSectionWithCache = value => {
    setSelectedChoreSection(value)
    localStorage.setItem('selectedChoreSection', value)
  }

  const setChoreSortByWithCache = value => {
    setChoreSortBy(value)
    localStorage.setItem('choreSortBy', value)
  }

  const setChoreSortDirectionWithCache = value => {
    setChoreSortDirection(value)
    localStorage.setItem('choreSortDirection', value)
  }

  const setOpenChoreSectionsWithCache = value => {
    setOpenChoreSections(value)
    localStorage.setItem('openChoreSections', JSON.stringify(value))
  }

  const toggleViewMode = value => {
    const newMode =
      value ??
      (() => {
        const modes = ['default', 'calendar']
        return modes[(modes.indexOf(viewMode) + 1) % modes.length]
      })()
    setViewMode(newMode)
    localStorage.setItem('choreCardViewMode', newMode)
    if (newMode !== 'calendar') {
      setSelectedCalendarDate(null)
    }
  }

  const selectedDateChores = useMemo(() => {
    if (!selectedCalendarDate) return []

    const selectedDate = pickedDay(selectedCalendarDate)
    return getFilteredChores.filter(chore => {
      if (!chore.nextDueDate) return false
      return familyDay(chore.nextDueDate) === selectedDate
    })
  }, [getFilteredChores, selectedCalendarDate])

  // The assignee filter ("Mine", "Available to me", ...) is applied inside
  // ChoresGrouper, not in the task list itself, so it can hide every task
  // while the unfiltered list still looks full. It narrows like any other.
  const hasAssigneeNarrowing =
    ASSIGNEE_FILTER_KEYS.includes(selectedChoreFilter)
  const hasAssigneeFilter = Boolean(
    selectedChoreFilter && selectedChoreFilter !== 'anyone',
  )

  // "Narrowed" means the user actively cut the list down (search, quick
  // filters, the assignee filter).
  const isNarrowed = Boolean(
    searchTerm?.length > 0 || hasQuickFilters || hasAssigneeFilter,
  )
  // Worth its own wording: the assignee filter is the one narrowing that is
  // easy to forget you left on, so name it rather than saying "filters".
  const isAssigneeOnlyNarrowing = Boolean(
    hasAssigneeNarrowing && !searchTerm?.length && !hasQuickFilters,
  )

  // What the list actually renders. Sections are the source of truth outside
  // of search, since they are the only place the assignee filter is applied.
  const visibleChoreCount = useMemo(
    () =>
      choreSections.reduce(
        (total, section) => total + (section.content?.length || 0),
        0,
      ),
    [choreSections],
  )

  const clearNarrowing = () => {
    clearQuickFilters()
    setSearchTerm('')
    clearActiveFilter()
    setSelectedChoreFilterWithCache('anyone')
    updateFilterUrl(null, null)
  }

  const appendChore = (prev, newChore) => {
    let newChores = [...prev, newChore]

    if (impersonatedUser) {
      newChores = newChores.filter(chore =>
        isTaskFor(chore, impersonatedUser.userId),
      )
    }

    return newChores
  }

  // Uses functional setState so back-to-back calls (e.g. creating several
  // voice-captured tasks in a row) each build on the latest state instead of
  // a closure snapshot taken before earlier calls landed.
  const updateChores = newChore => {
    setChores(prev => appendChore(prev, newChore))
    clearQuickFilters()
  }

  // Show error state when API is unreachable
  if (choresError || membersError) {
    return (
      <Container maxWidth='md'>
        <EmptyState
          variant='error'
          fullHeight
          icon={<CloudOff />}
          title={t('chores:empty.errorTitle')}
          description={
            choresErrorDetails?.message || t('chores:empty.errorDescription')
          }
          primaryAction={{
            label: t('chores:empty.errorAction'),
            onClick: () => {
              refetchChores()
              queryClient.invalidateQueries({ queryKey: ['circleMembers'] })
            },
          }}
        />
      </Container>
    )
  }

  if (
    isUserProfileLoading ||
    userProfile === null ||
    userLabelsLoading ||
    membersLoading ||
    choresLoading
  ) {
    return (
      <>
        <LoadingComponent />
      </>
    )
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
      }}
    >
      <Container
        maxWidth='md'
        sx={{ px: 1, pt: { xs: 1, md: 3 }, minWidth: 0 }}
      >
        <ChoreToolbar
          members={membersData?.res || []}
          labels={userLabels || []}
          tempFilter={tempFilter}
          tempFilterMeta={tempFilterMeta}
          applyTempFilter={applyTempFilter}
          clearTempFilter={clearTempFilterAndUrl}
          onClearAllFilters={() => {
            clearQuickFilters()
            clearActiveFilter()
            setSelectedChoreFilterWithCache('anyone')
            updateFilterUrl(null, null)
          }}
          resultCount={
            hasQuickFilters || hasFilterApplied
              ? getFilteredChores.length
              : undefined
          }
          totalCount={
            hasQuickFilters || hasFilterApplied ? chores.length : undefined
          }
          selectedAssigneeFilter={selectedChoreFilter}
          onAssigneeFilterChange={filter => {
            setSelectedChoreFilterWithCache(filter)
          }}
          selectedGroupBy={selectedChoreSection}
          onGroupBySelect={value => {
            setSelectedChoreSectionWithCache(value)
            clearQuickFilters()
          }}
          selectedSort={choreSortBy}
          onSortChange={setChoreSortByWithCache}
          sortDirection={choreSortDirection}
          onSortDirectionChange={setChoreSortDirectionWithCache}
          viewMode={viewMode}
          onToggleViewMode={toggleViewMode}
          isMultiSelectMode={isMultiSelectMode}
          onToggleMultiSelect={toggleMultiSelectMode}
          searchTerm={searchTerm}
          onSearchChange={handleSearchChange}
          onSearchClose={handleSearchClose}
          searchInputRef={searchInputRef}
          showKeyboardShortcuts={showKeyboardShortcuts}
        />

        <MultiSelectToolbar
          isVisible={isMultiSelectMode}
          selectedCount={selectedChores.size}
          onSelectAll={() =>
            selectAllVisibleChores(
              searchTerm?.length > 0 || hasQuickFilters
                ? getFilteredChores
                : null,
              choreSections,
              openChoreSections,
            )
          }
          onClear={clearSelection}
          onComplete={handleBulkComplete}
          onSkip={handleBulkSkip}
          onArchive={handleBulkArchive}
          onDelete={handleBulkDelete}
          onSetDueDate={handleBulkDueDate}
          onSetAssignee={handleBulkAssignee}
          onToggleLabel={handleBulkLabels}
          selectionSummary={selectionSummary}
          members={membersData?.res || []}
          labels={userLabels || []}
          showKeyboardShortcuts={showKeyboardShortcuts}
          selectAllDisabled={
            searchTerm?.length > 0 || hasQuickFilters
              ? selectedChores.size === getFilteredChores.length
              : selectedChores.size ===
                choreSections.flatMap(s => s.content || []).length
          }
        />

        {/* Empty state. Two different situations, two different messages:
            nothing created yet, or nothing left after narrowing.
            The trigger is what the list actually renders, not the pre-filter
            count, so a view emptied purely by the assignee filter still
            explains itself instead of showing a blank page. */}
        {(searchTerm?.length > 0
          ? getFilteredChores.length === 0
          : visibleChoreCount === 0) &&
          // only if not in calendar view:
          viewMode !== 'calendar' &&
          (chores.length === 0 || !isNarrowed ? (
            <EmptyState
              variant='empty'
              fullHeight
              icon={<EditCalendar />}
              title={t('chores:empty.noTasksTitle')}
              description={t('chores:empty.noTasksDescription')}
              primaryAction={{
                label: t('chores:empty.createTask'),
                startDecorator: <Add />,
                onClick: () => setAddTaskModalOpen(true),
              }}
              secondaryAction={{
                label: t('chores:empty.moreOptions'),
                onClick: () => Navigate('/chores/create'),
              }}
            />
          ) : (
            <EmptyState
              variant='no-results'
              fullHeight
              icon={<SearchOff />}
              title={t('chores:empty.noMatchTitle')}
              description={
                searchTerm?.length > 0
                  ? t('chores:empty.noMatchSearch', { term: searchTerm })
                  : isAssigneeOnlyNarrowing
                    ? t(`chores:empty.assignee.${selectedChoreFilter}`)
                    : t('chores:empty.noMatchFilters')
              }
              primaryAction={{
                label:
                  searchTerm?.length > 0
                    ? t('chores:empty.clearSearch')
                    : isAssigneeOnlyNarrowing
                      ? t('chores:empty.showEveryone')
                      : t('chores:empty.clearFilters'),
                onClick: clearNarrowing,
              }}
            />
          ))}
        {searchTerm?.length > 0 && viewMode !== 'calendar' && (
          <ChoreListView
            chores={getFilteredChores}
            viewMode={viewMode}
            membersData={membersData}
            userLabels={userLabels}
            handleLabelFiltering={handleLabelFiltering}
            handleChoreAction={handleChoreAction}
            isMultiSelectMode={isMultiSelectMode}
            selectedChores={selectedChores}
            toggleChoreSelection={toggleChoreSelection}
            onLongPressChore={enterMultiSelectWithChore}
          />
        )}
        {viewMode === 'calendar' && (
          <>
            {/* Calendar Monthly View */}
            <Box sx={{ mb: 2 }}>
              {isLargeScreen ? (
                <CalendarDual
                  chores={getFilteredChores}
                  onDateChange={date => {
                    setSelectedCalendarDate(date)
                  }}
                />
              ) : (
                <div className='calendar-dual'>
                  <CalendarMonthly
                    chores={getFilteredChores}
                    onDateChange={date => {
                      setSelectedCalendarDate(date)
                    }}
                  />
                </div>
              )}
            </Box>

            {/* Selected Date Tasks */}
            {selectedCalendarDate && (
              <Box sx={{ mt: 2 }}>
                <Typography level='title-md' gutterBottom>
                  {t('tasksForDate', {
                    date: fromPickedDay(selectedCalendarDate).format('L'),
                  })}
                </Typography>
                <Box
                  sx={{
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 1,
                    maxHeight: '400px',
                    overflowY: 'auto',
                  }}
                >
                  {selectedDateChores.length === 0 ? (
                    <EmptyState
                      size='sm'
                      icon={<EditCalendar />}
                      title={t('chores:list.nothingScheduled')}
                      description={t('chores:empty.dayFreeDescription')}
                      primaryAction={{
                        label: t('chores:empty.addTask'),
                        startDecorator: <Add />,
                        onClick: () => setAddTaskModalOpen(true),
                      }}
                    />
                  ) : (
                    <ChoreListView
                      chores={selectedDateChores}
                      viewMode={'compact'}
                      membersData={membersData}
                      userLabels={userLabels}
                      handleLabelFiltering={handleLabelFiltering}
                      handleChoreAction={handleChoreAction}
                      isMultiSelectMode={isMultiSelectMode}
                      selectedChores={selectedChores}
                      toggleChoreSelection={toggleChoreSelection}
                      onLongPressChore={enterMultiSelectWithChore}
                    />
                  )}
                </Box>
              </Box>
            )}
          </>
        )}
        {searchTerm.length === 0 && viewMode !== 'calendar' && (
          <AccordionGroup transition='0.2s ease' disableDivider>
            {choreSections.map((section, index) => {
              if (section.content.length === 0) return null
              return (
                <Accordion
                  key={section.name + index}
                  sx={{
                    my: 0,
                    px: 0,
                  }}
                  expanded={Boolean(openChoreSections[index])}
                >
                  <Box
                    sx={{
                      alignItems: 'center',
                      display: 'flex',
                      mt: index === 0 ? 0.5 : 2,
                      mb: 1,
                      px: 0.5,
                    }}
                  >
                    {(() => {
                      const sectionSelectedCount = section.content.filter(
                        chore => selectedChores.has(chore.id),
                      ).length
                      const allSelected =
                        sectionSelectedCount === section.content.length
                      const partiallySelected =
                        sectionSelectedCount > 0 && !allSelected
                      return (
                        <>
                          {isMultiSelectMode && (
                            <Box
                              role='checkbox'
                              aria-checked={
                                allSelected
                                  ? 'true'
                                  : partiallySelected
                                    ? 'mixed'
                                    : 'false'
                              }
                              tabIndex={0}
                              onClick={() =>
                                toggleSectionSelection(section.content)
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  toggleSectionSelection(section.content)
                                }
                              }}
                              title={t('archived.selectSectionTitle')}
                              sx={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                width: 24,
                                cursor: 'pointer',
                                borderRadius: '50%',
                                height: 24,
                                mr: 0.5,
                                bgcolor:
                                  allSelected || partiallySelected
                                    ? 'primary.solidBg'
                                    : 'neutral.softBg',
                                color:
                                  allSelected || partiallySelected
                                    ? 'primary.solidColor'
                                    : 'transparent',
                                '&:hover': {
                                  bgcolor:
                                    allSelected || partiallySelected
                                      ? 'primary.solidHoverBg'
                                      : 'neutral.softHoverBg',
                                },
                              }}
                            >
                              {allSelected ? (
                                <Check sx={{ fontSize: 16 }} />
                              ) : (
                                <Remove sx={{ fontSize: 16 }} />
                              )}
                            </Box>
                          )}
                          <Box
                            component='button'
                            type='button'
                            aria-expanded={Boolean(openChoreSections[index])}
                            onClick={() => {
                              if (openChoreSections[index]) {
                                const newOpenChoreSections = {
                                  ...openChoreSections,
                                }
                                delete newOpenChoreSections[index]
                                setOpenChoreSectionsWithCache(
                                  newOpenChoreSections,
                                )
                              } else {
                                setOpenChoreSectionsWithCache({
                                  ...openChoreSections,
                                  [index]: true,
                                })
                              }
                            }}
                            sx={{
                              alignItems: 'center',
                              background: 'none',
                              border: 0,
                              color:
                                section.name === t('chores:sections.overdue')
                                  ? 'danger.plainColor'
                                  : 'text.tertiary',
                              cursor: 'pointer',
                              display: 'flex',
                              flex: 1,
                              font: '700 12px/1 var(--joy-fontFamily-body)',
                              gap: 0.75,
                              letterSpacing: '.06em',
                              minHeight: 32,
                              p: 0,
                              textAlign: 'start',
                              textTransform: 'uppercase',
                            }}
                          >
                            {section.name}
                            <Box
                              component='span'
                              sx={{
                                color: 'text.tertiary',
                                fontWeight: 600,
                              }}
                            >
                              {section?.content?.length}
                            </Box>
                            <ExpandMore
                              sx={{
                                fontSize: 18,
                                ml: 'auto',
                                transform: openChoreSections[index]
                                  ? 'rotate(180deg)'
                                  : 'none',
                                transition: 'transform 160ms ease',
                              }}
                            />
                          </Box>
                        </>
                      )
                    })()}
                  </Box>
                  <AccordionDetails
                    sx={{
                      px: 0,
                      flexDirection: 'column',
                      ['& > *']: {
                        px: 0,
                      },
                    }}
                  >
                    {openChoreSections[index] && (
                      <ChoreListView
                        chores={section.content}
                        viewMode={viewMode}
                        membersData={membersData}
                        userLabels={userLabels}
                        handleLabelFiltering={handleLabelFiltering}
                        handleChoreAction={handleChoreAction}
                        isMultiSelectMode={isMultiSelectMode}
                        selectedChores={selectedChores}
                        toggleChoreSelection={toggleChoreSelection}
                        onLongPressChore={enterMultiSelectWithChore}
                      />
                    )}
                  </AccordionDetails>
                </Accordion>
              )
            })}
          </AccordionGroup>
        )}
        {addTaskModalOpen && (
          <TaskInput
            onChoreUpdate={updateChores}
            isModalOpen={addTaskModalOpen}
            onClose={forceRefresh => {
              setAddTaskModalOpen(false)
              if (forceRefresh) {
                refetchChores()
              }
            }}
          />
        )}
      </Container>

      <Sidepanel
        chores={customFilteredChores}
        allChores={chores}
        performers={membersData?.res || []}
        applyTempFilter={applyTempFilter}
        clearTempFilter={clearTempFilterAndUrl}
        tempFilter={tempFilter}
      />

      {/* Confirmation Modal for bulk operations */}
      {confirmModelConfig?.isOpen && (
        <ConfirmationModal config={confirmModelConfig} />
      )}

      <ChoreModals
        activeModal={activeModal}
        modalChore={modalChore}
        membersData={membersData}
        onChangeDueDate={handleChangeDueDate}
        onCompleteWithPastDate={handleCompleteWithPastDate}
        onAssigneeChange={handleAssigneeChange}
        onCompleteWithNote={handleCompleteWithNote}
        onClose={closeModal}
      />
    </div>
  )
}

export default MyChores
