/**
 * The task list's toolbar: search, project, filter sheet, sort and group,
 * display and multi-select. Active filter chips show below it; the filter
 * sheet holds every condition (assignee, created by, status, priority, due
 * date, labels, projects, points). Filters are not saved.
 */

import {
  CalendarMonth,
  Check,
  CheckBox,
  CheckBoxOutlineBlank,
  DisplaySettings,
  FilterList,
  Sort,
  Tune,
  ViewAgenda,
} from '@mui/icons-material'
import {
  Badge,
  Box,
  Button,
  Chip,
  Divider,
  IconButton,
  Typography,
} from '@mui/joy'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'

import AppModal from '../../../components/common/AppModal'
import ActiveFilterChips from '../../../components/common/filter/ActiveFilterChips'
import KeyboardShortcutHint from '../../../components/common/KeyboardShortcutHint'
import SortAndFilterMenu from '../../../components/common/SortAndFilterMenu'
import Priorities from '../../../utils/Priorities'
import ProjectSelector from '../../components/ProjectSelector'
import FilterBuilderContent, {
  CHORE_STATUSES,
  conditionsToSelections,
  defaultSelections,
  DUE_DATE_OPTIONS,
  POINTS_OPERATORS,
  selectionsToConditions,
} from './FilterBuilderContent'
import SearchBar from './SearchBar'

// ─── sub-components for the Display sheet ────────────────────────────────────

const SectionHeader = ({ badge, icon, label }) => (
  <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 1.5 }}>
    {icon && (
      <Box
        sx={{
          color: 'text.secondary',
          display: 'flex',
          alignItems: 'center',
          '& svg': { fontSize: 18 },
        }}
      >
        {icon}
      </Box>
    )}
    <Typography level='title-sm' fontWeight={600}>
      {label}
    </Typography>
    {badge != null && (
      <Chip
        size='sm'
        variant='solid'
        color='primary'
        sx={{ ml: 'auto', fontSize: '0.7rem', height: 20 }}
      >
        {badge}
      </Chip>
    )}
  </Box>
)

const OptionChips = ({ multi, onToggle, options, selected }) => (
  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
    {options.map(opt => {
      const isSelected = multi
        ? (selected || []).includes(opt.value)
        : selected === opt.value
      return (
        <Chip
          key={opt.value}
          variant={isSelected ? 'solid' : 'soft'}
          color={isSelected ? (opt.color ?? 'primary') : 'neutral'}
          startDecorator={
            opt.icon != null ? (
              isSelected ? (
                <Check sx={{ fontSize: 14 }} />
              ) : (
                opt.icon
              )
            ) : undefined
          }
          onClick={() => onToggle(opt.value)}
          sx={{
            py: 0.64,
            cursor: 'pointer',
            transition: 'all 0.15s ease',
            userSelect: 'none',
            '&:hover': { opacity: 0.85 },
          }}
        >
          {opt.label}
        </Chip>
      )
    })}
  </Box>
)

// ─── main component ───────────────────────────────────────────────────────────

/**
 * Props:
 *  -- Advanced filter (filter sheet) --
 *  members           – circle members for Assignee / Created By sections
 *  labels            – user labels for Labels section
 *  projects          – projects list (projectsWithDefault) for Projects section + Display sheet
 *  tempFilter        – current temp filter object { conditions, operator } or null
 *  tempFilterMeta    – metadata for temp filter, including saved-filter edit source when applicable
 *  applyTempFilter   – (filter) => void  — called immediately as selections change
 *  clearTempFilter   – () => void
 *
 *  -- Result counts --
 *  resultCount / totalCount
 *
 *  -- Clear all --
 *  onClearAllFilters – () => void
 *
 *  -- Display sheet --
 *  selectedProject   – current project object (for Display sheet section)
 *  onProjectSelect   – (project) => void
 *  selectedAssigneeFilter – 'anyone' | 'assigned_to_me' | 'available_for_me' | 'assigned_to_others'
 *  onAssigneeFilterChange – (key) => void
 *  selectedGroupBy   – 'default' | 'due_date' | 'priority' | 'labels'
 *  onGroupBySelect   – (value) => void
 *  selectedSort      – 'smart' | 'due_date' | 'priority' | 'created_date' | 'updated_date'
 *  onSortChange      – (value) => void
 *  sortDirection     – 'asc' | 'desc'
 *  onSortDirectionChange – (value) => void
 *  viewMode          – 'default' | 'compact' | 'calendar'
 *  onToggleViewMode  – (value?) => void
 *
 *  -- Multi-select --
 *  isMultiSelectMode – bool
 *  onToggleMultiSelect – () => void
 *
 *  -- Search --
 *  searchTerm / onSearchChange / onSearchClose / searchInputRef
 *  showKeyboardShortcuts
 */
