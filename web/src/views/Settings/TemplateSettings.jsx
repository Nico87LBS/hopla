import { FileDownload, FileUpload } from '@mui/icons-material'
import {
  Alert,
  Box,
  Button,
  Card,
  Checkbox,
  Chip,
  Radio,
  RadioGroup,
  Stack,
  Typography,
} from '@mui/joy'
import { useQueryClient } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import { useFamilyMembers, useUserProfile } from '../../queries/UserQueries'
import { useNotification } from '../../service/NotificationProvider'
import {
  CreateChore,
  CreateLabel,
  CreateReward,
  GetChoresWithSubtasks,
  GetGameRules,
  GetLabels,
  GetPointsPresets,
  GetQuests,
  GetRanks,
  GetRewards,
  SaveGameRules,
  SavePointsPreset,
  SaveQuest,
  SaveRanks,
} from '../../utils/Fetcher'
import {
  applyImport,
  buildTemplate,
  planImport,
  readTemplate,
  SECTIONS,
} from '../../utils/templatePack'
import { isParentUser } from '../../utils/UserHelpers'
import { MemberAvatar } from '../Games/GameParts'
import SettingsLayout from './SettingsLayout'

const list = data => (Array.isArray(data) ? data : data?.res || [])

// What the instance holds, read the same way for export and import.
const loadInstance = async () => {
  const [chores, labels, rewards, presets, rules, ranks, quests] =
    await Promise.all([
      GetChoresWithSubtasks(),
      GetLabels(),
      GetRewards(),
      GetPointsPresets(),
      GetGameRules(),
      GetRanks(),
      GetQuests(),
    ])
  return {
    chores: list(chores),
    labels: list(labels),
    rewards: list(rewards),
    presets: list(presets),
    rules: rules?.res || null,
    ranks: list(ranks),
    quests: list(quests),
  }
}

// The Fetcher calls answer a Response; an import step fails on an error.
const ok = async response => {
  if (response && response.ok === false) throw new Error('Request failed')
  return typeof response?.json === 'function' ? response.json() : response
}

const api = {
  createLabel: async label => (await ok(await CreateLabel(label))).res,
  createChore: async chore => (await ok(await CreateChore(chore))).res,
  createReward: async reward => {
    const created = await CreateReward(reward)
    if (created?.error) throw new Error(created.error)
  },
  savePreset: async preset => ok(await SavePointsPreset(preset)),
  saveRules: async rules => ok(await SaveGameRules(rules)),
  saveRanks: async ranks => ok(await SaveRanks(ranks)),
  saveQuest: async quest => ok(await SaveQuest(quest)),
}

const today = () => new Date().toISOString().slice(0, 10)

const SectionPicker = ({ available = SECTIONS, onChange, sections }) => {
  const { t } = useTranslation('settings')
  return (
    <Stack direction='row' flexWrap='wrap' gap={2} sx={{ my: 2 }}>
      {available.map(section => (
        <Checkbox
          key={section}
          label={t(`template.sections.${section}`)}
          checked={sections.includes(section)}
          onChange={e =>
            onChange(
              e.target.checked
                ? [...sections, section]
                : sections.filter(s => s !== section),
            )
          }
        />
      ))}
    </Stack>
  )
}

const ExportCard = () => {
  const { t } = useTranslation('settings')
  const { showNotification } = useNotification()
  const [sections, setSections] = useState(SECTIONS)
  const [busy, setBusy] = useState(false)

  const exportTemplate = async () => {
    setBusy(true)
    try {
      const template = buildTemplate(await loadInstance(), sections)
      const blob = new Blob([JSON.stringify(template, null, 2)], {
        type: 'application/json',
      })
      const link = document.createElement('a')
      link.href = URL.createObjectURL(blob)
      link.download = `hopla-modele-${today()}.json`
      link.click()
      URL.revokeObjectURL(link.href)
    } catch {
      showNotification({ type: 'error', message: t('template.exportFailed') })
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card variant='outlined'>
      <Typography level='title-lg'>{t('template.export.title')}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('template.export.description')}
      </Typography>
      <SectionPicker sections={sections} onChange={setSections} />
      <Box>
        <Button
          startDecorator={<FileDownload />}
          loading={busy}
          disabled={!sections.length}
          onClick={exportTemplate}
        >
          {t('template.export.button')}
        </Button>
      </Box>
    </Card>
  )
}

const PlanLine = ({ label, part }) => {
  const { t } = useTranslation('settings')
  if (!part) return null
  return (
    <Typography level='body-sm'>
      {t('template.import.line', {
        label,
        added: t('template.import.newCount', { count: part.added.length }),
      })}
      {part.skipped.length > 0 &&
        ` · ${t('template.import.skippedCount', { count: part.skipped.length })}`}
    </Typography>
  )
}

