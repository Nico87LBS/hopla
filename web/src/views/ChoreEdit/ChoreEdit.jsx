import {
  Checklist,
  Close,
  DescriptionOutlined,
  LabelOutlined,
  MoreHoriz,
  NotificationsOutlined,
  TimerOutlined,
  VisibilityOutlined,
} from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Container,
  Dropdown,
  FormHelperText,
  IconButton,
  Input,
  Menu,
  MenuButton,
  MenuItem,
  Radio,
  RadioGroup,
  Sheet,
  Switch,
  Typography,
} from '@mui/joy'
import { useMediaQuery } from '@mui/material'
import moment from 'moment'
import { useEffect, useRef, useState } from 'react'
import { useTranslation } from 'react-i18next'
import {
  useBlocker,
  useLocation,
  useNavigate,
  useParams,
  useSearchParams,
} from 'react-router-dom'

import DurationInput from '../../components/common/DurationInput'
import EmptyState from '../../components/common/EmptyState'
import KeyboardShortcutHint from '../../components/common/KeyboardShortcutHint'
import NumberInput from '../../components/common/NumberInput'
import NotificationTemplate from '../../components/NotificationTemplate.jsx'
import { usePageShortcutScope } from '../../contexts/KeyboardShortcutScopeContext'
import {
  useArchiveChore,
  useChore,
  useChores,
  useCreateChore,
  useDeleteChores,
  useUnArchiveChore,
  useUpdateChore,
} from '../../queries/ChoreQueries.jsx'
import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries.jsx'
import { useNotification } from '../../service/NotificationProvider'
import { familyTimezone } from '../../utils/familyTime'
import { GetAllFamilyMembers, GetChoreByID } from '../../utils/Fetcher'
import { withRepeatTime } from '../../utils/repeatTime.js'
import { getSafeBottomPadding } from '../../utils/SafeAreaUtils.js'
import {
  copiesOf,
  copyUpdate,
  perMemberChores,
  splitIntoCopies,
} from '../../utils/taskCopies.js'
import { generateUUID } from '../../utils/UUID'
import LoadingComponent from '../components/Loading.jsx'
import RichTextEditor from '../components/RichTextEditor.jsx'
import SubTasks from '../components/SubTask.jsx'
import { useLabels } from '../Labels/LabelQueries'
import AttachmentViewerModal from '../Modals/Inputs/AttachmentViewerModal'
import ConfirmationModal from '../Modals/Inputs/ConfirmationModal'
import LabelModal from '../Modals/Inputs/LabelModal'
import AttachmentsField from './editor/AttachmentsField'
import EditorPreview, { TaskSummary } from './editor/EditorPreview'
import MoreOptions, { OptionRow } from './editor/MoreOptions'
import { LabelsField } from './editor/OrganizationFields'
import RewardCard from './editor/RewardCard'
import { describeTask, nextSlot } from './editor/schedule'
import WhenCard from './editor/WhenCard'
import WhoCard from './editor/WhoCard'
import EditorContainer from './EditorContainer'

const ASSIGN_STRATEGIES = [
  'random',
  'least_assigned',
  'least_completed',
  'keep_last_assigned',
  'random_except_last_assigned',
  'round_robin',
  'no_assignee',
]
const DEFAULT_ASSIGN_STRATEGY = ASSIGN_STRATEGIES[3] // keep_last_assigned
const REPEAT_ON_TYPE = ['interval', 'days_of_the_week', 'day_of_the_month']

