import '@meauxt/react-swipeable-list/dist/styles.css'

import { SwipeableList, Type as ListType } from '@meauxt/react-swipeable-list'
import { Sheet } from '@mui/joy'
import { useCallback, useState } from 'react'
import { useTranslation } from 'react-i18next'
import { useNavigate } from 'react-router-dom'

import { groupCopies } from '../../utils/taskSlots'
import ChoreActionMenu from '../components/ChoreActionMenu'
import ArchivedChoreCard from './ArchivedChoreCard'
import ChoreSwipeableItem, {
  SWIPE_COMMIT_THRESHOLD,
} from './components/ChoreSwipeableItem'
import {
  getArchivedLeadingActions,
  getArchivedTrailingActions,
} from './components/ChoreSwipeActions'
import TaskGroupRow from './TaskGroupRow'

const ChoreListView = ({
  chores,
  handleChoreAction,
  handleLabelFiltering,
  isArchived = false,
  isMultiSelectMode,
  membersData,
  onLongPressChore,
  selectedChores,
  showActions = true,
  toggleChoreSelection,
  toggleMultiSelectMode,
  userProfile,
}) => {
  const navigate = useNavigate()
  const { t } = useTranslation('chores')

  // One action menu for the whole list rather than one per row. `chore` is kept
  // after closing so the menu can animate out with its content intact.
  const [actionMenuAnchor, setActionMenuAnchor] = useState(null)
  const [actionMenuChore] = useState(null)
  const closeActionMenu = useCallback(() => setActionMenuAnchor(null), [])

  // Every task is a flat row now, so the swipe tiles line up with its top.
  const usesCompactCard = true

  const renderArchivedCard = chore => (
    <ArchivedChoreCard
      key={chore.id}
      chore={chore}
      performers={membersData?.res}
      isMultiSelectMode={isMultiSelectMode}
      isSelected={selectedChores.has(chore.id)}
      onSelectionToggle={() => toggleChoreSelection(chore.id)}
    />
  )
  const swipeActionArgs = chore => ({
    chore,
    handleChoreAction,
    isMultiSelectMode,
    showActions,
    t,
    usesCompactCard,
    userProfile,
  })

  // fullSwipe makes the leading action (complete) a single flick with no
  // aiming. It also arms the last trailing action — delete — which is safe
  // because delete opens a confirmation modal rather than deleting outright.
  //
  // The threshold has to clear the trailing tray's own width or the tray can
  // never be fully revealed: three 76px tiles are ~58% of a phone-width row,
  // so at the default 0.5 the swipe always commits before you can see the
  // actions, let alone pick one. 0.8 leaves room to open the tray and tap,
  // and keeps the full-swipe commit a deliberately long drag.
  const renderChores = chores => {
    return (
      <Sheet
        variant='outlined'
        sx={{
          bgcolor: 'background.surface',
          borderRadius: 'lg',
          overflow: 'hidden',
          '& .swipeable-list-item + .swipeable-list-item': {
            borderTop: '1px solid',
            borderColor: 'divider',
          },
        }}
      >
        <SwipeableList
          type={ListType.IOS}
          fullSwipe
          threshold={SWIPE_COMMIT_THRESHOLD}
        >
          {(isArchived || isMultiSelectMode
            ? chores.map(chore => ({ key: chore.id, chores: [chore] }))
            : groupCopies(chores)
          ).map(group => {
            const chore = group.chores[0]
            if (!isArchived) {
              // Every task is one card: a head per child, a column per
              // moment. No swipe; a touch opens the task.
              return (
                <ChoreSwipeableItem
                  key={chore.id}
                  onClick={() => {
                    if (isMultiSelectMode) {
                      toggleChoreSelection(chore.id)
                    } else {
                      navigate(`/chores/${chore.id}`)
                    }
                  }}
                  longPressEnabled={Boolean(onLongPressChore)}
                  onLongPress={() => onLongPressChore?.(chore.id)}
                >
                  <TaskGroupRow
                    chores={group.chores}
                    isMultiSelectMode={isMultiSelectMode}
                    isSelected={selectedChores.has(chore.id)}
                    onAction={handleChoreAction}
                    onChipClick={handleLabelFiltering}
                    onSelectionToggle={() => toggleChoreSelection(chore.id)}
                    performers={membersData?.res}
                    showActions={showActions}
                  />
                </ChoreSwipeableItem>
              )
            }
            return (
              <ChoreSwipeableItem
                key={chore.id}
                leadingActions={getArchivedLeadingActions(
                  swipeActionArgs(chore),
                )}
                trailingActions={getArchivedTrailingActions(
                  swipeActionArgs(chore),
                )}
                onClick={() => {
                  if (isMultiSelectMode) {
                    toggleChoreSelection(chore.id)
                  } else {
                    navigate(`/chores/${chore.id}`)
                  }
                }}
                longPressEnabled={Boolean(onLongPressChore)}
                onLongPress={() => onLongPressChore?.(chore.id)}
              >
                {renderArchivedCard(chore)}
              </ChoreSwipeableItem>
            )
          })}
        </SwipeableList>
      </Sheet>
    )
  }

  return (
    <>
      {renderChores(chores)}
      <ChoreActionMenu
        chore={actionMenuChore}
        anchorEl={actionMenuAnchor}
        onClose={closeActionMenu}
        onAction={handleChoreAction}
        onCompleteWithNote={() =>
          handleChoreAction('completeWithNote', actionMenuChore)
        }
        onCompleteWithPastDate={() =>
          handleChoreAction('completeWithPastDate', actionMenuChore)
        }
        onChangeAssignee={() =>
          handleChoreAction('changeAssignee', actionMenuChore)
        }
        onChangeDueDate={() =>
          handleChoreAction('changeDueDate', actionMenuChore)
        }
        onDelete={() => handleChoreAction('delete', actionMenuChore)}
      />
    </>
  )
}

export default ChoreListView
