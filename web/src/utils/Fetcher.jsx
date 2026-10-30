import i18n from 'i18next'
import moment from 'moment'

import { apiClient } from './ApiClient'
import { inPlayPages, playFetch } from './learn/playSession'

// Migration helpers to maintain compatibility with existing code
const Fetch = async (endpoint, options = {}) => {
  // base on options.method, call the appropriate method on apiClient:
  switch (options.method) {
    case 'GET':
      return apiClient.get(endpoint, options)
    case 'POST':
      return apiClient.post(endpoint, options.body, options)
    case 'PUT':
      return apiClient.put(endpoint, options.body, options)
    case 'DELETE':
      return apiClient.delete(endpoint, options)
    default:
      return apiClient.request(endpoint, options)
  }
}

const HEADERS = () => {
  return apiClient.getHeaders()
}

const apiManager = {
  getApiURL: () => apiClient.getApiURL(),
}

const createChore = userID => {
  return Fetch(`/chores/`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      createdBy: Number(userID),
    }),
  }).then(response => response.json())
}

const signUp = async (username, password, displayName, email) => {
  await apiClient.init(true)
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/auth/`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ username, password, displayName, email }),
  })
}

const UpdatePassword = async newPassword => {
  await apiClient.init(true)
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/users/change_password`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ password: newPassword }),
  })
}

const login = async (username, password) => {
  await apiClient.init(true)
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/auth/login`, {
    headers: {
      'Content-Type': 'application/json',
    },
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
}

const logout = async () => {
  await apiClient.init(true)
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/auth/logout`, {
    method: 'POST',
    credentials: 'include',
  })
}

const GetAllUsers = () => {
  return Fetch(`/users/`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const GetChoresNew = async includeArchived => {
  var url = `/chores/`
  if (includeArchived) {
    url += `?includeArchived=true`
  }

  const resp = await Fetch(url, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const GetChores = () => {
  return Fetch(`/chores/`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const GetChoresWithSubtasks = async () => {
  const resp = await Fetch(`/chores/?includeSubtasks=true`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}
const GetArchivedChores = () => {
  return Fetch(`/chores/archived`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const ArchiveChore = id => {
  return Fetch(`/chores/${id}/archive`, {
    method: 'PUT',
    headers: HEADERS(),
  })
}
const UnArchiveChore = id => {
  return Fetch(`/chores/${id}/unarchive`, {
    method: 'PUT',
    headers: HEADERS(),
  })
}

const GetChoreByID = id => {
  return Fetch(`/chores/${id}`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const GetChoreDetailById = id => {
  return Fetch(`/chores/${id}/details`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const MarkChoreComplete = (id, body, completedDate, performer) => {
  var markChoreURL = `/chores/${id}/do`

  let completedDateFormated = ''
  if (completedDate) {
    // A date typed in the app is the family's time.
    completedDateFormated = `?completedDate=${moment(completedDate).toISOString()}`
    markChoreURL += completedDateFormated
  }
  if (performer) {
    body.performer = Number(performer)
    if (completedDateFormated === '') {
      markChoreURL += `&performer=${performer}`
    } else {
      markChoreURL += `?performer=${performer}`
    }
  }

  return Fetch(markChoreURL, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify(body),
  })
}

const CompleteSubTask = (id, choreId, completedAt) => {
  var markChoreURL = `/chores/${choreId}/subtask`
  return Fetch(markChoreURL, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ completedAt, id, choreId }),
  })
}

const SkipChore = id => {
  return Fetch(`/chores/${id}/skip`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({}),
  })
}

const ApproveChore = id => {
  return Fetch(`/chores/${id}/approve`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({}),
  })
}

const RejectChore = id => {
  return Fetch(`/chores/${id}/reject`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({}),
  })
}

// Today's slots of the tasks done several times a day, by task.
const GetFlashes = () => {
  return Fetch(`/chores/flashes`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const GetSlotsToday = () => {
  return Fetch(`/chores/slots`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

// A parent's action on one slot of today: approve, reject or catchup.
const SlotAction = (id, slot, action, body = {}) => {
  return Fetch(`/chores/${id}/slots/${slot}/${action}`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify(body),
  })
}

const UndoChoreAction = id => {
  return Fetch(`/chores/${id}/undo`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({}),
  })
}

const UpdateChoreAssignee = (id, assignee) => {
  return Fetch(`/chores/${id}/assignee`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({
      assignee: Number(assignee),
      updatedAt: new Date().toISOString(),
    }),
  })
}

const CreateChore = chore => {
  return Fetch(`/chores/`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify(chore),
  })
}

const DeleteChore = id => {
  return Fetch(`/chores/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const SaveChore = chore => {
  return Fetch(`/chores/`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(chore),
  })
}

const GetChoreHistory = choreId => {
  return Fetch(`/chores/${choreId}/history`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const DeleteChoreHistory = (choreId, id) => {
  return Fetch(`/chores/${choreId}/history/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const UpdateChoreHistory = (choreId, id, choreHistory) => {
  return Fetch(`/chores/${choreId}/history/${id}`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(choreHistory),
  })
}

const GetAllFamilyMembers = async () => {
  const resp = await Fetch(`/families/members`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const UpdateMemberRole = async (memberId, role) => {
  return Fetch(`/families/members/role`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ role, memberId }),
  })
}

const SetMemberAway = async (memberId, away) => {
  const resp = await Fetch(`/families/members/away`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ memberId, away }),
  })
  if (!resp.ok) throw new Error('Unable to change who is home')
  return resp.json()
}

const GetFamilyTimezone = async () => {
  const resp = await Fetch(`/families/timezone`, {
    method: 'GET',
    headers: HEADERS(),
  })
  if (!resp.ok) throw new Error('Unable to get the family time zone')
  return resp.json()
}

const GetFamilyCurrency = async () => {
  const resp = await Fetch(`/families/currency`, {
    method: 'GET',
    headers: HEADERS(),
  })
  if (!resp.ok) throw new Error('Unable to get the family currency')
  return resp.json()
}

const SetFamilyCurrency = async currency => {
  const resp = await Fetch(`/families/currency`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ currency }),
  })
  if (!resp.ok) throw new Error('Unable to change the family currency')
  return resp.json()
}

