// saveFile hands a file to the person: the share sheet where the device has
// one (an iPad sends it by message or keeps it in Files), else a download.
// content is a text or a Blob.
export const saveFile = async (name, content, type = 'application/json') => {
  const file = new File([content], name, { type: content?.type || type })
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] })
      return
    } catch (err) {
      if (err?.name === 'AbortError') return
    }
  }
  const url = URL.createObjectURL(file)
  const link = document.createElement('a')
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
