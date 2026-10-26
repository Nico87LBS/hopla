import { Add, KeyboardArrowDown } from '@mui/icons-material'
import {
  Box,
  Button,
  Dropdown,
  Menu,
  MenuButton,
  MenuItem,
  Typography,
} from '@mui/joy'
import { useMediaQuery } from '@mui/material'
import { useQueryClient } from '@tanstack/react-query'
import * as chrono from 'chrono-node'
import moment from 'moment'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { flushSync } from 'react-dom'
import { useTranslation } from 'react-i18next'

import KeyboardShortcutHint from '../../components/common/KeyboardShortcutHint'
import ModalActions from '../../components/common/ModalActions'
import { useModalShortcutScope } from '../../contexts/KeyboardShortcutScopeContext'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import { useCreateChore } from '../../queries/ChoreQueries'
import { useCircleMembers, useUserProfile } from '../../queries/UserQueries'
import LABEL_COLORS, { TASK_COLOR } from '../../utils/Colors'
import { CreateLabel } from '../../utils/Fetcher'
import { withRepeatTime } from '../../utils/repeatTime.js'
import { generateUUID } from '../../utils/UUID'
import { useLabels } from '../Labels/LabelQueries'
import AdvancedOptionsSection, {
  AdvancedOptionsTrigger,
} from './AdvancedOptionsSection'
import AssigneePickerField from './AssigneePickerField'
import AttachmentPickerField from './AttachmentPickerField'
import {
  parseAssignees,
  parseDueDate,
  parseLabels,
  parsePoints,
  parsePriority,
  parseRepeatV2,
} from './CustomParsers'
import DueDatePickerField from './DueDatePickerField'
import { combineDueDate } from './DueDatePickerModal'
import LabelsPickerField from './LabelsPickerField'
import NotificationPickerField from './NotificationPickerField'
import PriorityPickerField from './PriorityPickerField'
import RepeatPickerField from './RepeatPickerField'
import RichTextEditor from './RichTextEditor'
import SmartTaskTitleInput from './SmartTaskTitleInput'
import SubTasks from './SubTask'

// Canonical reminder template shape, shared with NotificationTemplate: a
// signed value plus 'm' | 'h' | 'd'. Negative is before due, positive is
// after, zero is on due.
const DEFAULT_NOTIFICATION_TEMPLATES = [
  { value: -1, unit: 'd' },
  { value: 0, unit: 'm' },
  { value: 1, unit: 'd' },
]

const UNIT_ALIASES = {
  minute: 'm',
  minutes: 'm',
  hour: 'h',
  hours: 'h',
  day: 'd',
  days: 'd',
}

// Earlier builds stored {value: 1, unit: 'days', type: 'before'}. Nothing reads
// `type`, and the scheduler's unit switch falls through on 'days', so those
// entries fired at the due time (or collided on id) instead of offsetting.
const normalizeTemplate = template => {
  const unit = UNIT_ALIASES[template.unit] || template.unit
  const value = Number(template.value) || 0
  if (!template.type) return { value, unit }
  if (template.type === 'ondue') return { value: 0, unit }
  return {
    value: template.type === 'before' ? -Math.abs(value) : Math.abs(value),
    unit,
  }
}

const getDefaultNotification = () => {
  const storedDefault = localStorage.getItem('defaultNotificationTemplate')
  if (storedDefault) {
    try {
      const parsed = JSON.parse(storedDefault)
      if (Array.isArray(parsed)) {
        // An empty list is a deliberate "no reminders by default", not a
        // missing value — respect it instead of re-seeding.
        const normalized = parsed.map(normalizeTemplate)
        if (JSON.stringify(normalized) !== storedDefault) {
          localStorage.setItem(
            'defaultNotificationTemplate',
            JSON.stringify(normalized),
          )
        }
        return normalized
      }
    } catch {
      // fall through and reset to the defaults below
    }
  }

  localStorage.setItem(
    'defaultNotificationTemplate',
    JSON.stringify(DEFAULT_NOTIFICATION_TEMPLATES),
  )
  return DEFAULT_NOTIFICATION_TEMPLATES
}

const PRIORITY_COLORS = {
  0: TASK_COLOR.NO_PRIORITY,
  1: TASK_COLOR.PRIORITY_1,
  2: TASK_COLOR.PRIORITY_2,
  3: TASK_COLOR.PRIORITY_3,
  4: TASK_COLOR.PRIORITY_4,
}

const PRIORITY_LABELS = {
  0: '--',
  1: 'P1',
  2: 'P2',
  3: 'P3',
  4: 'P4',
}

// Static option sets for the smart input's trigger suggestions
const PRIORITY_SUGGESTIONS = {
  value: 'id',
  display: 'name',
  options: [
    { id: '1', name: 'P1' },
    { id: '2', name: 'P2' },
    { id: '3', name: 'P3' },
    { id: '4', name: 'P4' },
  ],
}

const POINTS_SUGGESTIONS = {
  value: 'id',
  display: 'name',
  options: [
    { id: '1', name: '1 point' },
    { id: '5', name: '5 points' },
    { id: '10', name: '10 points' },
    { id: '25', name: '25 points' },
    { id: '50', name: '50 points' },
    { id: '100', name: '100 points' },
  ],
}