const NO_DUE_DATE_REQUIRED_TYPE = ['no_repeat', 'once']
const NO_DUE_DATE_ALLOWED_TYPE = ['trigger', 'always']
const NOTIFICATION_FORBIDDEN_TYPE = ['trigger', 'always']
const ChoreEdit = () => {
  const { i18n, t } = useTranslation('chores')
  // Wide screens show a preview with the buttons beside the form, the widest
  // ones the blocks in two columns.
  const withAside = useMediaQuery('(min-width:1024px)')
  const twoColumns = useMediaQuery('(min-width:1400px)')
  // Page-level shortcuts (save/cancel) must defer to whatever modal
  // currently owns the keyboard — see KeyboardShortcutScopeContext.
  const isPageShortcutActive = usePageShortcutScope()
  const location = useLocation()
  const [createAnother, setCreateAnother] = useState(
    location.state?.createAnother === true,
  )
  const { data: userProfile, isLoading: isUserProfileLoading } =
    useUserProfile()

  const [chore, setChore] = useState([])
  const [choresHistory, setChoresHistory] = useState([])
  const [userHistory, setUserHistory] = useState({})
  const { choreId } = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [confirmModelConfig, setConfirmModelConfig] = useState({})
  const [anyone, setAnyone] = useState(false)
  const [assignableTo, setAssignableTo] = useState([])
  const [performers, setPerformers] = useState([])
  const [assignStrategy, setAssignStrategy] = useState(DEFAULT_ASSIGN_STRATEGY)
  // A new task for several members can be saved as one copy per member, and
  // an edit can be applied to the other copies of a task.
  const [perMember, setPerMember] = useState(false)
  const [applyToCopies, setApplyToCopies] = useState(true)
  const [dueDate, setDueDate] = useState(null)
  const [dueDateOnly, setDueDateOnly] = useState(null)
  const [dueTime, setDueTime] = useState(null)
  const [useCustomTime, setUseCustomTime] = useState(false)
  const [assignedTo, setAssignedTo] = useState(-1)
  const [frequencyType, setFrequencyType] = useState('once')
  const [frequency, setFrequency] = useState(1)
  const [frequencyMetadata, setFrequencyMetadata] = useState({})
  const [labels, setLabels] = useState([])
  const [labelsV2, setLabelsV2] = useState([])
  const [completionActionsValid, setCompletionActionsValid] = useState(true)
  const [points, setPoints] = useState(-1)
  const [requireApproval, setRequireApproval] = useState(false)
  const [flashPoints, setFlashPoints] = useState(0)
  const [flashMinutes, setFlashMinutes] = useState(15)
  const [isPrivate, setIsPrivate] = useState(false)
  const [subTasks, setSubTasks] = useState(null)
  const [completionWindow, setCompletionWindow] = useState(-1)
  const [deadlineOffset, setDeadlineOffset] = useState(-1)

  const [notificationMetadata, setNotificationMetadata] = useState({})

  const [isRolling, setIsRolling] = useState(false)
  const isNotificable = (notificationMetadata?.templates?.length ?? 0) > 0
  const [isActive, setIsActive] = useState(true)
  const [updatedBy, setUpdatedBy] = useState(0)
  const [createdBy, setCreatedBy] = useState(0)
  const [errors, setErrors] = useState({})
  const [attemptToSave, setAttemptToSave] = useState(false)
  const [draftId] = useState(() => generateUUID())
  const [attachments, setAttachments] = useState([])
  const [isUploadingAttachment, setIsUploadingAttachment] = useState(false)
  const [addLabelModalOpen, setAddLabelModalOpen] = useState(false)
  const [attachmentViewerConfig, setAttachmentViewerConfig] = useState({
    isOpen: false,
  })
  const [showSavePrivacyDefault, setShowSavePrivacyDefault] = useState(false)
  const [privacySaved, setPrivacySaved] = useState(false)
  const [showSaveAssigneeDefault, setShowSaveAssigneeDefault] = useState(false)
  // Offer to remember the people only once they were changed by hand.
  const [peopleChanged, setPeopleChanged] = useState(false)
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)

  const { data: userLabelsRaw, isLoading: isUserLabelsLoading } = useLabels()
  const updateChoreMutation = useUpdateChore()
  const createChoreMutation = useCreateChore()
  const archiveChore = useArchiveChore()
  const unarchiveChore = useUnArchiveChore()
  const deleteChores = useDeleteChores()
  const isEditing = choreId > 0 && searchParams.get('clone') !== 'true'
  const { data: allChores } = useChores(true, { enabled: isEditing })
  const copies = isEditing ? copiesOf(chore, allChores?.res) : []
  const syncCopies = applyToCopies && copies.length > 0
  // The due date as loaded, to tell whether the edit changed it.
  const loadedDueDate = isEditing ? (chore?.nextDueDate ?? null) : undefined
  const copyOwners = copies
    .flatMap(copy => copy.assignees || [])
    .map(a => performers.find(p => p.userId === a.userId)?.displayName)
    .filter(Boolean)
    .join(', ')
  const {
    data: choreData,
    isError: isChoreError,
    isLoading: isChoreLoading,
    refetch: refetchChore,
  } = useChore(choreId)
  const { data: membersData, isLoading: isMemberDataLoading } =
    useFamilyMembers()
  const { showError, showSuccess } = useNotification()

  const [userLabels, setUserLabels] = useState([])

  useEffect(() => {
    if (userLabelsRaw) {
      setUserLabels(userLabelsRaw)
    }
  }, [userLabelsRaw])

  const Navigate = useNavigate()

  const assignees = anyone ? performers : assignableTo
  // A task with slots is due at its next slot: the server sets the date.
  const hasSlots =
    ['daily', 'days_of_the_week'].includes(frequencyType) &&
    frequencyMetadata?.slots?.length > 0
  // A shared task for several people can become one copy per person, when
  // created or later, as long as it has no copies yet.
  const canSplit =
    !anyone && assignees.length > 1 && (!isEditing || copies.length === 0)
  // Who keeps the task, and its history, when it is split.
  const splitKeeper = performers.find(
    p =>
      p.userId ===
      (assignees.find(a => a.userId === assignedTo) ?? assignees[0])?.userId,
  )?.displayName
  const hasSpecificAssignees = !anyone && assignableTo.length > 0
  const canPickStrategy = hasSpecificAssignees && assignableTo.length > 1
  const assignStrategyValue = !hasSpecificAssignees
    ? 'no_assignee'
    : canPickStrategy
      ? assignStrategy
      : DEFAULT_ASSIGN_STRATEGY
  // "Together": everyone has the task at once, nobody in particular.
  const together = assignStrategyValue === 'together'
  const assignedToValue =
    !hasSpecificAssignees || assignStrategyValue === 'no_assignee' || together
      ? null
      : assignableTo.some(a => a.userId === assignedTo)
        ? assignedTo
        : assignableTo[0].userId

  const snapshot = JSON.stringify({
    name,
    description,
    labelsV2,
    anyone,
    assignableTo,
    assignedTo,
    assignStrategy,
    perMember,
    dueDate,
    dueDateOnly,
    dueTime,
    useCustomTime,
    frequencyType,
    frequency,
    frequencyMetadata,
    subTasks,
    attachments,
    points,
    flashPoints,
    flashMinutes,
    requireApproval,
    isPrivate,
    isNotificable,
    notificationMetadata,
    isRolling,
    completionWindow,
    deadlineOffset,
  })
  const latestSnapshot = useRef(snapshot)
  latestSnapshot.current = snapshot
  const [savedSnapshot, setSavedSnapshot] = useState(null)
  const dirtyGuard = useRef(false)
  const hasInteracted = useRef(false)
  const isDirty = savedSnapshot !== null && snapshot !== savedSnapshot
  dirtyGuard.current = isDirty
  const formLoading =
    (isChoreLoading && choreId) ||
    isUserLabelsLoading ||
    isUserProfileLoading ||
    isMemberDataLoading
  useEffect(() => {
    if (formLoading || hasInteracted.current) return
    // Async defaults and child controls can normalize values after the first render.
    setSavedSnapshot(snapshot)
  }, [formLoading, snapshot])
  const captureInitialValues = () => {
    if (hasInteracted.current) return
    hasInteracted.current = true
    setSavedSnapshot(latestSnapshot.current)
  }
  useEffect(() => {
    const protect = event => {
      if (dirtyGuard.current) {
        event.preventDefault()
        event.returnValue = ''
      }
    }
    window.addEventListener('beforeunload', protect)
    return () => window.removeEventListener('beforeunload', protect)
  }, [])
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirtyGuard.current && currentLocation.pathname !== nextLocation.pathname,
  )
  useEffect(() => {
    if (blocker.state !== 'blocked') return
    setConfirmModelConfig({
      isOpen: true,
      title: t('taskEditor.discardTitle'),
      message: t('taskEditor.discardMessage'),
      confirmText: t('taskEditor.discardConfirm'),
      cancelText: t('taskEditor.keepEditing'),
      color: 'danger',
      onClose: confirmed => {
        setConfirmModelConfig({})
        if (confirmed) {
          dirtyGuard.current = false
          blocker.proceed()
        } else blocker.reset()
      },
    })
  }, [blocker.state])
  // Which block of the editor shows each error.
  const errorSections = {
    name: 'task',
    assignees: 'who',
    assignedTo: 'who',
    frequency: 'when',
    dueDate: 'when',
    completionActions: 'reward',
  }
  const focusError = key => {
    requestAnimationFrame(() => {
      const section = document.querySelector(
        `[data-editor-section="${errorSections[key] || 'task'}"]`,
      )
      section?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      section
        ?.querySelector('input, select, textarea, [role="combobox"]')
        ?.focus({ preventScroll: true })
    })
  }

  const HandleValidateChore = () => {
    const errors = {}

    if (name.trim() === '') {
      errors.name = t('choreEdit.errNameRequired')
    }
    if (assignStrategyValue !== 'no_assignee') {
      if (assignees.length === 0) {
        errors.assignees = t('taskEditor.errChooseEligible')
      }
      if (!together && (assignedToValue === null || assignedToValue < 0)) {
        errors.assignedTo = t('taskEditor.errChooseAssignee')
      }
    }
    if (frequencyType === 'interval' && !frequency > 0) {
      errors.frequency = t('choreEdit.errFrequencyInvalid', {
        unit: frequencyMetadata.unit,
      })
    }
    if (
      frequencyType === 'days_of_the_week' &&
      frequencyMetadata['days']?.length === 0
    ) {
      errors.frequency = t('choreEdit.errSelectDayOfWeek')
    }

    // Validate advanced scheduling patterns
    if (
      frequencyType === 'days_of_the_week' &&
      frequencyMetadata?.weekPattern === 'week_of_month' &&
      (!frequencyMetadata?.occurrences ||
        frequencyMetadata.occurrences.length === 0)
    ) {
      errors.frequency = t('choreEdit.errSelectDayOccurrence')
    }
    if (
      frequencyType === 'day_of_the_month' &&
      frequencyMetadata['months']?.length === 0
    ) {
      errors.frequency = t('choreEdit.errSelectMonth')
    }
    if (
      dueDate === null &&
      !hasSlots &&
      !NO_DUE_DATE_REQUIRED_TYPE.includes(frequencyType) &&
      !NO_DUE_DATE_ALLOWED_TYPE.includes(frequencyType)
    ) {
      if (REPEAT_ON_TYPE.includes(frequencyType)) {
        errors.dueDate = t('choreEdit.errStartDateRequired')
      } else {
        errors.dueDate = t('choreEdit.errDueDateRequired')
      }
    }
    if (!completionActionsValid)
      errors.completionActions = t('taskEditor.pointsInvalid')
    const slotTimes = ['daily', 'days_of_the_week'].includes(frequencyType)
      ? (frequencyMetadata?.slots || []).map(slot => slot.time)
      : []
    if (slotTimes.some(time => !time)) {
      errors.frequency = t('slots.editor.errTime')
    } else if (new Set(slotTimes).size !== slotTimes.length) {
      errors.frequency = t('slots.editor.errSameTime')
    }

    setErrors(errors)
    if (Object.keys(errors).length > 0) {
      requestAnimationFrame(() =>
        requestAnimationFrame(() => focusError(Object.keys(errors)[0])),
      )
      return false
    }

    return true
  }

  const handleDueDateChange = e => {
    const dateValue = e.target.value // YYYY-MM-DD format
    if (!dateValue) {
      setDueDateOnly(null)
      setDueDate(null)
      return
    }
    setDueDateOnly(dateValue)

    // Combine date with time or end of day
    if (useCustomTime && dueTime) {
      // Use the custom time
      const combinedDateTime = moment(`${dateValue}T${dueTime}`).format(
        'YYYY-MM-DDTHH:mm:00',
      )
      setDueDate(combinedDateTime)

      // Update frequencyMetadata.time for REPEAT_ON_TYPE frequencies
      if (REPEAT_ON_TYPE.includes(frequencyType)) {
        setFrequencyMetadata({
          ...frequencyMetadata,
          time: moment(`${dateValue}T${dueTime}`).format(),
          timezone: familyTimezone(),
        })
      }
    } else {
      // Default to end of day (23:59:59) in user's timezone
      const endOfDay = moment(dateValue)
        .endOf('day')
        .format('YYYY-MM-DDTHH:mm:59')
      setDueDate(endOfDay)
      setFrequencyMetadata(
        withRepeatTime(frequencyType, frequencyMetadata, endOfDay),
      )
    }
  }

  const handleDueTimeChange = e => {
    const timeValue = e.target.value // HH:mm format
    setDueTime(timeValue)

    if (dueDateOnly) {
      // Combine date with the selected time
      const combinedDateTime = moment(`${dueDateOnly}T${timeValue}`).format(
        'YYYY-MM-DDTHH:mm:00',
      )
      setDueDate(combinedDateTime)

      // Update frequencyMetadata.time for REPEAT_ON_TYPE frequencies
      if (REPEAT_ON_TYPE.includes(frequencyType)) {
        setFrequencyMetadata({
          ...frequencyMetadata,
          time: moment(`${dueDateOnly}T${timeValue}`).format(),
          timezone: familyTimezone(),
        })
      }
    }
  }

  const handleUseCustomTimeChange = checked => {
    setUseCustomTime(checked)

    if (checked) {
      // Initialize with current time or default to 18:00
      const defaultTime = dueTime || '18:00'
      setDueTime(defaultTime)

      if (dueDateOnly) {
        const combinedDateTime = moment(`${dueDateOnly}T${defaultTime}`).format(
          'YYYY-MM-DDTHH:mm:59',
        )
        setDueDate(combinedDateTime)

        // Update frequencyMetadata.time for REPEAT_ON_TYPE frequencies
        if (REPEAT_ON_TYPE.includes(frequencyType)) {
          setFrequencyMetadata({
            ...frequencyMetadata,
            time: moment(`${dueDateOnly}T${defaultTime}`).format(),
            timezone: familyTimezone(),
          })
        }
      }
    } else {
      // Revert to end of day
      if (dueDateOnly) {
        const endOfDay = moment(dueDateOnly)
          .endOf('day')
          .format('YYYY-MM-DDTHH:mm:ss')
        setDueDate(endOfDay)
        setFrequencyMetadata(
          withRepeatTime(frequencyType, frequencyMetadata, endOfDay),
        )
      }
    }
  }
  // `shouldCreateAnother` is passed explicitly by the split-button menu so a
  // menu pick performs the save right away instead of only changing the
  // default (state updates wouldn't be visible to this call anyway).
  // Apply the saved task's shared settings to each of its other copies. A copy
  // that fails is reported, the others are still saved.
  const updateCopies = async saved => {
    let failed = 0
    for (const copy of copies) {
      try {
        const resp = await GetChoreByID(copy.id)
        if (!resp?.ok) throw new Error(`HTTP ${resp?.status}`)
        const data = await resp.json()
        await updateChoreMutation.mutateAsync(
          copyUpdate(data.res, saved, loadedDueDate),
        )
      } catch (error) {
        console.error('Failed to update task copy:', error)
        failed += 1
      }
    }
    if (failed > 0) {
      showError({
        title: t('taskEditor.copies.failedTitle'),
        message: t('taskEditor.copies.failed', { count: failed }),
      })
    }
  }
  const HandleSaveChore = (shouldCreateAnother = createAnother) => {
    if (updateChoreMutation.isPending || createChoreMutation.isPending) return
    setAttemptToSave(true)
    if (!HandleValidateChore()) return
    let newChoreId = choreId
    if (searchParams.get('clone') === 'true') {
      newChoreId = null
    }
    const assignees = anyone ? [] : assignableTo
    const planReminders = notificationMetadata?.templates || []
    const chore = {
      id: Number(newChoreId),
      name: name,
      description: description,
      assignees: assignees,
      dueDate: dueDate ? new Date(dueDate).toISOString() : null,
      nextDueDate: dueDate ? new Date(dueDate).toISOString() : null,
      frequencyType: frequencyType,
      frequency: Number(frequency),
      frequencyMetadata: withRepeatTime(
        frequencyType,
        frequencyMetadata,
        dueDate,
      ),
      assignedTo: assignedToValue,
      assignStrategy: assignStrategyValue,
      isRolling: isRolling,
      isActive: isActive,
      notification: isNotificable && planReminders.length > 0,
      labels: labels.map(l => l.name),
      labelsV2: labelsV2,
      subTasks: subTasks,
      notificationMetadata: {
        ...notificationMetadata,
        templates: planReminders,
      },
      points: points < 0 ? null : points,
      // The speed bonus counts from the due time: an "always" task has none.
      flashPoints:
        flashPoints > 0 && frequencyType !== 'always' ? flashPoints : null,
      flashMinutes:
        flashPoints > 0 && frequencyType !== 'always' ? flashMinutes : null,
      requireApproval: requireApproval,
      isPrivate: isPrivate,
      completionWindow:
        // if completionWindow is -1 then set it to null or dueDate is null
        completionWindow < 0 || dueDate === null ? null : completionWindow,
      deadlineOffset: deadlineOffset < 0 ? null : deadlineOffset,
      draftId: newChoreId > 0 ? undefined : draftId,
    }
    let SaveFunction = createChoreMutation.mutateAsync
    if (newChoreId > 0) {
      SaveFunction = updateChoreMutation.mutateAsync
    } else {
      // This is the dedicated create page, distinct from the AddTaskModal
      // popup (which sets its own quick_add/voice/scan source).
      chore.source =
        searchParams.get('clone') === 'true' ? 'clone' : 'full_page'
    }

    const createCopies = !(newChoreId > 0) && perMember && canSplit
    const splitCopies = newChoreId > 0 && perMember && canSplit
    const save = async () => {
      if (splitCopies) {
        const { creates, update } = splitIntoCopies(
          chore,
          assignees,
          assignedToValue,
        )
        const result = await updateChoreMutation.mutateAsync(update)
        for (const copy of creates) {
          await createChoreMutation.mutateAsync(copy)
        }
        return result
      }
      if (createCopies) {
        let result
        for (const copy of perMemberChores(chore, assignees)) {
          result = await createChoreMutation.mutateAsync(copy)
        }
        return result
      }
      const result = await SaveFunction(chore)
      if (syncCopies) await updateCopies(chore)
      return result
    }

    save()
      .then(result => {
        if (
          result?._pendingUpdate ||
          result?._pendingCreate ||
          result?.res?._pendingCreate
        ) {
          showSuccess({
            title: t('choreEdit.savedOfflineTitle'),
            message: t('choreEdit.savedOfflineMessage'),
          })
        } else {
          showSuccess({
            title: t('choreEdit.savedTitle'),
            message: t('choreEdit.savedMessage'),
          })
        }
        dirtyGuard.current = false
        setSavedSnapshot(latestSnapshot.current)
        Navigate(shouldCreateAnother ? '/chores/create' : '/chores', {
          state: shouldCreateAnother ? { createAnother: true } : null,
        })
      })
      .catch(error => {
        console.error('Failed to save chore:', error)
        showError({
          title: t('choreEdit.saveFailedTitle'),
          message: error?.isServerMessage
            ? error.message
            : t('choreEdit.saveFailedMessage'),
        })
      })
  }
  useEffect(() => {
    //fetch performers:
    GetAllFamilyMembers().then(data => {
      setPerformers(data.res)
    })

    // Load default privacy setting for new chores
    if (!choreId) {
      const defaultPrivacySetting = localStorage.getItem(
        'defaultPrivacySetting',
      )
      if (defaultPrivacySetting !== null) {
        setIsPrivate(JSON.parse(defaultPrivacySetting))
      }

      const defaultAnyoneSetting = localStorage.getItem('defaultAnyoneSetting')
      if (defaultAnyoneSetting != null) {
        const savedAnyone = JSON.parse(defaultAnyoneSetting)
        setAnyone(savedAnyone)
      }

      const defaultAssigneeSetting = localStorage.getItem(
        'defaultAssigneeSetting',
      )
      if (defaultAssigneeSetting !== null) {
        const savedAssignees = JSON.parse(defaultAssigneeSetting)
        setAssignableTo(savedAssignees)
      }
    }
  }, [])
  useEffect(() => {
    if (choreId || !userProfile?.id) return

    const defaultAnyoneSetting = localStorage.getItem('defaultAnyoneSetting')
    const defaultAssigneeSetting = localStorage.getItem(
      'defaultAssigneeSetting',
    )

    if (defaultAnyoneSetting === null && defaultAssigneeSetting === null) {
      setAnyone(false)
      setAssignableTo([{ userId: userProfile.id }])
      setAssignedTo(userProfile.id)
    }
  }, [choreId, userProfile?.id])
  useEffect(() => {
    const anyoneSetting = localStorage.getItem('defaultAnyoneSetting')
    const anyoneDirty = anyoneSetting !== JSON.stringify(anyone)
    const assigneeSetting = localStorage.getItem('defaultAssigneeSetting')
    const assigneeDirty = assigneeSetting !== JSON.stringify(assignableTo)
    const dirty = anyoneDirty || (!anyone && assigneeDirty)
    setShowSaveAssigneeDefault(dirty)
  }, [anyone, assignableTo])

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = event => {
      if (!isPageShortcutActive) return
      if (event.repeat) return

      const isHoldingCmd = event.ctrlKey || event.metaKey

      // Show keyboard shortcuts when holding Cmd/Ctrl
      if (isHoldingCmd) {
        setShowKeyboardShortcuts(true)
      }

      // Cmd/Ctrl + Enter to save
      if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        HandleSaveChore()
        return
      }

      // Cmd/Ctrl + Escape key to cancel
      if (event.key === 'Escape' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault()
        Navigate(choreId ? `/chores/${choreId}` : '/chores')
        return
      }
    }

    const handleKeyUp = event => {
      if (event.key === 'Control' || event.key === 'Meta') {
        setShowKeyboardShortcuts(false)
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    window.addEventListener('keyup', handleKeyUp)

    return () => {
      window.removeEventListener('keydown', handleKeyDown)
      window.removeEventListener('keyup', handleKeyUp)
    }
  }, [HandleSaveChore, isPageShortcutActive])

  useEffect(() => {
    if (isChoreLoading === false && choreData && choreId) {
      const data = choreData
      const isCloneMode = searchParams.get('clone') === 'true'

      setChore(data.res)
      setName(data.res.name ? data.res.name : '')
      setDescription(data.res.description ? data.res.description : '')
      setAssignableTo(data.res.assignees ? data.res.assignees : [])
      setAnyone((data.res.assignees?.length || 0) === 0)
      setAssignedTo(data.res.assignedTo)
      setFrequencyType(data.res.frequencyType ? data.res.frequencyType : 'once')

      setFrequencyMetadata(data.res.frequencyMetadata)
      setFrequency(data.res.frequency)

      setNotificationMetadata(data.res.notificationMetadata)
      setPoints(
        data.res.points != null && data.res.points >= 0 ? data.res.points : -1,
      )
      setRequireApproval(data.res.requireApproval || false)
      setFlashPoints(data.res.flashPoints > 0 ? data.res.flashPoints : 0)
      setFlashMinutes(data.res.flashMinutes > 0 ? data.res.flashMinutes : 15)
      setIsPrivate(data.res.isPrivate || false)
      setCompletionWindow(
        data.res.completionWindow && data.res.completionWindow > -1
          ? data.res.completionWindow
          : -1,
      )
      setDeadlineOffset(
        data.res.deadlineOffset && data.res.deadlineOffset > -1
          ? data.res.deadlineOffset
          : -1,
      )

      setLabelsV2(data.res.labelsV2)

      setAssignStrategy(
        data.res.assignStrategy
          ? data.res.assignStrategy
          : DEFAULT_ASSIGN_STRATEGY,
      )
      setIsRolling(data.res.isRolling)
      setIsActive(data.res.isActive)
      setSubTasks(data.res.subTasks ? data.res.subTasks : [])

      if (isCloneMode) {
        if (data.res.subTasks) {
          const clonedSubTasks = data.res.subTasks.map(subTask => ({
            ...subTask,
            id: -subTask.id, // Negate ID to indicate new sub task
            parentId: subTask.parentId ? -subTask.parentId : null, // Negate parent ID if exists
            completed: false, // Reset completion status
            completedAt: null, // Reset completion date
          }))
          setSubTasks(clonedSubTasks)
        }
        if (data.res.name) {
          setName(t('taskEditor.copyOf', { name: data.res.name }))
        }
      }

      // Parse existing due date into date and time components
      if (data.res.nextDueDate) {
        const dueDateMoment = moment(data.res.nextDueDate)
        const dateOnly = dueDateMoment.format('YYYY-MM-DD')
        const timeOnly = dueDateMoment.format('HH:mm')
        const endOfDayTime = '23:59'

        setDueDateOnly(dateOnly)
        setDueDate(dueDateMoment.format('YYYY-MM-DDTHH:mm:ss'))

        // Check if it's a custom time (not end of day)
        if (timeOnly !== endOfDayTime) {
          setUseCustomTime(true)
          setDueTime(timeOnly)
        } else {
          setUseCustomTime(false)
          setDueTime(null)
        }
      } else {
        setDueDateOnly(null)
        setDueDate(null)
        setUseCustomTime(false)
        setDueTime(null)
      }

      setCreatedBy(data.res.createdBy)
      setUpdatedBy(data.res.updatedBy)
      setAttachments(data.res.attachments || [])
    }
  }, [choreData, isChoreLoading, searchParams])

  // useEffect(() => {
  //   if (userLabels && userLabels.length == 0 && labelsV2.length == 0) {
  //     return
  //   }
  //   const labelIds = labelsV2.map(l => l.id)
  //   setLabelsV2(userLabels.filter(l => labelIds.indexOf(l.id) > -1))
  // }, [userLabels, labelsV2])

  useEffect(() => {
    // if frequency type change to something need a due date then set it to the current date:
    if (
      !NO_DUE_DATE_REQUIRED_TYPE.includes(frequencyType) &&
      !NO_DUE_DATE_ALLOWED_TYPE.includes(frequencyType) &&
      !dueDate
    ) {
      const today = moment(new Date()).format('YYYY-MM-DD')
      setDueDateOnly(today)
      // Default to end of day
      setDueDate(moment(today).endOf('day').format('YYYY-MM-DDTHH:mm:59'))
      setUseCustomTime(false)
      setDueTime(null)
    }
    // "always" never has a due date. A "trigger" task loaded with a date was
    // set off by Home Assistant and keeps it; switching to it clears the date
    // in onFrequencyTypeUpdate instead.
    if (frequencyType === 'always') {
      setDueDate(null)
      setDueDateOnly(null)
      setUseCustomTime(false)
      setDueTime(null)
    }
    // backend rejects notification: true for these frequency types
    // (forbidden_with_trigger_frequency), so clear it client-side too
    if (NOTIFICATION_FORBIDDEN_TYPE.includes(frequencyType)) {
      setNotificationMetadata({})
    }
  }, [frequencyType])

  // useEffect(() => {
  //   if (performers.length > 0 && assignees.length === 0 && userProfile) {
  //     setAssignees([
  //       {
  //         userId: userProfile?.id,
  //       },
  //     ])
  //   }
  // }, [performers, userProfile])

  // if user resolve the error trigger validation to remove the error message from the respective field
  useEffect(() => {
    if (attemptToSave) {
      HandleValidateChore()
    }
  }, [assignableTo, name, frequencyMetadata, attemptToSave, dueDate])

  const handleDelete = () => {
    setConfirmModelConfig({
      isOpen: true,
      title: t('choreEdit.deleteChoreTitle'),
      confirmText: t('common:delete'),
      cancelText: t('common:cancel'),
      message: syncCopies
        ? t('taskEditor.copies.deleteConfirm', { count: copies.length })
        : t('edit.deleteConfirm'),
      onClose: isConfirmed => {
        if (isConfirmed === true) {
          deleteChores.mutate(
            syncCopies ? [choreId, ...copies.map(copy => copy.id)] : [choreId],
            {
              onSuccess: () => {
                Navigate('/chores')
              },
              onError: error => {
                showError({
                  title: t('choreEdit.deleteFailedTitle'),
                  message: t('choreEdit.deleteChoreFailed', {
                    error: error.message,
                  }),
                })
              },
            },
          )
        }
        setConfirmModelConfig({})
      },
    })
  }

  if (
    (isChoreLoading && choreId) ||
    isUserLabelsLoading ||
    isUserProfileLoading ||
    isMemberDataLoading
  ) {
    return <LoadingComponent />
  }
  if (isChoreError && choreId) {
    return (
      <Container maxWidth='sm'>
        <EmptyState
          variant='error'
          fullHeight
          icon={<Checklist />}
          title={t('choreView.notFoundTitle')}
          description={t('choreView.notFoundDescription')}
          primaryAction={{ label: t('archived.backToTasks'), to: '/chores' }}
        />
      </Container>
    )
  }
  // How the people of a shared task share it, as the mode cards show it.
  const multiple = !anyone && assignees.length > 1
  const modes = multiple
    ? [canSplit && 'each', 'first', 'one'].filter(Boolean)
    : []
  const mode = multiple
    ? perMember && canSplit
      ? 'each'
      : together
        ? 'first'
        : 'one'
    : null
  const changeMode = value => {
    setPerMember(value === 'each')
    if (value === 'first') setAssignStrategy('together')
    else if (assignStrategy === 'together')
      setAssignStrategy(DEFAULT_ASSIGN_STRATEGY)
  }
  const modeHelp = {
    each: isEditing
      ? t('taskEditor.copies.splitHelp', {
          count: assignees.length - 1,
          name: splitKeeper ?? '',
        })
      : t('editor.who.eachHelp', { count: assignees.length }),
    first: t('editor.who.firstHelp'),
    one: t('editor.who.oneHelp'),
  }[mode]
  const isPicked = userId =>
    !anyone && assignableTo.some(a => a.userId === userId)
  const togglePerson = userId => {
    setPeopleChanged(true)
    if (anyone) {
      setAnyone(false)
      setAssignableTo([{ userId }])
      return
    }
    if (assignableTo.some(a => a.userId === userId)) {
      const next = assignableTo.filter(a => a.userId !== userId)
      setAnyone(next.length === 0)
      setAssignableTo(next)
    } else {
      setAssignableTo([...assignableTo, { userId }])
    }
  }
  const pickedMembers = performers.filter(p => isPicked(p.userId))
  const copyOwner =
    copies.length > 0 ? pickedMembers[0]?.displayName || null : null
  const shownMode = mode || (copies.length > 0 ? 'each' : null)

  const summary = describeTask({
    dueDate,
    frequency,
    frequencyMetadata,
    frequencyType,
    language: i18n.language,
    mode: shownMode,
    names: pickedMembers.map(p => p.displayName),
    points,
    t,
    useCustomTime,
  })
  const upcoming = nextSlot(frequencyType, frequencyMetadata)
  const nextLabel = upcoming
    ? t('editor.when.next', {
        when: moment(upcoming.at)
          .calendar()
          .replace(/^./, c => c.toLowerCase()),
        slot: upcoming.slot.name || upcoming.slot.time,
      })
    : null

  const saving = updateChoreMutation.isPending || createChoreMutation.isPending
  const close = () => Navigate(choreId ? `/chores/${choreId}` : '/chores')
  const archive = () => {
    const ids = [
      choreId,
      ...(syncCopies
        ? copies.filter(copy => copy.isActive === isActive).map(copy => copy.id)
        : []),
    ]
    for (const id of ids) {
      isActive ? archiveChore.mutate(id) : unarchiveChore.mutate(id)
    }
  }
  const description_ = description.replace(/<[^>]*>/g, '').trim()
  const reminders = notificationMetadata?.templates?.length || 0

  const copiesChoice = copies.length > 0 && (
    <Checkbox
      checked={applyToCopies}
      onChange={e => setApplyToCopies(e.target.checked)}
      label={t('editor.footer.applyCopies', {
        count: copies.length,
        names: copyOwners,
      })}
      sx={{ minHeight: 36, alignItems: 'center', fontWeight: 600 }}
    />
  )
  const buttons = (
    <Box sx={{ display: 'flex', gap: 1.25, alignItems: 'center' }}>
      <Button
        variant='plain'
        color='neutral'
        onClick={close}
        sx={{ minHeight: 48, px: 2 }}
      >
        {t('taskEditor.cancel')}
        {showKeyboardShortcuts && (
          <KeyboardShortcutHint shortcut='Esc' sx={{ ml: 1 }} />
        )}
      </Button>
      <Button
        loading={saving}
        onClick={() => HandleSaveChore()}
        sx={{ flex: 1, minHeight: 48, borderRadius: '14px', fontSize: 16 }}
      >
        {createAnother
          ? choreId > 0
            ? t('taskEditor.saveAndNewShort')
            : t('taskEditor.createAndNewShort')
          : syncCopies
            ? t('editor.footer.saveAll', { count: copies.length + 1 })
            : choreId > 0
              ? t('taskEditor.save')
              : t('taskEditor.create')}
        {showKeyboardShortcuts && (
          <KeyboardShortcutHint shortcut='Enter' sx={{ ml: 1 }} />
        )}
      </Button>
    </Box>
  )

  const who = (
    <WhoCard
      members={performers}
      isSelected={isPicked}
      onToggle={togglePerson}
      picked={pickedMembers}
      modes={modes}
      mode={mode}
      onModeChange={changeMode}
      help={modeHelp}
      copyOwner={copyOwner}
      onRememberDefault={
        !isEditing && peopleChanged && showSaveAssigneeDefault
          ? () => {
              localStorage.setItem(
                'defaultAnyoneSetting',
                JSON.stringify(anyone),
              )
              localStorage.setItem(
                'defaultAssigneeSetting',
                JSON.stringify(assignableTo),
              )
              setShowSaveAssigneeDefault(false)
            }
          : null
      }
      assignedTo={assignedToValue ?? -1}
      onAssignedToChange={setAssignedTo}
      assignStrategy={assignStrategy}
      onAssignStrategyChange={setAssignStrategy}
      strategies={ASSIGN_STRATEGIES}
      error={errors.assignees || errors.assignedTo}
    />
  )
  const when = (
    <WhenCard
      frequencyType={frequencyType}
      onFrequencyTypeUpdate={value => {
        setFrequencyType(value)
        if (NO_DUE_DATE_ALLOWED_TYPE.includes(value)) {
          setDueDate(null)
          setDueDateOnly(null)
          setDueTime(null)
          setUseCustomTime(false)
        }
      }}
      frequency={frequency}
      onFrequencyUpdate={setFrequency}
      frequencyMetadata={frequencyMetadata}
      onFrequencyMetadataUpdate={setFrequencyMetadata}
      dueDateOnly={dueDateOnly}
      dueTime={dueTime}
      useCustomTime={useCustomTime}
      onDateChange={value => handleDueDateChange({ target: { value } })}
      onTimeChange={handleDueTimeChange}
      onUseTime={handleUseCustomTimeChange}
      isRolling={isRolling}
      onIsRollingChange={value => {
        setIsRolling(value)
        if (value) setDeadlineOffset(-1)
      }}
      isEditing={isEditing}
      nextLabel={nextLabel}
      error={errors.frequency || errors.dueDate}
    />
  )
  const reward = (
    <RewardCard
      points={points}
      onPointsChange={setPoints}
      flashPoints={flashPoints}
      flashMinutes={flashMinutes}
      onFlashChange={({ minutes, points: extra }) => {
        setFlashPoints(extra)
        setFlashMinutes(minutes)
      }}
      chronoAfter={
        frequencyType === 'always'
          ? undefined
          : frequencyType === 'trigger'
            ? 'Signal'
            : hasSlots
              ? 'Slot'
              : 'Due'
      }
      requireApproval={requireApproval}
      onRequireApprovalChange={setRequireApproval}
      onValidate={setCompletionActionsValid}
      perSlot={hasSlots}
      error={errors.completionActions}
    />
  )
  const more = (
    <MoreOptions
      footer={
        choreId > 0 && chore?.createdAt ? (
          <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
            {t('editor.more.created', {
              name:
                membersData?.res?.find(f => f.userId === createdBy)
                  ?.displayName ?? '?',
              when: moment(chore.createdAt).fromNow(),
            })}
            {chore.updatedAt && updatedBy > 0
              ? ` · ${t('editor.more.updated', {
                  name:
                    membersData?.res?.find(f => f.userId === updatedBy)
                      ?.displayName ?? '?',
                  when: moment(chore.updatedAt).fromNow(),
                })}`
              : ''}
          </Typography>
        ) : null
      }
    >
      <OptionRow
        icon={DescriptionOutlined}
        title={t('editor.more.instructions')}
        value={
          [
            description_ ? t('editor.more.instructionsSet') : '',
            attachments.length
              ? t('taskEditor.files', { count: attachments.length })
              : '',
          ]
            .filter(Boolean)
            .join(' · ') || t('editor.more.none')
        }
      >
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
          <RichTextEditor
            value={description}
            onChange={setDescription}
            entityId={choreId}
            entityType={'chore_description'}
            draftId={draftId}
          />
          <AttachmentsField
            attachments={attachments}
            onAttachmentsChange={setAttachments}
            choreId={choreId}
            draftId={draftId}
            onViewImage={({ fileName, url }) =>
              setAttachmentViewerConfig({
                isOpen: true,
                url,
                fileName,
                onClose: () => setAttachmentViewerConfig({ isOpen: false }),
              })
            }
          />
        </Box>
      </OptionRow>
      <OptionRow
        icon={Checklist}
        title={t('editor.more.steps')}
        value={
          subTasks?.length
            ? t('taskEditor.subtaskCount', { count: subTasks.length })
            : t('editor.more.none')
        }
      >
        <SubTasks
          editMode={true}
          tasks={subTasks ? subTasks : []}
          setTasks={setSubTasks}
          choreId={choreId}
        />
      </OptionRow>
      <OptionRow
        icon={NotificationsOutlined}
        title={t('editor.more.reminders')}
        value={
          reminders
            ? t('editor.more.reminderCount', { count: reminders })
            : t('editor.more.noneM')
        }
      >
        {NOTIFICATION_FORBIDDEN_TYPE.includes(frequencyType) ? (
          <FormHelperText>
            {t('editor.more.remindersUnavailable')}
          </FormHelperText>
        ) : (
          <NotificationTemplate
            minNotifications={0}
            onChange={metadata => {
              const newTemplates = metadata.notifications
              if (notificationMetadata?.templates !== newTemplates) {
                setNotificationMetadata({
                  ...notificationMetadata,
                  templates: newTemplates,
                })
              }
            }}
            value={notificationMetadata}
          />
        )}
      </OptionRow>
      {dueDate && (
        <OptionRow
          icon={TimerOutlined}
          title={t('editor.more.early')}
          value={
            completionWindow !== -1
              ? t('editor.more.earlyValue', { hours: completionWindow })
              : t('editor.more.no')
          }
        >
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.25 }}>
            <Box
              component='label'
              sx={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 1.5,
                minHeight: 44,
                cursor: 'pointer',
              }}
            >
              <Typography level='body-sm'>
                {t('editor.more.earlyHelp')}
              </Typography>
              <Switch
                checked={completionWindow !== -1}
                onChange={e => setCompletionWindow(e.target.checked ? 1 : -1)}
              />
            </Box>
            {completionWindow !== -1 && (
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <NumberInput
                  aria-label={t('editor.more.earlyHours')}
                  value={completionWindow}
                  min={0}
                  max={24 * 7}
                  sx={{ width: 84 }}
                  onValueChange={setCompletionWindow}
                />
                <Typography level='body-sm'>
                  {t('editor.more.earlyHours')}
                </Typography>
              </Box>
            )}
            {deadlineOffset !== -1 && (
              <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
                <DurationInput
                  value={deadlineOffset}
                  onChange={setDeadlineOffset}
                  size='sm'
                  minValue={0}
                />
                <Typography level='body-sm'>
                  {t('choreEdit.afterDueDate')}
                </Typography>
              </Box>
            )}
          </Box>
        </OptionRow>
      )}
      <OptionRow
        icon={LabelOutlined}
        title={t('choreEdit.labels')}
        value={
          labelsV2?.length
            ? t('editor.more.labelCount', { count: labelsV2.length })
            : t('editor.more.noneM')
        }
      >
        <LabelsField
          labels={labelsV2 || []}
          userLabels={userLabels || []}
          onLabelsChange={setLabelsV2}
          onAddLabel={() => setAddLabelModalOpen(true)}
        />
      </OptionRow>
      <OptionRow
        icon={VisibilityOutlined}
        title={t('editor.more.visibility')}
        value={
          isPrivate
            ? t('editor.more.visibleLimited')
            : t('editor.more.visibleAll')
        }
      >
        <RadioGroup
          name='isPrivate'
          value={isPrivate}
          onChange={event => {
            setIsPrivate(event.target.value === 'true')
            setShowSavePrivacyDefault(true)
          }}
          sx={{ gap: 1.5 }}
        >
          <Radio value={false} label={t('editor.more.visibleAll')} />
          <Radio
            value={true}
            disabled={anyone || assignableTo.length === 0}
            label={t('editor.more.visibleLimited')}
          />
        </RadioGroup>
        {showSavePrivacyDefault && (
          <Button
            size='sm'
            variant='plain'
            onClick={() => {
              localStorage.setItem(
                'defaultPrivacySetting',
                JSON.stringify(isPrivate),
              )
              setShowSavePrivacyDefault(false)
            }}
            sx={{ mt: 1, px: 1, ml: -1 }}
          >
            {t('editor.who.remember')}
          </Button>
        )}
      </OptionRow>
    </MoreOptions>
  )

  const column = children => (
    <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
      {children}
    </Box>
  )

  return (
    <EditorContainer
      maxWidth={false}
      onClose={close}
      onClickCapture={captureInitialValues}
      onChangeCapture={captureInitialValues}
      onKeyDownCapture={captureInitialValues}
      sx={{
        p: 0,
        maxWidth: 'none !important',
        minHeight: { sm: 'calc(100dvh - 56px)' },
        '@media (min-width: 1024px)': { minHeight: '100dvh' },
      }}
    >
      <Sheet
        sx={{
          borderRadius: { xs: '20px 20px 0 0', sm: 0 },
          border: 0,
          display: 'flex',
          flexDirection: 'column',
          height: { xs: 'auto', sm: 'calc(100dvh - 56px)' },
          maxHeight: { xs: 'calc(100dvh - 48px)', sm: 'calc(100dvh - 56px)' },
          minHeight: { sm: 'calc(100dvh - 56px)' },
          overflow: 'hidden',
          '@media (min-width: 1024px)': {
            height: '100dvh',
            maxHeight: '100dvh',
            minHeight: '100dvh',
          },
          bgcolor: 'background.body',
        }}
      >
        <Box
          sx={{
            display: { xs: 'block', sm: 'none' },
            width: 36,
            height: 4,
            bgcolor: 'neutral.400',
            borderRadius: 2,
            mx: 'auto',
            mt: 1.25,
          }}
        />
        <Box
          component='header'
          sx={{
            display: 'flex',
            alignItems: 'center',
            gap: 1,
            px: { xs: 1, sm: 2 },
            py: 1,
            flexShrink: 0,
          }}
        >
          <IconButton
            aria-label={t('taskEditor.closeTaskEditor')}
            variant='plain'
            color='neutral'
            onClick={close}
          >
            <Close />
          </IconButton>
          <Typography
            level='title-lg'
            component='h1'
            sx={{
              flex: 1,
              fontFamily: 'display',
              fontWeight: 600,
              fontSize: 19,
            }}
          >
            {choreId > 0 && searchParams.get('clone') !== 'true'
              ? t('taskEditor.editTask')
              : t('taskEditor.createTask')}
          </Typography>
          {isDirty && (
            <Chip variant='soft' color='warning' size='sm'>
              {t('taskEditor.unsaved')}
            </Chip>
          )}
          <Dropdown>
            <MenuButton
              aria-label={t('editor.menu.more')}
              slots={{ root: IconButton }}
              slotProps={{ root: { variant: 'plain', color: 'neutral' } }}
            >
              <MoreHoriz />
            </MenuButton>
            <Menu placement='bottom-end' sx={{ minWidth: 220 }}>
              <MenuItem
                disabled={saving}
                onClick={() => {
                  setCreateAnother(true)
                  HandleSaveChore(true)
                }}
              >
                {choreId > 0
                  ? t('taskEditor.saveAndAnotherTask')
                  : t('taskEditor.createAndAnotherTask')}
              </MenuItem>
              {isEditing && (
                <MenuItem
                  onClick={() => Navigate(`/chores/${choreId}/edit?clone=true`)}
                >
                  {t('editor.menu.duplicate')}
                </MenuItem>
              )}
              {isEditing && (
                <MenuItem onClick={archive}>
                  {isActive
                    ? t('taskEditor.archive')
                    : t('taskEditor.unarchive')}
                </MenuItem>
              )}
              {isEditing && (
                <MenuItem color='danger' onClick={handleDelete}>
                  {t('taskEditor.delete')}
                </MenuItem>
              )}
            </Menu>
          </Dropdown>
        </Box>

        <Box
          role='region'
          aria-label={t('taskEditor.taskSettings')}
          sx={{ minHeight: 0, overflowY: 'auto', flex: 1 }}
        >
          <Box
            sx={{
              maxWidth: twoColumns ? 1180 : withAside ? 1040 : 640,
              mx: 'auto',
              px: { xs: 2, sm: 3 },
              pt: 0.5,
              pb: 3,
              display: 'grid',
              gridTemplateColumns: withAside
                ? 'minmax(0, 1fr) 320px'
                : 'minmax(0, 1fr)',
              gap: 3,
              alignItems: 'start',
            }}
          >
            <Box
              sx={{
                display: 'flex',
                flexDirection: 'column',
                gap: 2,
                minWidth: 0,
              }}
            >
              <Box
                data-editor-section='task'
                sx={{ display: 'flex', flexDirection: 'column', gap: 1 }}
              >
                <Input
                  aria-label={t('taskEditor.taskName2')}
                  placeholder={t('taskEditor.whatNeedsToBeDone')}
                  value={name}
                  error={Boolean(errors.name)}
                  onChange={e => setName(e.target.value)}
                  sx={{
                    minHeight: 56,
                    borderRadius: '16px',
                    bgcolor: 'background.surface',
                    '& input': {
                      fontFamily: 'display',
                      fontSize: 22,
                      fontWeight: 600,
                    },
                  }}
                />
                {errors.name ? (
                  <FormHelperText sx={{ color: 'danger.plainColor', mx: 0.5 }}>
                    {errors.name}
                  </FormHelperText>
                ) : (
                  !withAside && <TaskSummary parts={summary} sx={{ mx: 0.5 }} />
                )}
              </Box>
              {Object.keys(errors).length > 1 && (
                <Alert color='danger' variant='soft'>
                  <Box>
                    <Typography level='title-sm'>
                      {t('taskEditor.checkTheseSettingsBeforeSaving')}
                    </Typography>
                    {Object.entries(errors).map(([key, message]) => (
                      <Button
                        key={key}
                        variant='plain'
                        color='danger'
                        size='sm'
                        onClick={() => focusError(key)}
                      >
                        {message}
                      </Button>
                    ))}
                  </Box>
                </Alert>
              )}
              {twoColumns ? (
                <Box
                  sx={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(2, minmax(0, 1fr))',
                    gap: 2,
                    alignItems: 'start',
                  }}
                >
                  {column(
                    <>
                      {who}
                      {reward}
                    </>,
                  )}
                  {column(
                    <>
                      {when}
                      {more}
                    </>,
                  )}
                </Box>
              ) : (
                <>
                  {who}
                  {when}
                  {reward}
                  {more}
                </>
              )}
            </Box>
            {withAside && (
              <Box sx={{ position: 'sticky', top: 0 }}>
                <EditorPreview
                  name={name}
                  points={points}
                  mode={shownMode}
                  slots={hasSlots ? frequencyMetadata.slots : []}
                  parts={summary}
                  actions={
                    <Box
                      sx={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 1,
                        mt: 0.5,
                      }}
                    >
                      {copiesChoice}
                      {buttons}
                    </Box>
                  }
                />
              </Box>
            )}
          </Box>
        </Box>

        {!withAside && (
          <Box
            component='footer'
            sx={{
              flexShrink: 0,
              borderTop: '1px solid',
              borderColor: 'divider',
              bgcolor: 'background.surface',
              pt: 1.5,
              px: 2,
              pb: getSafeBottomPadding(2),
            }}
          >
            <Box
              sx={{
                maxWidth: 640,
                mx: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 1,
              }}
            >
              {copiesChoice}
              {buttons}
            </Box>
          </Box>
        )}
      </Sheet>
      <AttachmentViewerModal config={attachmentViewerConfig} />
      <ConfirmationModal config={confirmModelConfig} />
      {addLabelModalOpen && (
        <LabelModal
          isOpen={addLabelModalOpen}
          onSave={label => {
            setUserLabels([...userLabels, label])
            setLabelsV2([...labelsV2, label])
            setAddLabelModalOpen(false)
          }}
          onClose={() => setAddLabelModalOpen(false)}
        />
      )}
    </EditorContainer>
  )
}

export default function ChoreEditorRoute() {
  const location = useLocation()
  return <ChoreEdit key={location.key} />
}
