import { useEffect, useState } from 'react'
import { useLocation } from 'react-router-dom'

import TaskInput from './AddTaskModal'
import { OPEN_QUICK_ADD_EVENT } from './navigationEvents'

// The task list opens its own quick add, so the new task lands in the list
// at once; everywhere else this one answers the + button.
const LIST_PAGES = ['/chores', '/my/chores']

const QuickAddTask = () => {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const handledByList = LIST_PAGES.includes(pathname)

  useEffect(() => {
    if (handledByList) return undefined
    const onOpen = () => setOpen(true)
    window.addEventListener(OPEN_QUICK_ADD_EVENT, onOpen)
    return () => window.removeEventListener(OPEN_QUICK_ADD_EVENT, onOpen)
  }, [handledByList])

  if (!open || handledByList) return null
  return (
    <TaskInput
      isModalOpen={open}
      onChoreUpdate={() => {}}
      onClose={() => setOpen(false)}
    />
  )
}

export default QuickAddTask
