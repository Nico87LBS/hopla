import { useTranslation } from 'react-i18next'

import DueDatePickerModal, {
  combineDueDate,
  splitDueDate,
} from '../../components/DueDatePickerModal'
import AssigneeModal from '../../Modals/Inputs/AssigneeModal'
import DateModal from '../../Modals/Inputs/DateModal'
import TextModal from '../../Modals/Inputs/TextModal'

const ChoreModals = ({
  activeModal,
  membersData,
  modalChore,
  onAssigneeChange,
  onChangeDueDate,
  onClose,
  onCompleteWithNote,
  onCompleteWithPastDate,
}) => {
  const { t } = useTranslation('chores')
  return (
    <>
      {activeModal === 'changeDueDate' && modalChore && (
        <DueDatePickerModal
          open={true}
          key={'changeDueDate' + modalChore.id}
          title={t('modals.changeDueDate')}
          {...splitDueDate(modalChore.nextDueDate)}
          onClose={onClose}
          onApply={parts =>
            onChangeDueDate(combineDueDate(parts)?.toISOString() ?? null)
          }
          onRemove={() => onChangeDueDate(null)}
        />
      )}

      {activeModal === 'completeWithPastDate' && modalChore && (
        <DateModal
          isOpen={true}
          key={'completedInPast' + modalChore.id}
          current={modalChore.nextDueDate}
          title={t('modals.completePast')}
          onClose={onClose}
          onSave={onCompleteWithPastDate}
        />
      )}

      {activeModal === 'changeAssignee' && modalChore && (
        <AssigneeModal
          isOpen={true}
          members={membersData?.res || []}
          assignedTo={modalChore.assignedTo}
          title={t('modals.delegate')}
          onClose={onClose}
          onSave={onAssigneeChange}
        />
      )}

      {activeModal === 'completeWithNote' && modalChore && (
        <TextModal
          isOpen={true}
          title={t('modals.addNote')}
          onClose={onClose}
          okText={t('modals.complete')}
          onSave={onCompleteWithNote}
        />
      )}
    </>
  )
}

export default ChoreModals