const SetFamilyTimezone = async timezone => {
  const resp = await Fetch(`/families/timezone`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ timezone }),
  })
  if (!resp.ok) throw new Error('Unable to change the family time zone')
  return resp.json()
}

const GetUserProfile = () => {
  return Fetch(`/users/profile`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const GetUserFamily = () => {
  return Fetch(`/families/`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const JoinFamily = inviteCode => {
  return Fetch(`/families/join?invite_code=${inviteCode}`, {
    method: 'POST',
    headers: HEADERS(),
  })
}

const GetFamilyMemberRequests = () => {
  return Fetch(`/families/members/requests`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const AcceptFamilyMemberRequest = id => {
  return Fetch(`/families/members/requests/accept?requestId=${id}`, {
    method: 'PUT',
    headers: HEADERS(),
  })
}

const DeclineFamilyMemberRequest = id => {
  return Fetch(`/families/members/requests/decline?requestId=${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const LeaveFamily = id => {
  return Fetch(`/families/leave?family_id=${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const DeleteFamilyMember = (familyID, memberID) => {
  return Fetch(`/families/${familyID}/members/delete?member_id=${memberID}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const UpdateUserDetails = userDetails => {
  return Fetch(`/users`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(userDetails),
  })
}

const CreateLongLiveToken = name => {
  return Fetch(`/users/tokens`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ name }),
  })
}
const DeleteLongLiveToken = id => {
  return Fetch(`/users/tokens/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetLongLiveTokens = () => {
  return Fetch(`/users/tokens`, {
    method: 'GET',
    headers: HEADERS(),
  })
}
const CreateLabel = label => {
  return Fetch(`/labels`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify(label),
  })
}

const GetLabels = async () => {
  const resp = await Fetch(`/labels`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const GetResource = async () => {
  await apiClient.init()
  const basedURL = apiManager.getApiURL()
  const resp = await fetch(`${basedURL}/resource`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const UpdateLabel = label => {
  return Fetch(`/labels`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(label),
  })
}
const DeleteLabel = id => {
  return Fetch(`/labels/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const ChangePassword = (verifiticationCode, password) => {
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/auth/password?c=${verifiticationCode}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ password: password }),
  })
}

const ResetPassword = async email => {
  await apiClient.init()
  const basedURL = apiManager.getApiURL()
  return fetch(`${basedURL}/auth/reset`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    // The e-mail is written in the language of the app.
    body: JSON.stringify({ email, language: i18n.resolvedLanguage }),
  })
}

// MFA Related Functions
const GetMFAStatus = () => {
  return Fetch(`/users/mfa/status`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const SetupMFA = () => {
  return Fetch(`/users/mfa/setup`, {
    method: 'POST',
    headers: HEADERS(),
  })
}

const ConfirmMFA = (secret, code, backupCodes) => {
  return Fetch(`/users/mfa/confirm`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      secret,
      code,
      backupCodes,
    }),
  })
}

const DisableMFA = code => {
  return Fetch(`/users/mfa/disable`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ code }),
  })
}

const RegenerateBackupCodes = code => {
  return Fetch(`/users/mfa/regenerate-backup-codes`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ code }),
  })
}

const VerifyMFA = (sessionToken, code) => {
  const baseURL = apiManager.getApiURL()
  return fetch(`${baseURL}/auth/mfa/verify`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      sessionToken,
      code,
    }),
  })
}

const UpdateDueDate = (id, dueDate) => {
  return Fetch(`/chores/${id}/dueDate`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      dueDate: dueDate ? moment(dueDate).toISOString() : null,
      updatedAt: new Date().toISOString(),
    }),
  })
}

const RedeemPoints = (userId, points, familyID) => {
  return Fetch(`/families/${familyID}/members/points/redeem`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ points, userId }),
  })
}

const GetRewards = async () => {
  const resp = await Fetch(`/rewards`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const CreateReward = reward => {
  return Fetch(`/rewards`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify(reward),
  }).then(response => response.json())
}

const UpdateReward = (id, reward) => {
  return Fetch(`/rewards/${id}`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(reward),
  }).then(response => response.json())
}

const DeleteReward = id => {
  return Fetch(`/rewards/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const RedeemReward = (id, note) => {
  return Fetch(`/rewards/${id}/redeem`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ note: note || null }),
  }).then(response => response.json())
}

const GetRedemptions = async (status = null) => {
  const query = status ? `?status=${status}` : ''
  const resp = await Fetch(`/rewards/redemptions${query}`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const ApproveRedemption = id => {
  return Fetch(`/rewards/redemptions/${id}/approve`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({}),
  })
}

const RejectRedemption = (id, note) => {
  return Fetch(`/rewards/redemptions/${id}/reject`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ note: note || null }),
  })
}
const RefreshToken = async () => {
  const basedURL = apiManager.getApiURL()

  return fetch(`${basedURL}/auth/refresh`, {
    method: 'POST',
    credentials: 'include',
    headers: HEADERS(),
  })
}
const GetChoresHistory = async (limit, includeMembers) => {
  var url = `/chores/history`
  if (!limit) limit = 7

  if (limit) {
    url += `?limit=${limit}`
  }
  if (includeMembers) {
    url += `&members=true`
  }
  const resp = await Fetch(url, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const GetStorageUsage = () => {
  return Fetch(`/users/storage`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const GetCalendarURL = () => {
  return Fetch(`/chores/calendar/url`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const CreateCalendarURL = () => {
  return Fetch(`/chores/calendar/url`, {
    method: 'POST',
    headers: HEADERS(),
  })
}

const RotateCalendarURL = () => {
  return Fetch(`/chores/calendar/url/rotate`, {
    method: 'POST',
    headers: HEADERS(),
  })
}

const RevokeCalendarURL = () => {
  return Fetch(`/chores/calendar/url`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const CheckUserDeletion = password => {
  return Fetch(`/users/delete/check`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      password,
    }),
  })
}

const DeleteUser = (password, confirmation, transferOptions = []) => {
  return Fetch(`/users/delete`, {
    method: 'DELETE',
    headers: HEADERS(),
    body: JSON.stringify({
      password,
      confirmation,
      transferOptions,
    }),
  })
}

const UploadChoreAttachment = (
  file,
  entityType,
  { draftId, entityId } = {},
) => {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('entityType', entityType)
  if (entityId != null) formData.append('entityId', String(entityId))
  if (draftId != null) formData.append('draftId', draftId)
  return apiClient.upload('/assets/chore', formData)
}

const DeleteDraftAttachment = filePath => {
  return Fetch(`/assets/chore`, {
    method: 'DELETE',
    headers: HEADERS(),
    body: JSON.stringify({ file_path: filePath }),
  })
}

// Returns a fresh signed URL for a stored asset path the current user may access.
const SignAssetURL = path => {
  return Fetch(`/files/sign?path=${encodeURIComponent(path)}`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const GetChoreAttachments = choreId => {
  return Fetch(`/chores/${choreId}/attachments`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const DeleteChoreAttachment = (choreId, filePath) => {
  return Fetch(`/chores/${choreId}/attachments`, {
    method: 'DELETE',
    headers: HEADERS(),
    body: JSON.stringify({ file_path: filePath }),
  })
}

const CreateBackup = (encryptionKey, includeAssets = true, backupName = '') => {
  return Fetch(`/backup/create`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      encryption_key: encryptionKey,
      include_assets: includeAssets,
      backup_name: backupName,
    }),
  })
}

const RestoreBackup = (encryptionKey, backupData) => {
  return Fetch(`/backup/restore`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      encryption_key: encryptionKey,
      backup_data: backupData,
    }),
  })
}

// Child User Management Functions
const CreateChildUser = (childName, displayName, password) => {
  return Fetch(`/users/subaccounts`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      childName,
      displayName,
      password,
    }),
  })
}

const GetChildUsers = () => {
  return Fetch(`/users/subaccounts`, {
    method: 'GET',
    headers: HEADERS(),
  })
}

const UpdateChildPassword = (childUserId, password) => {
  return Fetch(`/users/subaccounts/password`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({
      childUserId,
      password,
    }),
  })
}

const DeleteChildUser = childUserId => {
  return Fetch(`/users/subaccounts/${childUserId}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

// The family journal, newest first: the hops won and spent, and the tasks
// done that earned none. next is the before of the following page.
const GetJournal = async ({ before, kind, limit, userId } = {}) => {
  const params = new URLSearchParams()
  if (userId) params.set('userId', userId)
  if (kind) params.set('kind', kind)
  if (before) params.set('before', before)
  if (limit) params.set('limit', limit)
  const query = params.toString() ? `?${params}` : ''
  const resp = await Fetch(`/points/journal${query}`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

// points > 0 gives a bonus, points < 0 a penalty. With presetId, the preset
// gives the points and, without a reason, its name.
const AdjustPoints = ({ points, presetId, reason, userId }) => {
  return Fetch(`/points/adjust`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ userId, points, reason, presetId }),
  })
}

const ResetPoints = ({
  clearGames,
  clearHistory,
  clearTaskHistory,
  userId,
}) => {
  return Fetch(`/points/reset`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({
      userId,
      clearHistory,
      clearTaskHistory,
      clearGames,
    }),
  })
}

const GetPointsPresets = async () => {
  const resp = await Fetch(`/points/presets`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SavePointsPreset = preset => {
  return Fetch(preset.id ? `/points/presets/${preset.id}` : `/points/presets`, {
    method: preset.id ? 'PUT' : 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ name: preset.name, points: preset.points }),
  })
}

const DeletePointsPreset = id => {
  return Fetch(`/points/presets/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetGamesToday = async () => {
  const resp = await Fetch(`/games/today`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const LaunchFlash = (choreId, points, minutes) => {
  return Fetch(`/games/flashes`, {
    method: 'POST',
    headers: HEADERS(),
    body: JSON.stringify({ choreId, points, minutes }),
  })
}

const StopFlash = id => {
  return Fetch(`/games/flashes/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetGamesWeek = async () => {
  const resp = await Fetch(`/games/week`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveParentsOnPodium = parentsOnPodium => {
  return Fetch(`/games/podium`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify({ parentsOnPodium }),
  })
}

const GetGameRules = async () => {
  const resp = await Fetch(`/games/rules`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveGameRules = rules => {
  return Fetch(`/games/rules`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(rules),
  })
}

const GetBonusPeriods = async () => {
  const resp = await Fetch(`/games/periods`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveBonusPeriod = period => {
  return Fetch(period.id ? `/games/periods/${period.id}` : `/games/periods`, {
    method: period.id ? 'PUT' : 'POST',
    headers: HEADERS(),
    body: JSON.stringify(period),
  })
}

const DeleteBonusPeriod = id => {
  return Fetch(`/games/periods/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetRanks = async () => {
  const resp = await Fetch(`/games/ranks`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const GetDefaultRanks = async () => {
  const resp = await Fetch(`/games/ranks/defaults`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveRanks = ranks => {
  return Fetch(`/games/ranks`, {
    method: 'PUT',
    headers: HEADERS(),
    body: JSON.stringify(ranks),
  })
}

const GetQuests = async () => {
  const resp = await Fetch(`/games/quests`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveQuest = quest => {
  return Fetch(quest.id ? `/games/quests/${quest.id}` : `/games/quests`, {
    method: quest.id ? 'PUT' : 'POST',
    headers: HEADERS(),
    body: JSON.stringify(quest),
  })
}

const DeleteQuest = id => {
  return Fetch(`/games/quests/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetRoutines = async () => {
  const resp = await Fetch(`/games/routines`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveRoutine = routine => {
  return Fetch(
    routine.id ? `/games/routines/${routine.id}` : `/games/routines`,
    {
      method: routine.id ? 'PUT' : 'POST',
      headers: HEADERS(),
      body: JSON.stringify(routine),
    },
  )
}

const DeleteRoutine = id => {
  return Fetch(`/games/routines/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

const GetChallenges = async () => {
  const resp = await Fetch(`/games/challenges`, {
    method: 'GET',
    headers: HEADERS(),
  })
  return resp.json()
}

const SaveChallenge = challenge => {
  return Fetch(
    challenge.id ? `/games/challenges/${challenge.id}` : `/games/challenges`,
    {
      method: challenge.id ? 'PUT' : 'POST',
      headers: HEADERS(),
      body: JSON.stringify(challenge),
    },
  )
}

const DeleteChallenge = id => {
  return Fetch(`/games/challenges/${id}`, {
    method: 'DELETE',
    headers: HEADERS(),
  })
}

// ── learning games ──

// learnAnswer reads a learning answer, and throws its message when the server
// refused the request. err.status tells a refusal from a server down.
const learnAnswer = async resp => {
  if (!resp) throw new Error('No answer')
  const body = await resp.json().catch(() => ({}))
  if (!resp.ok) {
    const err = new Error(body.error || `Error ${resp.status}`)
    err.status = resp.status
    throw err
  }
  return body.res
}

const GetLearnCatalogue = async () =>
  learnAnswer(
    await Fetch(`/learn/catalogue`, { method: 'GET', headers: HEADERS() }),
  )

const GetLearnModules = async () =>
  learnAnswer(
    await Fetch(`/learn/modules`, { method: 'GET', headers: HEADERS() }),
  )

const InstallLearnModule = async id =>
  learnAnswer(
    await Fetch(`/learn/modules/install`, {
      method: 'POST',
      headers: HEADERS(),
      body: JSON.stringify({ id }),
    }),
  )

const ImportLearnModule = async text =>
  learnAnswer(
    await Fetch(`/learn/modules/import`, {
      method: 'POST',
      headers: HEADERS(),
      body: text,
    }),
  )

const RemoveLearnModule = async key =>
  learnAnswer(
    await Fetch(`/learn/modules/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: HEADERS(),
    }),
  )

const SetLearnActivation = async change =>
  learnAnswer(
    await Fetch(`/learn/activations`, {
      method: 'PUT',
      headers: HEADERS(),
      body: JSON.stringify(change),
    }),
  )

const SetLearnSetting = async change =>
  learnAnswer(
    await Fetch(`/learn/settings`, {
      method: 'PUT',
      headers: HEADERS(),
      body: JSON.stringify(change),
    }),
  )

const GetLearnDetail = async key =>
  learnAnswer(
    await Fetch(`/learn/modules/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: HEADERS(),
    }),
  )

const EditLearnCard = async change =>
  learnAnswer(
    await Fetch(`/learn/cards`, {
      method: 'PUT',
      headers: HEADERS(),
      body: JSON.stringify(change),
    }),
  )

const SendLearnReport = async report =>
  learnAnswer(
    await (inPlayPages()
      ? playFetch('/reports', { method: 'POST', body: JSON.stringify(report) })
      : Fetch(`/learn/reports`, {
          method: 'POST',
          headers: HEADERS(),
          body: JSON.stringify(report),
        })),
  )

const ResolveLearnReport = async id =>
  learnAnswer(
    await Fetch(`/learn/reports/${id}/resolve`, {
      method: 'PUT',
      headers: HEADERS(),
    }),
  )

const GetLearnStats = async key =>
  learnAnswer(
    await Fetch(`/learn/stats/${encodeURIComponent(key)}`, {
      method: 'GET',
      headers: HEADERS(),
    }),
  )

// On the /play pages, a family screen plays with a play session instead of
// a sign-in.
const GetLearnPlayer = async userId =>
  learnAnswer(
    inPlayPages()
      ? await playFetch('/player', { method: 'GET' })
      : await Fetch(`/learn/players/${userId}`, {
          method: 'GET',
          headers: HEADERS(),
        }),
  )

const SendLearnGame = async game =>
  learnAnswer(
    inPlayPages()
      ? await playFetch('/games', {
          method: 'POST',
          body: JSON.stringify(game),
        })
      : await Fetch(`/learn/games`, {
          method: 'POST',
          headers: HEADERS(),
          body: JSON.stringify(game),
        }),
  )

export {
  AcceptFamilyMemberRequest,
  AdjustPoints,
  ApproveChore,
  ApproveRedemption,
  ArchiveChore,
  ChangePassword,
  CheckUserDeletion,
  CompleteSubTask,
  ConfirmMFA,
  CreateBackup,
  CreateCalendarURL,
  CreateChildUser,
  CreateChore,
  createChore,
  CreateLabel,
  CreateLongLiveToken,
  CreateReward,
  DeclineFamilyMemberRequest,
  DeleteBonusPeriod,
  DeleteChallenge,
  DeleteChildUser,
  DeleteChore,
  DeleteChoreAttachment,
  DeleteChoreHistory,
  DeleteDraftAttachment,
  DeleteFamilyMember,
  DeleteLabel,
  DeleteLongLiveToken,
  DeletePointsPreset,
  DeleteQuest,
  DeleteReward,
  DeleteRoutine,
  DeleteUser,
  DisableMFA,
  EditLearnCard,
  GetAllFamilyMembers,
  GetAllUsers,
  GetArchivedChores,
  GetBonusPeriods,
  GetCalendarURL,
  GetChallenges,
  GetChildUsers,
  GetChoreAttachments,
  GetChoreByID,
  GetChoreDetailById,
  GetChoreHistory,
  GetChores,
  GetChoresHistory,
  GetChoresNew,
  GetChoresWithSubtasks,
  GetDefaultRanks,
  GetFamilyCurrency,
  GetFamilyMemberRequests,
  GetFamilyTimezone,
  GetFlashes,
  GetGameRules,
  GetGamesToday,
  GetGamesWeek,
  GetJournal,
  GetLabels,
  GetLearnCatalogue,
  GetLearnDetail,
  GetLearnModules,
  GetLearnPlayer,
  GetLearnStats,
  GetLongLiveTokens,
  GetMFAStatus,
  GetPointsPresets,
  GetQuests,
  GetRanks,
  GetRedemptions,
  GetResource,
  GetRewards,
  GetRoutines,
  GetSlotsToday,
  GetStorageUsage,
  GetUserFamily,
  GetUserProfile,
  ImportLearnModule,
  InstallLearnModule,
  JoinFamily,
  LaunchFlash,
  LeaveFamily,
  login,
  logout,
  MarkChoreComplete,
  RedeemPoints,
  RedeemReward,
  RefreshToken,
  RegenerateBackupCodes,
  RejectChore,
  RejectRedemption,
  RemoveLearnModule,
  ResetPassword,
  ResetPoints,
  ResolveLearnReport,
  RestoreBackup,
  RevokeCalendarURL,
  RotateCalendarURL,
  SaveBonusPeriod,
  SaveChallenge,
  SaveChore,
  SaveGameRules,
  SaveParentsOnPodium,
  SavePointsPreset,
  SaveQuest,
  SaveRanks,
  SaveRoutine,
  SendLearnGame,
  SendLearnReport,
  SetFamilyCurrency,
  SetFamilyTimezone,
  SetLearnActivation,
  SetLearnSetting,
  SetMemberAway,
  SetupMFA,
  SignAssetURL,
  signUp,
  SkipChore,
  SlotAction,
  StopFlash,
  UnArchiveChore,
  UndoChoreAction,
  UpdateChildPassword,
  UpdateChoreAssignee,
  UpdateChoreHistory,
  UpdateDueDate,
  UpdateLabel,
  UpdateMemberRole,
  UpdatePassword,
  UpdateReward,
  UpdateUserDetails,
  UploadChoreAttachment,
  VerifyMFA,
}