// Delay between the last keystroke and the smart-input parse. Parsing (chrono
// especially) is too heavy to run per keystroke; submitChore flushes a pending
// parse so a fast type-then-Enter never creates from stale parsed state.
const PARSE_DEBOUNCE_MS = 150

const TaskInput = ({ isModalOpen, onChoreUpdate, onClose }) => {
  const { t } = useTranslation('chores')
  // Claims the keyboard while open so background listeners know to stay out
  // of the way — see
  // KeyboardShortcutScopeContext.
  const isShortcutScopeActive = useModalShortcutScope(isModalOpen)
  const { ResponsiveModal } = useResponsiveModal()
  const isMobile = useMediaQuery(theme => theme.breakpoints.down('sm'))
  const pickerEmptyDisplay = isMobile ? 'icon' : 'icon-text'
  const { data: userLabels, isLoading: userLabelsLoading } = useLabels()
  const { data: circleMembers, isLoading: isCircleMembersLoading } =
    useCircleMembers()
  const createChoreMutation = useCreateChore()
  const queryClient = useQueryClient()

  const { data: userProfile } = useUserProfile()

  const handleCreateLabel = useCallback(
    name => {
      const color =
        LABEL_COLORS[1 + Math.floor(Math.random() * (LABEL_COLORS.length - 1))]
          .value
      CreateLabel({ name, color })
        .then(() => queryClient.invalidateQueries({ queryKey: ['labels'] }))
        .catch(error => console.error('Error creating label:', error))
    },
    [queryClient],
  )

  const [taskText, setTaskText] = useState('')
  const [taskTitle, setTaskTitle] = useState('')
  // Highlight spans paired with the text they were computed from: the parse
  // is debounced, so while typing these lag behind taskText
  const [renderedParts, setRenderedParts] = useState({ text: '', parts: [] })

  // What the smart input overlay shows. While a parse is pending, keep every
  // highlight span that precedes the edit point and render the rest as plain
  // text — existing token styles must not flicker away on each keystroke.
  const displayedParts = useMemo(() => {
    const { parts, text } = renderedParts
    if (text === taskText) return parts

    let prefixLen = 0
    const max = Math.min(text.length, taskText.length)
    while (prefixLen < max && text[prefixLen] === taskText[prefixLen]) {
      prefixLen++
    }

    const kept = []
    let consumed = 0
    for (const part of parts) {
      const partText = typeof part === 'string' ? part : part.props.children
      if (consumed + partText.length > prefixLen) break
      kept.push(part)
      consumed += partText.length
    }
    kept.push(taskText.slice(consumed))
    return kept
  }, [renderedParts, taskText])

  const richTextEditorRef = useRef(null)
  const latestRef = useRef({})
  // True while the current assignees came from an @mention in the text, so a
  // reparse without mentions only resets what a mention set — never a
  // selection made directly in the assignee picker
  const assigneesFromMentionRef = useRef(false)
  // Pending debounced parse of the smart input text, if any
  const parseTimerRef = useRef(null)
  // Identities (type + text) of the highlights from the previous parse, so
  // the appear animation only plays for tokens detected just now
  const prevHighlightKeysRef = useRef(new Set())
  const [priority, setPriority] = useState(0)
  const [description, setDescription] = useState(null)
  const [assignees, setAssignees] = useState([])
  const [labelsV2, setLabelsV2] = useState([])
  const [frequency, setFrequency] = useState(null)
  // Lazy initializers: these read localStorage, which must not happen on
  // every render
  const [notificationMetadata, setNotificationMetadata] = useState(() => ({
    templates: getDefaultNotification(),
  }))
  const [subTasks, setSubTasks] = useState(null)
  const [points, setPoints] = useState(-1)
  const [isAnyoneTask, setIsAnyoneTask] = useState(false)
  const [hasDescription, setHasDescription] = useState(false)
  const [hasSubTasks, setHasSubTasks] = useState(false)
  const [deadlineOffset, setDeadlineOffset] = useState(-1)
  const [requireApproval, setRequireApproval] = useState(false)
  const [completionWindow, setCompletionWindow] = useState(-1)
  const [assignStrategy, setAssignStrategy] = useState('keep_last_assigned')
  const [isPrivate, setIsPrivate] = useState(false)
  const [showAdvanced, setShowAdvanced] = useState(false)
  const [dueDateOnly, setDueDateOnly] = useState(null)
  const [dueTime, setDueTime] = useState(null)
  const [useCustomTime, setUseCustomTime] = useState(false)
  // These three are the source of truth; the due date is only their
  // combination. It used to be a fourth piece of state that every handler
  // recomputed for itself, which meant the picker's Apply — three callbacks
  // in one batch — had each of them reading stale siblings and the chosen
  // time losing to the end-of-day fallback.
  const dueDate = useMemo(() => {
    const combined = combineDueDate({ dueDateOnly, dueTime, useCustomTime })
    return combined ? moment(combined).format('YYYY-MM-DDTHH:mm:ss') : null
  }, [dueDateOnly, dueTime, useCustomTime])
  const [showKeyboardShortcuts, setShowKeyboardShortcuts] = useState(false)
  // Once "Create & add another" is picked, the primary button switches to
  // that action for the rest of this modal session (until it closes) —
  // picking it once means the user is batching tasks, not just this one.
  const [continuousMode, setContinuousMode] = useState(false)
  const [attachments, setAttachments] = useState([])

  const [draftId, setDraftId] = useState(() => generateUUID())

  const assignableMembers = useMemo(
    () => circleMembers?.res || [],
    [circleMembers],
  )

  const smartInputSuggestions = useMemo(
    () => ({
      '#': {
        value: 'id',
        display: 'name',
        options: userLabels || [],
        creatable: true,
        onCreate: handleCreateLabel,
      },
      '!': PRIORITY_SUGGESTIONS,
      '@': {
        value: 'userId',
        display: 'displayName',
        options: [
          { userId: 'anyone', displayName: t('addTask.anyone') },
          ...assignableMembers,
        ],
      },
      '*': POINTS_SUGGESTIONS,
    }),
    [userLabels, assignableMembers, handleCreateLabel, t],
  )

  // set showKeyboardShortcuts true as soon as the user hold ctrl or cmd key:
  useEffect(() => {
    if (hasDescription && richTextEditorRef.current) {
      // Small delay to ensure the component is fully rendered
      setTimeout(() => {
        richTextEditorRef.current.focus()
      }, 100)
    }
  }, [hasDescription])

  useEffect(() => {
    const handleKeyDown = event => {
      const {
        dueDate,
        handleCloseModal,
        hasDescription,
        isShortcutScopeActive,
        submitChore,
      } = latestRef.current
      // Only the modal that currently owns the keyboard (the topmost open
      // one, if this component is ever nested) should react at all —
      // otherwise a background instance of this same component would also
      // process keys meant for whatever's on top of it, including showing
      // its own shortcut hints.
      if (!isShortcutScopeActive) return
      // Holding a key (or a fast physical double-tap that the OS coalesces
      // into auto-repeat) re-fires 'keydown' for as long as it's down. None
      // of the shortcuts below are meant to repeat — Cmd+J revealing
      // subtasks a second time just steals focus away from wherever the
      // user actually is.
      if (event.repeat) return

      const isHoldingCmd = event.ctrlKey || event.metaKey
      if (isHoldingCmd) {
        setShowKeyboardShortcuts(true)
      }
      if (isHoldingCmd && event.key.toLowerCase() === 'e' && !hasDescription) {
        setHasDescription(true)
        setShowKeyboardShortcuts(false)
      }
      if (isHoldingCmd && event.key.toLowerCase() === 'j') {
        setHasSubTasks(true)
        setShowKeyboardShortcuts(false)
      }
      if (isHoldingCmd && event.key.toLowerCase() === 'b' && !dueDate) {
        const tomorrow = moment().add(1, 'day')
        setDueDateOnly(tomorrow.format('YYYY-MM-DD'))
        setUseCustomTime(false)
        setDueTime(null)
        setShowKeyboardShortcuts(false)
      }
      if (event.key === 'Enter' && isHoldingCmd) {
        event.preventDefault()
        submitChore()
        return
      }
      if (event.key === 'Escape') {
        event.preventDefault()
        handleCloseModal()
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
  }, [])

  const renderHighlightedSentence = useCallback(
    (
      sentence,
      repeatHighlight,
      priorityHighlight,
      labelsHighlight,
      dueDateHighlight,
      pointsHighlight,
      assigneesHighlight,
    ) => {
      const parts = []
      let lastIndex = 0
      let plainText = ''

      // Combine all highlight ranges and sort them by their start index
      const allHighlights = []
      if (repeatHighlight) {
        repeatHighlight.forEach(h =>
          allHighlights.push({ ...h, type: 'repeat', priority: 60 }),
        )
      }
      if (priorityHighlight) {
        priorityHighlight.forEach(h =>
          allHighlights.push({ ...h, type: 'priority', priority: 50 }),
        )
      }
      if (pointsHighlight) {
        pointsHighlight.forEach(h =>
          allHighlights.push({ ...h, type: 'points', priority: 45 }),
        )
      }
      if (assigneesHighlight) {
        assigneesHighlight.forEach(h =>
          allHighlights.push({ ...h, type: 'assignee', priority: 40 }),
        )
      }
      if (labelsHighlight) {
        labelsHighlight.forEach(h =>
          allHighlights.push({ ...h, type: 'label', priority: 30 }),
        )
      }
      if (dueDateHighlight) {
        allHighlights.push({
          ...dueDateHighlight,
          type: 'dueDate',
          priority: 20,
        })
      }

      allHighlights.sort((a, b) => a.start - b.start)
      const resolvedHighlights = []
      for (let i = 0; i < allHighlights.length; i++) {
        const current = allHighlights[i]
        const previous = resolvedHighlights[resolvedHighlights.length - 1]

        if (previous && current.start < previous.end) {
          if (current.priority > previous.priority) {
            resolvedHighlights.pop()
            resolvedHighlights.push(current)
          }
        } else {
          resolvedHighlights.push(current)
        }
      }

      const seenHighlightKeys = new Set()
      for (const highlight of resolvedHighlights) {
        if (highlight.start > lastIndex) {
          const textBefore = sentence.substring(lastIndex, highlight.start)
          parts.push(textBefore)
          plainText += textBefore
        }

        let className = ''
        switch (highlight.type) {
          case 'repeat':
            className = 'highlight-repeat'
            break
          case 'priority':
            className = 'highlight-priority'
            break
          case 'points':
            className = 'highlight-points'
            break
          case 'assignee':
            className = 'highlight-assignee'
            break
          case 'label':
            className = 'highlight-label'
            break
          case 'dueDate':
            className = 'highlight-date'
            break
          default:
            break
        }

        const highlightedText = sentence.substring(
          highlight.start,
          highlight.end,
        )
        const highlightKey = `${highlight.type}:${highlightedText.toLowerCase()}`
        const isNewHighlight = !prevHighlightKeysRef.current.has(highlightKey)
        seenHighlightKeys.add(highlightKey)
        parts.push(
          <span
            key={highlight.start}
            className={`${className}${isNewHighlight ? ' highlight-appear' : ''}`}
            style={{
              textDecoration: 'underline',
              textDecorationThickness: '2px',
              textDecorationStyle: 'dashed',
            }}
          >
            {highlightedText}
          </span>,
        )

        lastIndex = highlight.end
      }
      prevHighlightKeysRef.current = seenHighlightKeys

      if (lastIndex < sentence.length) {
        const remainingText = sentence.substring(lastIndex)
        parts.push(remainingText)
        plainText += remainingText
      }

      return {
        parts,
        plainText,
      }
    },
    [],
  )

  // Rebuilt only when the member list actually changes, so a query refetch
  // with identical data doesn't re-trigger the parse effect below
  const assigneesForParsing = useMemo(
    () =>
      assignableMembers.map(member => ({
        userId: member.userId,
        username:
          member.username ||
          member.displayName?.toLowerCase().replace(/\s+/g, ''),
        displayName: member.displayName,
        name: member.displayName,
        id: member.userId,
      })),
    [assignableMembers],
  )

  const processText = useCallback(
    sentence => {
      const priority = parsePriority(sentence)
      const pointsParsed = parsePoints(sentence)
      const labels = parseLabels(sentence, userLabels || [])

      const assigneesResult = parseAssignees(sentence, assigneesForParsing)
      const repeat = parseRepeatV2(sentence)
      const dueDateParsed = parseDueDate(sentence, chrono)

      // Set all the parsed values
      if (priority.result) setPriority(parseInt(priority.result, 10))
      if (pointsParsed.result) setPoints(pointsParsed.result)
      if (labels.result) {
        // parseLabels only returns #mentions matched to an existing label
        setLabelsV2(labels.result)
      }

      if (assigneesResult.isAnyone) {
        // @Anyone was used - set empty assignees (anyone can do the task)
        setIsAnyoneTask(true)
        setAssignees([])
        assigneesFromMentionRef.current = true
      } else if (assigneesResult.result && assigneesResult.result.length > 0) {
        setIsAnyoneTask(false)
        const parsedAssignees = assigneesResult.result.map(assignee => ({
          userId: assignee.userId,
        }))
        setAssignees(parsedAssignees)
        assigneesFromMentionRef.current = true
      } else if (assigneesFromMentionRef.current) {
        // The @mention that set the current assignees was deleted. An empty
        // selection is assigned to the current user when the task is created.
        // Picker selections stay untouched.
        assigneesFromMentionRef.current = false
        setIsAnyoneTask(false)
        setAssignees([])
      }

      if (repeat.result) {
        setFrequency(repeat.result)
      }

      const syncDueDateStates = parsedDate => {
        const m = moment(parsedDate)
        const dateOnly = m.format('YYYY-MM-DD')
        const timeOnly = m.format('HH:mm')
        setDueDateOnly(dateOnly)
        if (timeOnly !== '23:59') {
          setUseCustomTime(true)
          setDueTime(timeOnly)
        } else {
          setUseCustomTime(false)
          setDueTime(null)
        }
      }

      let dueDateHighlight = null
      if (dueDateParsed.result) {
        syncDueDateStates(dueDateParsed.result)
        dueDateHighlight = dueDateParsed.highlight[0]
      } else if (repeat.dueDate) {
        syncDueDateStates(repeat.dueDate)
      }

      // Create the cleaned sentence by sequentially applying all cleanups.
      // Each stage only needs a reparse when an earlier cleanup actually
      // changed the sentence; otherwise the first-pass result (computed on the
      // identical string) is reused as-is.
      let cleanedSentence = sentence
      if (priority.result) cleanedSentence = priority.cleanedSentence
      if (pointsParsed.result) {
        const pointsReparse =
          cleanedSentence === sentence
            ? pointsParsed
            : parsePoints(cleanedSentence)
        if (pointsReparse.result)
          cleanedSentence = pointsReparse.cleanedSentence
      }
      if (labels.result) {
        const labelsReparse =
          cleanedSentence === sentence
            ? labels
            : parseLabels(cleanedSentence, userLabels || [])
        if (labelsReparse.result)
          cleanedSentence = labelsReparse.cleanedSentence
      }
      if (assigneesResult.result) {
        const assigneesReparse =
          cleanedSentence === sentence
            ? assigneesResult
            : parseAssignees(cleanedSentence, assigneesForParsing)
        if (assigneesReparse.result)
          cleanedSentence = assigneesReparse.cleanedSentence
      }
      if (repeat.result) {
        const repeatReparse =
          cleanedSentence === sentence ? repeat : parseRepeatV2(cleanedSentence)
        if (repeatReparse.result)
          cleanedSentence = repeatReparse.cleanedSentence
      }
      if (dueDateParsed.result) {
        const dueDateReparse =
          cleanedSentence === sentence
            ? dueDateParsed
            : parseDueDate(cleanedSentence, chrono)
        if (dueDateReparse.result)
          cleanedSentence = dueDateReparse.cleanedSentence
      }

      setTaskText(sentence)
      setTaskTitle(cleanedSentence.trim())

      // Generate highlights for rendering using original sentence positions
      const { parts } = renderHighlightedSentence(
        sentence,
        repeat.highlight,
        priority.highlight,
        labels.highlight,
        dueDateHighlight,
        pointsParsed.highlight,
        assigneesResult.highlight,
      )

      setRenderedParts({ text: sentence, parts })
    },
    [userLabels, renderHighlightedSentence, assigneesForParsing],
  )

  useEffect(() => {
    if (
      !isModalOpen ||
      userLabelsLoading ||
      isCircleMembersLoading ||
      !userProfile
    ) {
      return
    }

    // Debounced so fast typing doesn't run the full parse pipeline per
    // keystroke; submitChore flushes a pending parse before creating.
    parseTimerRef.current = setTimeout(() => {
      parseTimerRef.current = null
      processText(taskText)
    }, PARSE_DEBOUNCE_MS)
    return () => {
      clearTimeout(parseTimerRef.current)
      parseTimerRef.current = null
    }
  }, [
    taskText,
    userLabelsLoading,
    isCircleMembersLoading,
    isModalOpen,
    userProfile,
    processText,
  ])

  const handleDueDateChange = e => {
    setDueDateOnly(e.target.value || null)
  }

  const handleDueTimeChange = e => {
    const timeValue = e.target.value
    setDueTime(timeValue || null)
    // A time typed straight into the field is itself the request for one.
    if (timeValue) setUseCustomTime(true)
  }

  const handleUseCustomTimeChange = checked => {
    setUseCustomTime(checked)
    // Turning the toggle on needs something on the clock to show. The picker
    // sends the real time right after this, and wins.
    if (checked) {
      setDueTime(prev => prev || '18:00')
    } else {
      setDueTime(null)
    }
  }

  // Plain Enter is the fast path for entering several tasks in a row: create
  // this one and leave the form open and blank for the next. Cmd+Enter (the
  // window-level handler below) and the footer's Create button still close
  // the modal.
  const handleEnterPressed = () => {
    submitChore(true)
  }

  // Hands back a blank form, used both on close and by "create & add
  // another".
  const resetFormFields = () => {
    setTaskText('')
    setTaskTitle('')
    setFrequency(null)
    setPriority(0)
    setPoints(-1)
    setIsAnyoneTask(false)
    setHasDescription(false)
    setDescription(null)
    setSubTasks(null)
    setHasSubTasks(false)
    setLabelsV2([])
    setAssignees([])
    assigneesFromMentionRef.current = false
    // Dropped here too or nothing would animate on the next task's parse
    prevHighlightKeysRef.current = new Set()
    setDeadlineOffset(-1)
    setRequireApproval(false)
    setCompletionWindow(-1)
    setAssignStrategy('keep_last_assigned')
    setIsPrivate(false)
    setShowAdvanced(false)
    setDueDateOnly(null)
    setDueTime(null)
    setUseCustomTime(false)
    setAttachments([])
    setDraftId(generateUUID())
  }

  const handleCloseModal = forceRefetch => {
    onClose(forceRefetch)
    resetFormFields()
    setContinuousMode(false)
  }

  const createChore = (andContinue = false) => {
    // Handle different assignee scenarios
    let finalAssignees = assignees
    let finalAssignedTo = null
    let finalAssignStrategy = assignStrategy

    if (isAnyoneTask) {
      finalAssignees = []
      finalAssignedTo = null
      finalAssignStrategy = 'no_assignee'
    } else if (assignees.length === 0) {
      finalAssignees = [{ userId: userProfile?.id }]
      finalAssignedTo = userProfile?.id
      finalAssignStrategy = assignStrategy
    } else {
      finalAssignedTo = assignees[0].userId
      finalAssignStrategy = assignStrategy
    }

    // "always" chores never have a due date — backend keeps nextDueDate null
    // and never archives them on completion (see WhenCard.jsx for the
    // full-edit-form equivalent).
    const isAlwaysAvailable = frequency?.frequencyType === 'always'

    const chore = {
      name: taskTitle,
      description: description,
      assignees: finalAssignees,
      dueDate: isAlwaysAvailable
        ? null
        : dueDate
          ? new Date(dueDate).toISOString()
          : null,
      assignedTo: finalAssignedTo,
      assignStrategy: finalAssignStrategy,
      isRolling: false,
      labelsV2: labelsV2,
      priority: priority ? Number(priority) : 0,
      points: points > -1 ? points : null,
      deadlineOffset: deadlineOffset < 0 ? null : deadlineOffset,
      completionWindow:
        completionWindow < 0 || !dueDate || isAlwaysAvailable
          ? null
          : completionWindow,
      requireApproval: requireApproval,
      isPrivate: isPrivate,
      status: 0,
      frequencyType: 'once',
      frequencyMetadata: {},
      notification: false,
      notificationMetadata: {},
      subTasks: subTasks?.length > 0 ? subTasks : null,
      draftId: draftId,
    }

    // "always" chores are rejected with forbidden_with_trigger_frequency if
    // notification is true, same rule as trigger frequencies.
    const planReminders = notificationMetadata?.templates || []
    const hasReminders = planReminders.length > 0 && !isAlwaysAvailable

    if (frequency) {
      chore.frequencyType = frequency.frequencyType
      chore.frequencyMetadata = withRepeatTime(
        frequency.frequencyType,
        frequency.frequencyMetadata,
        isAlwaysAvailable ? null : dueDate,
      )
      chore.frequency = frequency.frequency
    }
    if (dueDate && !isAlwaysAvailable) {
      // Use RFC3339/ISO-8601 format expected by backend. The backend only
      // derives NextDueDate from what's sent on create (handler.go never
      // computes it from frequencyType), so this must be sent whether or
      // not the task also repeats — otherwise a recurring task created with
      // a due date lands with nextDueDate: null.
      chore.nextDueDate = new Date(dueDate).toISOString()
    }
    if (hasReminders && (frequency || dueDate)) {
      chore.notification = true
      chore.notificationMetadata = {
        ...notificationMetadata,
        templates: planReminders,
      }
    }

    createChoreMutation
      .mutateAsync(chore)
      .then(result => {
        const choreData = result
        if (choreData?._pendingCreate) {
          // Offline: task queued, add temp chore to UI immediately
          onChoreUpdate(choreData)
        } else {
          // Online: choreData is the created chore object returned by the mutation
          onChoreUpdate({
            ...chore,
            ...choreData,
            id: choreData?.id,
            nextDueDate: chore.dueDate,
          })
        }
      })
      .catch(error => {
        console.error('Error creating chore:', error)
      })

    // The create fires above without waiting on the network, so the next
    // blank entry (or the closed modal) shows up immediately either way.
    if (andContinue) {
      resetFormFields()
    } else {
      handleCloseModal(false)
    }
  }

  // All submit paths (Enter, Cmd+Enter, footer button) go through here: a
  // debounce may still be holding the parse of the latest text, and creating
  // from pre-parse state would drop the tail of what the user typed.
  const submitChore = (andContinue = false) => {
    if (parseTimerRef.current) {
      clearTimeout(parseTimerRef.current)
      parseTimerRef.current = null
      flushSync(() => processText(taskText))
    }
    // Read through latestRef: after the flush, this render's createChore
    // closure is stale
    latestRef.current.createChore(andContinue)
  }

  latestRef.current = {
    isModalOpen,
    isShortcutScopeActive,
    hasDescription,
    dueDate,
    createChore,
    submitChore,
    handleCloseModal,
  }

  if (isCircleMembersLoading) {
    return <></>
  }

  return (
    <>
      <ResponsiveModal
        open={isModalOpen}
        onClose={handleCloseModal}
        size='lg'
        fullWidth={true}
        title={t('addTask.title')}
        footer={
          <ModalActions>
            <Button
              variant='outlined'
              color='neutral'
              onClick={handleCloseModal}
            >
              {t('common:cancel')}
              {showKeyboardShortcuts && (
                <KeyboardShortcutHint
                  shortcut='Esc'
                  sx={{ ml: 1 }}
                  withCtrl={false}
                />
              )}
            </Button>
            <Box sx={{ display: 'flex' }}>
              <Button
                variant='solid'
                color='primary'
                disabled={!taskTitle.trim()}
                onClick={() => submitChore(continuousMode)}
                sx={{
                  borderTopRightRadius: 0,
                  borderBottomRightRadius: 0,
                }}
              >
                {continuousMode
                  ? t('addTask.createAnother')
                  : t('addTask.create')}
                {showKeyboardShortcuts && (
                  <KeyboardShortcutHint shortcut='Enter' sx={{ ml: 1 }} />
                )}
              </Button>
              <Dropdown>
                <MenuButton
                  slots={{ root: Button }}
                  slotProps={{
                    root: {
                      variant: 'solid',
                      color: 'primary',
                      disabled: !taskTitle.trim(),
                    },
                  }}
                  sx={{
                    borderTopLeftRadius: 0,
                    borderBottomLeftRadius: 0,
                    borderLeft: '1px solid rgba(255, 255, 255, 0.4)',
                    minWidth: 0,
                    px: 0.75,
                  }}
                >
                  <KeyboardArrowDown sx={{ fontSize: 18 }} />
                </MenuButton>
                <Menu
                  placement='top-end'
                  sx={{ zIndex: 'calc(var(--joy-zIndex-modal) + 1)' }}
                >
                  {continuousMode ? (
                    <MenuItem
                      onClick={() => {
                        setContinuousMode(false)
                        submitChore(false)
                      }}
                    >
                      {t('addTask.createAndClose')}
                    </MenuItem>
                  ) : (
                    <MenuItem
                      onClick={() => {
                        setContinuousMode(true)
                        submitChore(true)
                      }}
                    >
                      {t('addTask.createAndAddAnother')}
                      {showKeyboardShortcuts && (
                        <KeyboardShortcutHint
                          shortcut='Enter'
                          withCmd={false}
                          sx={{ ml: 1 }}
                        />
                      )}
                    </MenuItem>
                  )}
                </Menu>
              </Dropdown>
            </Box>
          </ModalActions>
        }
      >
        <>
          <Box sx={{ mt: 1 }}>
            {/* <Box
                sx={{
                  display: 'flex',
                  flexDirection: 'row',
                  alignItems: 'center',
                }}
              >
                <Typography level='body-sm'>Task in a sentence:</Typography>
                <LearnMoreButton
                  content={
                    <>
                      <Typography level='body-sm' sx={{ mb: 1 }}>
                        This feature lets you create a task simply by typing a
                        sentence. It attempt parses the sentence to identify the
                        task&apos;s due date, priority, and frequency.
                      </Typography>

                      <Typography
                        level='body-sm'
                        sx={{ fontWeight: 'bold', mt: 2 }}
                      >
                        Examples:
                      </Typography>

                      <Typography
                        level='body-sm'
                        component='ul'
                        sx={{ pl: 2, mt: 1, listStyle: 'disc' }}
                      >
                        <li>
                          <strong>Priority:</strong>For highest priority any of
                          the following keyword <em>P1</em>, <em>Urgent</em>,{' '}
                          <em>Important</em>, or <em>ASAP</em>. For lower
                          priorities, use <em>P2</em>, <em>P3</em>, or{' '}
                          <em>P4</em>.
                        </li>
                        <li>
                          <strong>Due date:</strong> Specify dates with phrases
                          like <em>tomorrow</em>, <em>next week</em>,{' '}
                          <em>Monday</em>, or <em>August 1st at 12pm</em>.
                        </li>
                        <li>
                          <strong>Frequency:</strong> Set recurring tasks with
                          terms like <em>daily</em>, <em>weekly</em>,{' '}
                          <em>monthly</em>, <em>yearly</em>, or patterns such as{' '}
                          <em>every Tuesday and Thursday</em>.
                        </li>
                      </Typography>
                    </>
                  }
                />
              </Box> */}

            <SmartTaskTitleInput
              autoFocus
              value={taskText}
              placeholder={t('addTask.taskPlaceholder')}
              onChange={text => {
                setTaskText(text)
                if (!text) setTaskTitle('')
              }}
              customRenderer={displayedParts}
              onEnterPressed={handleEnterPressed}
              onShiftEnterPressed={() => {
                if (!hasDescription) {
                  setHasDescription(true)
                }
                setTimeout(() => richTextEditorRef.current?.focus(), 50)
              }}
              suggestions={smartInputSuggestions}
            />
          </Box>

          <Box
            sx={{
              paddingTop: 2,
              paddingBottom: 1,
              display: 'flex',
              flexDirection: 'row',
              gap: 1.5,
              overflowX: 'auto',
              '&::-webkit-scrollbar': { display: 'none' },
              flexWrap: isMobile ? 'nowrap' : 'wrap',
            }}
          >
            <DueDatePickerField
              emptyDisplay={pickerEmptyDisplay}
              dueDateOnly={dueDateOnly}
              dueTime={dueTime}
              useCustomTime={useCustomTime}
              onDueDateChange={handleDueDateChange}
              onDueTimeChange={handleDueTimeChange}
              onUseCustomTimeChange={handleUseCustomTimeChange}
              onClear={() => {
                setDueDateOnly(null)
                setDueTime(null)
                setUseCustomTime(false)
              }}
            />
            <RepeatPickerField
              emptyDisplay={pickerEmptyDisplay}
              value={frequency}
              onChange={newFrequency => {
                setFrequency(newFrequency)
                // "always" tasks never have a due date — clear whatever
                // was picked so the chips don't show a contradictory state
                if (newFrequency?.frequencyType === 'always') {
                  setDueDateOnly(null)
                  setDueTime(null)
                  setUseCustomTime(false)
                }
              }}
              onClear={() => setFrequency(null)}
            />
            <PriorityPickerField
              value={priority}
              onChange={setPriority}
              onClear={() => setPriority(0)}
              emptyDisplay={pickerEmptyDisplay}
              priorityColors={PRIORITY_COLORS}
              priorityLabels={PRIORITY_LABELS}
            />
            <AssigneePickerField
              emptyDisplay={pickerEmptyDisplay}
              values={assignees.map(a => a.userId)}
              isAnyone={isAnyoneTask}
              onChange={userIds => {
                if (userIds.includes('anyone')) {
                  setIsAnyoneTask(true)
                  setAssignees([])
                } else {
                  setIsAnyoneTask(false)
                  setAssignees(userIds.map(userId => ({ userId })))
                }
              }}
              onClear={() => {
                setIsAnyoneTask(false)
                setAssignees([])
              }}
              members={assignableMembers}
            />
            <LabelsPickerField
              emptyDisplay={pickerEmptyDisplay}
              values={(labelsV2 || []).map(label => label.id)}
              onChange={ids =>
                setLabelsV2(
                  (userLabels || []).filter(label => ids.includes(label.id)),
                )
              }
              onClear={() => setLabelsV2([])}
              labels={userLabels || []}
            />
            <AttachmentPickerField
              attachments={attachments}
              onChange={setAttachments}
              onClear={() => setAttachments([])}
              emptyDisplay={pickerEmptyDisplay}
              entityType='chore_attachment_draft'
              draftId={draftId}
            />
            <NotificationPickerField
              value={notificationMetadata}
              onChange={setNotificationMetadata}
              onClear={() => setNotificationMetadata({ templates: [] })}
              emptyDisplay={pickerEmptyDisplay}
            />
          </Box>

          <Box
            sx={{
              mt: 1,
              display: 'flex',
              flexDirection: 'row',
              gap: 1.5,
              flexWrap: 'wrap',
              alignItems: 'center',
            }}
          >
            {!hasDescription && (
              <Button
                size='sm'
                variant='outlined'
                color='neutral'
                onClick={() => setHasDescription(true)}
                endDecorator={
                  showKeyboardShortcuts && <KeyboardShortcutHint shortcut='E' />
                }
                sx={{
                  borderRadius: '128px',
                  minHeight: 40,
                  px: 1.25,
                  gap: 1,
                  transition: 'all 0.25s ease-in-out',
                }}
              >
                <Add sx={{ fontSize: 20 }} />
                <Typography level='body-sm'>
                  {t('addTask.descriptionChip')}
                </Typography>
              </Button>
            )}
            {!hasSubTasks && (
              <Button
                size='sm'
                variant='outlined'
                color='neutral'
                onClick={() => setHasSubTasks(true)}
                endDecorator={
                  showKeyboardShortcuts && <KeyboardShortcutHint shortcut='J' />
                }
                sx={{
                  borderRadius: '128px',
                  minHeight: 40,
                  px: 1.25,
                  gap: 1,
                  transition: 'all 0.25s ease-in-out',
                }}
              >
                <Add sx={{ fontSize: 20 }} />
                <Typography level='body-sm'>
                  {t('addTask.subtasksChip')}
                </Typography>
              </Button>
            )}
            <AdvancedOptionsTrigger
              open={showAdvanced}
              onToggle={() => setShowAdvanced(v => !v)}
              activeCount={
                [
                  points > -1,
                  requireApproval,
                  completionWindow > -1,
                  deadlineOffset > -1,
                ].filter(Boolean).length
              }
              emptyDisplay={pickerEmptyDisplay}
            />
          </Box>

          <AdvancedOptionsSection
            open={showAdvanced}
            points={points}
            onPointsChange={setPoints}
            requireApproval={requireApproval}
            onRequireApprovalChange={setRequireApproval}
            completionWindow={completionWindow}
            onCompletionWindowChange={setCompletionWindow}
            deadlineOffset={deadlineOffset}
            onDeadlineOffsetChange={setDeadlineOffset}
            assignStrategy={assignStrategy}
            onAssignStrategyChange={setAssignStrategy}
            hasDueDate={!!dueDate}
            hasMultipleAssignees={assignees.length > 1}
            // Empty assignees still implicitly assigns the current user at
            // create time; only an "Anyone" task truly has no assignee
            hasAssignees={!isAnyoneTask}
            isPrivate={isPrivate}
            onIsPrivateChange={setIsPrivate}
          />

          {hasDescription && (
            <Box>
              <Typography level='body-sm'>
                {t('addTask.descriptionLabel')}
              </Typography>
              <div>
                <RichTextEditor
                  ref={richTextEditorRef}
                  onChange={setDescription}
                  value={description || ''}
                  entityType={'chore_description'}
                  draftId={draftId}
                />
              </div>
            </Box>
          )}
          {hasSubTasks && (
            <Box>
              <Typography level='body-sm'>
                {t('addTask.subtasksLabel')}
              </Typography>
              <SubTasks
                editMode={true}
                tasks={subTasks ? subTasks : []}
                setTasks={setSubTasks}
                shouldFocus={true}
              />
            </Box>
          )}
        </>
      </ResponsiveModal>
    </>
  )
}

export default TaskInput