const ImportCard = () => {
  const { t } = useTranslation('settings')
  const queryClient = useQueryClient()
  const { data: membersData } = useFamilyMembers()
  const members = useMemo(
    () => (membersData?.res || []).filter(m => m.isActive !== false),
    [membersData?.res],
  )
  const [template, setTemplate] = useState(null)
  const [instance, setInstance] = useState(null)
  const [fileError, setFileError] = useState(null)
  const [sections, setSections] = useState(SECTIONS)
  const [assignees, setAssignees] = useState([])
  const [perMember, setPerMember] = useState(false)
  const [busy, setBusy] = useState(false)
  const [report, setReport] = useState(null)

  const available = template ? SECTIONS.filter(s => template[s]) : []
  const plan = useMemo(
    () => template && instance && planImport(template, instance, sections),
    [template, instance, sections],
  )

  const readFile = async event => {
    const file = event.target.files?.[0]
    event.target.value = ''
    if (!file) return
    setReport(null)
    setFileError(null)
    try {
      const read = readTemplate(await file.text())
      setInstance(await loadInstance())
      setTemplate(read)
      setSections(SECTIONS.filter(s => read[s]))
    } catch (error) {
      setTemplate(null)
      setFileError(
        ['notJson', 'notTemplate', 'tooNew'].includes(error.message)
          ? error.message
          : 'loadFailed',
      )
    }
  }

  const toggleMember = userId =>
    setAssignees(current =>
      current.includes(userId)
        ? current.filter(id => id !== userId)
        : [...current, userId],
    )

  const runImport = async () => {
    setBusy(true)
    try {
      const result = await applyImport(
        plan,
        {
          members: assignees,
          perMember: perMember && assignees.length > 1,
          now: new Date(),
          labels: instance.labels,
          chores: instance.chores,
        },
        api,
      )
      setReport(result)
      setTemplate(null)
      for (const key of [
        'chores',
        'labels',
        'rewards',
        'pointsPresets',
        'games',
      ]) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <Card variant='outlined'>
      <Typography level='title-lg'>{t('template.import.title')}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
        {t('template.import.description')}
      </Typography>
      <Box>
        <Button
          component='label'
          variant='outlined'
          startDecorator={<FileUpload />}
        >
          {t('template.import.choose')}
          <input
            type='file'
            accept='application/json,.json'
            hidden
            onChange={readFile}
          />
        </Button>
      </Box>

      {fileError && (
        <Alert color='danger'>{t(`template.errors.${fileError}`)}</Alert>
      )}

      {template && plan && (
        <>
          <SectionPicker
            sections={sections}
            onChange={setSections}
            available={available}
          />
          <Stack gap={0.5}>
            <PlanLine label={t('template.sections.tasks')} part={plan.tasks} />
            <PlanLine
              label={t('template.sections.rewards')}
              part={plan.rewards}
            />
            <PlanLine
              label={t('template.sections.presets')}
              part={plan.presets}
            />
            <PlanLine label={t('template.import.quests')} part={plan.quests} />
            {(plan.rules || plan.ranks) && (
              <Typography level='body-sm' sx={{ color: 'warning.plainColor' }}>
                {t('template.import.replacesGames')}
              </Typography>
            )}
          </Stack>

          {plan.tasks?.added.length > 0 && (
            <Box>
              <Typography level='title-sm' sx={{ mt: 1 }}>
                {t('template.import.assignTitle')}
              </Typography>
              <Typography level='body-xs' sx={{ color: 'text.secondary' }}>
                {t('template.import.assignHelp')}
              </Typography>
              <Stack direction='row' flexWrap='wrap' gap={1} sx={{ my: 1 }}>
                {members.map(m => (
                  <Chip
                    key={m.userId}
                    size='lg'
                    variant={assignees.includes(m.userId) ? 'solid' : 'soft'}
                    color={assignees.includes(m.userId) ? 'primary' : 'neutral'}
                    onClick={() => toggleMember(m.userId)}
                    startDecorator={<MemberAvatar member={m} size={24} />}
                  >
                    {m.displayName}
                  </Chip>
                ))}
              </Stack>
              {assignees.length > 1 && (
                <RadioGroup
                  value={perMember ? 'each' : 'shared'}
                  onChange={e => setPerMember(e.target.value === 'each')}
                >
                  <Radio value='shared' label={t('template.import.shared')} />
                  <Radio value='each' label={t('template.import.perMember')} />
                </RadioGroup>
              )}
            </Box>
          )}

          <Box>
            <Button
              startDecorator={<FileUpload />}
              loading={busy}
              disabled={!sections.length}
              onClick={runImport}
            >
              {t('template.import.button')}
            </Button>
          </Box>
        </>
      )}

      {report && (
        <Alert color={report.errors.length ? 'warning' : 'success'}>
          <Stack>
            <Typography level='body-sm'>
              {t('template.report.done', {
                tasks: report.tasks,
                rewards: report.rewards,
                presets: report.presets,
                quests: report.quests,
              })}
            </Typography>
            {report.errors.length > 0 && (
              <Typography level='body-sm'>
                {t('template.report.failed', {
                  names: [...new Set(report.errors.map(e => e.name))].join(
                    ', ',
                  ),
                })}
              </Typography>
            )}
          </Stack>
        </Alert>
      )}
    </Card>
  )
}

const TemplateSettings = () => {
  const { t } = useTranslation('settings')
  const { data: userProfile } = useUserProfile()

  return (
    <SettingsLayout title={t('template.title')}>
      <Typography level='body-md' sx={{ mb: 2, color: 'text.secondary' }}>
        {t('template.intro')}
      </Typography>
      {isParentUser(userProfile) ? (
        <Stack gap={2}>
          <ExportCard />
          <ImportCard />
        </Stack>
      ) : (
        <Alert color='neutral'>{t('template.parentsOnly')}</Alert>
      )}
    </SettingsLayout>
  )
}

export default TemplateSettings
