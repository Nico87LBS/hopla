// Opens the quick "new task" sheet from anywhere (bottom bar, sidebar).
export const OPEN_QUICK_ADD_EVENT = 'hopla:open-quick-add'

export const openQuickAdd = () =>
  window.dispatchEvent(new Event(OPEN_QUICK_ADD_EVENT))
