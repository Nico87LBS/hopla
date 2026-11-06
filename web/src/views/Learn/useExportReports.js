import { useState } from 'react'

import { ExportLearnReports } from '../../utils/Fetcher'
import { saveFile } from '../../utils/saveFile'

const useExportReports = () => {
  const [busy, setBusy] = useState(false)
  const exportAll = async () => {
    setBusy(true)
    try {
      const reports = await ExportLearnReports()
      const now = new Date()
      const file = {
        format: 'hopla-signalements/1',
        hopla: import.meta.env.VITE_APP_VERSION,
        exportedAt: now.toISOString(),
        reports,
      }
      await saveFile(
        `hopla-signalements-${now.toISOString().slice(0, 10)}.json`,
        `${JSON.stringify(file, null, 2)}\n`,
      )
    } finally {
      setBusy(false)
    }
  }
  return [exportAll, busy]
}

export default useExportReports