const ChoreToolbar = ({
  // advanced filter
  applyTempFilter,
  clearTempFilter,
  isMultiSelectMode,
  labels = [],
  members = [],
  onAssigneeFilterChange,
  onClearAllFilters,
  onGroupBySelect,
  // result counts
  onProjectSelect,
  // clear all
  // project (for Display sheet)
  // assignee (for Display sheet)
  onSearchChange,
  onSearchClose,
  onSortChange,
  onSortDirectionChange,
  // saved / custom
  onToggleMultiSelect,
  onToggleViewMode,
  projects = [],
  resultCount,
  // grouping
  searchInputRef,
  searchTerm,
  // view + multiselect
  selectedAssigneeFilter = 'anyone',
  selectedGroupBy = 'default',
  selectedProject,
  selectedSort = 'smart',
  showKeyboardShortcuts,
  sortDirection = 'asc',
  // search
  tempFilter,
  tempFilterMeta,
  totalCount,
  viewMode = 'default',
}) => {
  const { t } = useTranslation('chores')
  const [filterSheetOpen, setFilterSheetOpen] = useState(false)
  const [displaySheetOpen, setDisplaySheetOpen] = useState(false)
  const [localSelections, setLocalSelections] = useState(defaultSelections())
  const activeConditions = selectionsToConditions(localSelections)

  // ── badge counts ─────────────────────────────────────────────────────────────

  const tempConditionCount = tempFilter?.conditions?.length || 0
  const totalActiveCount = tempConditionCount
  const hasAnyActive = totalActiveCount > 0

  // ── inline chip strip ────────────────────────────────────────────────────────

  const inlineChips = []

  const getConditionChipLabel = condition => {
    if (!condition?.type) return 'Filter'

    const typeLabels = {
      assignee: t('filterBuilder.assignee'),
      createdBy: t('filterBuilder.createdBy'),
      status: t('filterBuilder.statusHeading'),
      priority: t('filterBuilder.priority'),
      label: t('labels.label'),
      project: t('filterBuilder.project'),
      dueDate: t('filterBuilder.dueDate'),
      points: t('filterBuilder.points'),
    }

    const typeLabel =
      typeLabels[condition.type] || t('filterBuilder.filterFallback')
    const prefix =
      condition.operator === 'isNot' ? t('filterBuilder.notPrefix') : ''

    if (condition.type === 'dueDate') {
      const describeDueDate = op =>
        DUE_DATE_OPTIONS.some(o => o.value === op)
          ? t(`filterBuilder.dueDateOption.${op}`)
          : t('filterBuilder.customDueDate')
      const dueDateLabel =
        condition.operator === 'anyOf'
          ? (Array.isArray(condition.value) ? condition.value : [])
              .map(describeDueDate)
              .join(' / ')
          : describeDueDate(condition.operator)
      return `${typeLabel}: ${dueDateLabel}`
    }

    if (condition.type === 'points') {
      const pointsOp =
        POINTS_OPERATORS.find(o => o.value === condition.operator)?.label ||
        condition.operator ||
        ''
      return `${typeLabel} ${pointsOp} ${condition.value ?? 0}`
    }

    const rawValues = Array.isArray(condition.value)
      ? condition.value
      : condition.value != null
        ? [condition.value]
        : []

    const resolveLabel = value => {
      if (condition.type === 'assignee' || condition.type === 'createdBy') {
        // Sentinel scope values (not real member ids) FilterEngine's
        // evaluateAssignee special-cases — must be translated here rather
        // than falling through to the raw member lookup below.
        const assigneeSentinelLabels = {
          me: t('toolbar.mine'),
          others: t('toolbar.others'),
          anyone: t('toolbar.everyone'),
          available_for_me: t('toolbar.availableToMe'),
        }
        if (condition.type === 'assignee' && value in assigneeSentinelLabels) {
          return assigneeSentinelLabels[value]
        }
        const member = members.find(m => m.userId === value)
        return member?.displayName || member?.username || String(value)
      }
      if (condition.type === 'status') {
        return CHORE_STATUSES.some(s => s.value === value)
          ? t(`filterBuilder.status.${value}`)
          : String(value)
      }
      if (condition.type === 'priority') {
        return Priorities.find(p => p.value === value)?.name || String(value)
      }
      if (condition.type === 'label') {
        return labels.find(l => l.id === value)?.name || String(value)
      }
      if (condition.type === 'project') {
        if (value === 'default') return 'Default Project'
        const project = projects.find(p => p.id === value)
        if (!project) return String(value)
        return project.isPrivate ? `🔒 ${project.name}` : project.name
      }
      return String(value)
    }

    if (rawValues.length === 0) {
      return `${prefix}${typeLabel}`
    }

    if (rawValues.length === 1) {
      return `${prefix}${typeLabel}: ${resolveLabel(rawValues[0])}`
    }

    return `${prefix}${typeLabel} (${rawValues.length})`
  }

  const activeChipConditions = tempFilter?.conditions || []

  const clearConditionAtIndex = index => {
    const nextConditions = activeChipConditions.filter(
      (_condition, conditionIndex) => conditionIndex !== index,
    )

    if (nextConditions.length === 0) {
      setLocalSelections(defaultSelections())
      clearTempFilter?.()
      return
    }

    setLocalSelections(conditionsToSelections(nextConditions))

    applyTempFilter?.(
      {
        ...tempFilter,
        operator: tempFilter?.operator || 'AND',
        conditions: nextConditions,
      },
      tempFilterMeta,
    )
  }

  activeChipConditions.forEach((condition, index) => {
    inlineChips.push({
      key: `__temp_${index}`,
      label: getConditionChipLabel(condition),
      onClear: () => clearConditionAtIndex(index),
    })
  })

  // ── open filter sheet ────────────────────────────────────────────────────────

  const openFilterSheet = () => {
    setLocalSelections(
      tempFilter?.conditions?.length > 0
        ? conditionsToSelections(tempFilter.conditions)
        : defaultSelections(),
    )
    setFilterSheetOpen(true)
  }

  // ── selection changes → apply temp filter immediately ────────────────────────

  const handleSelectionsChange = updater => {
    setLocalSelections(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater
      const conditions = selectionsToConditions(next)
      if (conditions.length > 0) {
        applyTempFilter?.({ conditions, operator: 'AND' })
      } else {
        clearTempFilter?.()
      }
      return next
    })
  }

  // ── display sheet helpers ────────────────────────────────────────────────────

  const filterActive = tempConditionCount > 0

  const sortOptions = [
    { value: 'smart', name: t('sort.smart') },
    { value: 'due_date', name: t('dueDate') },
    { value: 'priority', name: t('priority') },
    { value: 'created_date', name: t('sort.createdDate') },
    { value: 'updated_date', name: t('sort.updatedDate') },
  ]

  const groupByOptions = [
    { value: 'default', name: t('sort.smart') },
    { value: 'due_date', name: t('dueDate') },
    { value: 'priority', name: t('priority') },
    { value: 'labels', name: t('labels.label') },
    { value: 'created_date', name: t('sort.createdDate') },
    { value: 'updated_date', name: t('sort.updatedDate') },
  ]

  const assigneeOptions = [
    { value: 'anyone', label: t('toolbar.everyone') },
    { value: 'assigned_to_me', label: t('toolbar.mine') },
    { value: 'available_for_me', label: t('toolbar.availableToMe') },
    { value: 'assigned_to_others', label: t('toolbar.others') },
  ]

  const viewOptions = [
    {
      value: 'default',
      label: t('toolbar.list'),
      icon: <ViewAgenda sx={{ fontSize: 16 }} />,
    },
    {
      value: 'calendar',
      label: t('toolbar.calendar'),
      icon: <CalendarMonth sx={{ fontSize: 16 }} />,
    },
  ]

  return (
    <>
      {/* ── Row 1: main toolbar ─────────────────────────────────────────────── */}
      <Box
        sx={{
          display: 'flex',
          alignItems: 'center',
          gap: 0.5,
          justifyContent: 'space-between',
        }}
      >
        {/* Search takes available space */}
        <SearchBar
          value={searchTerm}
          onChange={onSearchChange}
          onClose={onSearchClose}
          showKeyboardShortcuts={showKeyboardShortcuts}
          inputRef={searchInputRef}
        />

        {/* Project selector */}
        {!filterActive &&
          projects.filter(p => p.id !== 'default').length > 0 && (
            <Box
              sx={{
                display: 'none',
                '@media (min-width: 1024px)': { display: 'inline-flex' },
              }}
            >
              <ProjectSelector
                selectedProject={selectedProject?.name || 'Default Project'}
                onProjectSelect={onProjectSelect}
                showKeyboardShortcuts={showKeyboardShortcuts}
              />
            </Box>
          )}

        {/* Filter */}
        <Badge
          badgeContent={totalActiveCount || null}
          color='primary'
          size='sm'
          anchorOrigin={{ vertical: 'top', horizontal: 'right' }}
        >
          <IconButton
            variant={hasAnyActive ? 'solid' : 'outlined'}
            color={hasAnyActive ? 'primary' : 'neutral'}
            size='sm'
            sx={{ height: 32, width: 32, borderRadius: '50%' }}
            onClick={openFilterSheet}
            aria-label={t('toolbar.filters')}
            title={t('toolbar.filters')}
          >
            <Tune />
          </IconButton>
        </Badge>

        {/* Sorting and grouping are list-organization controls, so they live
            together in a dedicated menu rather than under Display. */}
        <SortAndFilterMenu
          title={t('sort.sortAndGroup')}
          icon={<Sort />}
          sortOptions={sortOptions}
          selectedSort={selectedSort}
          onSortChange={onSortChange}
          sortDirection={sortDirection}
          onSortDirectionChange={onSortDirectionChange}
          filterTitle={t('toolbar.groupBy')}
          filterOptions={groupByOptions}
          selectedFilter={selectedGroupBy}
          onFilterChange={onGroupBySelect}
          isActive={
            selectedSort !== 'smart' ||
            sortDirection !== 'asc' ||
            selectedGroupBy !== 'default'
          }
        />

        {/* Display */}
        <IconButton
          variant='outlined'
          color='neutral'
          size='sm'
          sx={{ height: 32, width: 32, borderRadius: '50%' }}
          onClick={() => setDisplaySheetOpen(true)}
          aria-label={t('toolbar.displayOptions')}
          title={t('toolbar.display')}
        >
          <DisplaySettings />
        </IconButton>

        {/* Multiselect */}
        <Box sx={{ position: 'relative', display: 'inline-flex' }}>
          <IconButton
            variant={isMultiSelectMode ? 'solid' : 'outlined'}
            color={isMultiSelectMode ? 'primary' : 'neutral'}
            size='sm'
            sx={{ height: 32, width: 32, borderRadius: '50%' }}
            onClick={onToggleMultiSelect}
            aria-label={
              isMultiSelectMode ? t('multiSelect.exit') : t('multiSelect.enter')
            }
            title={
              isMultiSelectMode
                ? t('multiSelect.exitHint')
                : t('multiSelect.enterHint')
            }
          >
            {isMultiSelectMode ? <CheckBox /> : <CheckBoxOutlineBlank />}
          </IconButton>
          <KeyboardShortcutHint
            shortcut='S'
            show={showKeyboardShortcuts}
            sx={{ position: 'absolute', top: -8, right: -8, zIndex: 1000 }}
          />
        </Box>
      </Box>

      {/* ── Row 3: active (temp/ad-hoc) filter chips ──────────────────────────── */}
      {tempConditionCount > 0 && (
        <ActiveFilterChips
          chips={inlineChips}
          onOpen={openFilterSheet}
          showAddChip
          onAdd={openFilterSheet}
          onClearAll={() => {
            setLocalSelections(defaultSelections())
            onClearAllFilters?.()
          }}
          resultCount={resultCount}
          totalCount={totalCount}
          maxVisible={2}
          chipSize='md'
          clearButtonSize='sm'
          clearButtonSx={{ color: 'text.secondary' }}
        />
      )}

      {/* ── Unified Filter bottom sheet ─────────────────────────────────────── */}
      <AppModal
        open={filterSheetOpen}
        isMobile
        onClose={() => setFilterSheetOpen(false)}
        maxHeight='92vh'
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Tune sx={{ fontSize: 20 }} />
            {t('toolbar.filters')}
            {hasAnyActive && (
              <Chip size='sm' variant='solid' color='primary' sx={{ ml: 0.5 }}>
                {totalActiveCount}
              </Chip>
            )}
          </Box>
        }
        footer={
          <Box
            sx={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: 1,
            }}
          >
            <Button
              variant='plain'
              color='danger'
              size='sm'
              disabled={!hasAnyActive && activeConditions.length === 0}
              onClick={() => {
                setLocalSelections(defaultSelections())
                onClearAllFilters?.()
                setFilterSheetOpen(false)
              }}
            >
              {t('toolbar.clearAll')}
            </Button>

            <Button
              variant='solid'
              color='primary'
              onClick={() => setFilterSheetOpen(false)}
              sx={{ minWidth: 140 }}
            >
              {resultCount != null && activeConditions.length > 0
                ? t('toolbar.showCount', { count: resultCount })
                : t('activity.status.done')}
            </Button>
          </Box>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* Full advanced filter content */}
          <FilterBuilderContent
            selections={localSelections}
            onSelectionsChange={handleSelectionsChange}
            members={members}
            labels={labels}
            projects={projects}
          />
        </Box>
      </AppModal>

      {/* ── Display bottom sheet (View + Assignee) ───────────────────────────── */}
      <AppModal
        open={displaySheetOpen}
        isMobile
        onClose={() => setDisplaySheetOpen(false)}
        title={
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <DisplaySettings sx={{ fontSize: 20 }} />
            {t('toolbar.display')}
          </Box>
        }
        footer={
          <Button
            onClick={() => setDisplaySheetOpen(false)}
            sx={{ minWidth: 140 }}
          >
            {t('activity.status.done')}
          </Button>
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
          {/* View section */}
          <SectionHeader label={t('actionMenu.view')} />
          <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
            {viewOptions.map(opt => (
              <Chip
                key={opt.value}
                variant={viewMode === opt.value ? 'solid' : 'soft'}
                color={viewMode === opt.value ? 'primary' : 'neutral'}
                startDecorator={
                  viewMode === opt.value ? (
                    <Check sx={{ fontSize: 14 }} />
                  ) : (
                    opt.icon
                  )
                }
                onClick={() => onToggleViewMode?.(opt.value)}
                sx={{
                  py: 0.64,
                  cursor: 'pointer',
                  transition: 'all 0.15s ease',
                  userSelect: 'none',
                  '&:hover': { opacity: 0.85 },
                }}
              >
                {opt.label}
              </Chip>
            ))}
          </Box>

          {/* Show tasks for section */}
          <Divider sx={{ my: 2.5 }} />
          <SectionHeader
            icon={<FilterList />}
            label={t('toolbar.showTasksFor')}
            badge={
              selectedAssigneeFilter !== 'anyone'
                ? assigneeOptions.find(o => o.value === selectedAssigneeFilter)
                    ?.label
                : null
            }
          />
          <OptionChips
            options={assigneeOptions}
            selected={selectedAssigneeFilter}
            multi={false}
            onToggle={v => onAssigneeFilterChange?.(v)}
          />
        </Box>
      </AppModal>
    </>
  )
}

export default ChoreToolbar
