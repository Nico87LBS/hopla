import { useFamilyMembers, useUserProfile } from '../queries/UserQueries'

// Parents are the family's admins and managers: they set up the games, give
// bonuses and validate requests. Undefined while the members are loading.
export const useIsParent = () => {
  const { data: membersData } = useFamilyMembers()
  const { data: userProfile } = useUserProfile()
  if (!membersData?.res || !userProfile) return undefined
  const me = membersData.res.find(m => m.userId === userProfile.id)
  return me?.role === 'admin' || me?.role === 'manager'
}
