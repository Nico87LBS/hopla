import {
  AddRounded,
  EditRounded,
  FileDownloadRounded,
  UploadFileRounded,
} from '@mui/icons-material'
import { Box, Button, Chip, Sheet, Stack, Textarea, Typography } from '@mui/joy'
import PropTypes from 'prop-types'
import { useState } from 'react'
import { useTranslation } from 'react-i18next'
import { Link } from 'react-router-dom'

import ModalActions from '../../components/common/ModalActions'
import { useResponsiveModal } from '../../hooks/useResponsiveModal'
import { useImportModule } from '../../queries/LearnQueries'
import { GetLearnModuleFile } from '../../utils/Fetcher'
import { saveFile } from '../../utils/saveFile'
import { surfaceSx } from '../Games/GameParts'
import { useNotify } from './ManageLearn'

// useExportModule hands the file of a module of the family, to send it to
// another family.
export const useExportModule = () => {
  const notify = useNotify()
  const [busy, setBusy] = useState('')
  const exportModule = async id => {
    setBusy(id)
    try {
      const text = await GetLearnModuleFile(id)
      await saveFile(`${id}.json`, text)
    } catch (err) {
      notify('error', err.message)
    } finally {
      setBusy('')
    }
  }
  return [exportModule, busy]
}

// ImportModal takes a module written elsewhere, as a JSON file or text.
const ImportModal = ({ onClose }) => {
  const { t } = useTranslation('learn')
  const { ResponsiveModal } = useResponsiveModal()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const importModule = useImportModule()
  const notify = useNotify()

  const readFile = async e => {
    const file = e.target.files?.[0]
    if (file) setText(await file.text())
    e.target.value = ''
  }

  const send = async () => {
    setError('')
    try {
      const module = await importModule.mutateAsync(text)
      notify('success', t('manage.installed', { name: module.name }))
      onClose()
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <ResponsiveModal
      open
      onClose={onClose}
      size='md'
      title={t('manage.import')}
      footer={
        <ModalActions
          secondary={{ label: t('manage.cancel'), onClick: onClose }}
          primary={{
            label: t('manage.importButton'),
            onClick: send,
            loading: importModule.isPending,
            disabled: !text.trim(),
          }}
        />
      }
    >
      <Stack gap={1.5}>
        <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
          {t('manage.importHelp')}
        </Typography>
        <Button
          component='label'
          variant='soft'
          color='neutral'
          startDecorator={<UploadFileRounded />}
          sx={{ alignSelf: 'flex-start' }}
        >
          {t('manage.chooseFile')}
          <input
            type='file'
            accept='.json,application/json'
            hidden
            onChange={readFile}
          />
        </Button>
        <Textarea
          minRows={4}
          maxRows={12}
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder='{ "format": "hopla-module/1", … }'
          sx={{ fontFamily: 'monospace', fontSize: 13 }}
        />
        {error && (
          <Typography level='body-sm' color='danger'>
            {error}
          </Typography>
        )}
      </Stack>
    </ResponsiveModal>
  )
}

ImportModal.propTypes = { onClose: PropTypes.func.isRequired }

// FamilyPacksCard lists the packs the family wrote or received, to change
// or share them, and leads to the editor and to the import.
const FamilyPacksCard = ({ modules }) => {
  const { t } = useTranslation('learn')
  const [importing, setImporting] = useState(false)
  const [exportModule, exporting] = useExportModule()
  const own = modules.filter(module => !module.builtin)
  // A module of a pack of the family is shown inside its pack.
  const inPacks = new Set(own.flatMap(module => module.children || []))
  const shown = own.filter(module => !inPacks.has(module.id))

  return (
    <Sheet sx={surfaceSx}>
      <Typography level='title-lg'>{t('pack.familyTitle')}</Typography>
      <Typography level='body-sm' sx={{ color: 'text.secondary', mb: 1.5 }}>
        {shown.length ? t('pack.familyHelp') : t('pack.familyNone')}
      </Typography>
      <Stack gap={1} sx={{ mb: 1.5 }}>
        {shown.map(module => (
          <Sheet
            key={module.id}
            variant='outlined'
            sx={{ borderRadius: 'lg', p: 1.5 }}
          >
            <Stack
              direction='row'
              gap={0.75}
              alignItems='center'
              flexWrap='wrap'
            >
              <Typography level='title-md'>{module.name}</Typography>
              {(module.levels || []).map(level => (
                <Chip key={level} size='sm' variant='soft'>
                  {level}
                </Chip>
              ))}
            </Stack>
            <Typography level='body-sm' sx={{ color: 'text.secondary' }}>
              {[
                t(`pack.audiences.${module.audience || 'enfant'}`),
                module.children?.length
                  ? t('manage.modulesCount', { count: module.children.length })
                  : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </Typography>
            <Stack direction='row' gap={1} sx={{ mt: 1 }} flexWrap='wrap'>
              {!module.children?.length && (
                <Button
                  size='sm'
                  variant='outlined'
                  color='neutral'
                  startDecorator={<EditRounded />}
                  component={Link}
                  to={`/manage/learn/editeur/${module.id}`}
                >
                  {t('pack.edit')}
                </Button>
              )}
              <Button
                size='sm'
                variant='outlined'
                color='neutral'
                startDecorator={<FileDownloadRounded />}
                loading={exporting === module.id}
                onClick={() => exportModule(module.id)}
              >
                {t('pack.export')}
              </Button>
            </Stack>
          </Sheet>
        ))}
      </Stack>
      <Stack direction='row' gap={1}>
        <Button
          sx={{ flex: 1 }}
          startDecorator={<AddRounded />}
          component={Link}
          to='/manage/learn/editeur/nouveau'
        >
          {t('pack.create')}
        </Button>
        <Button
          variant='outlined'
          color='neutral'
          startDecorator={<UploadFileRounded />}
          onClick={() => setImporting(true)}
        >
          {t('manage.importButton')}
        </Button>
      </Stack>
      <Box>
        <Typography level='body-xs' sx={{ color: 'text.tertiary', mt: 1 }}>
          {t('pack.importHint')}
        </Typography>
      </Box>
      {importing && <ImportModal onClose={() => setImporting(false)} />}
    </Sheet>
  )
}

FamilyPacksCard.propTypes = { modules: PropTypes.array.isRequired }

export default FamilyPacksCard
