// Every pack has the same shape: a pack gathers its levels, each a pack of
// modules, or its modules alone when it has a single level. These helpers
// read that shape from the installed modules, or the catalogue's.

export const isPack = module => (module?.children?.length || 0) > 0

// packTree puts the modules under their pack and level. It returns the
// packs no other pack gathers, each { pack, levels }, with a level
// { pack, modules } whose pack is null when the pack has a single level, and
// the modules of no pack, last.
export const packTree = modules => {
  const byId = new Map(modules.map(m => [m.id, m]))
  const inner = new Set(modules.filter(isPack).flatMap(m => m.children))
  const used = new Set()
  const leaves = ids =>
    ids
      .map(id => byId.get(id))
      .filter(m => m && !isPack(m))
      .map(m => (used.add(m.id), m))
  const groups = modules
    .filter(m => isPack(m) && !inner.has(m.id))
    .map(pack => {
      const kids = pack.children.map(id => byId.get(id)).filter(Boolean)
      const levels = kids.some(isPack)
        ? kids
            .filter(isPack)
            .map(level => ({ pack: level, modules: leaves(level.children) }))
        : [{ pack: null, modules: leaves(pack.children) }]
      return { pack, levels }
    })
  const others = modules.filter(m => !isPack(m) && !used.has(m.id))
  return { groups, others }
}

// packsAbove lists the packs a module belongs to, its level first, then the
// packs above, as the server picks the settings.
export const packsAbove = (modules, id) => {
  const out = []
  let next = [id]
  for (let depth = 0; next.length && depth < 5; depth++) {
    const above = modules.filter(
      m => isPack(m) && next.some(k => m.children.includes(k)),
    )
    for (const pack of above) if (!out.includes(pack)) out.push(pack)
    next = above.map(p => p.id)
  }
  return out
}

// leavesOf lists the modules a module stands for: itself, or the modules of
// a pack and of its levels.
export const leavesOf = (modules, id) => {
  const byId = new Map(modules.map(m => [m.id, m]))
  const out = []
  const walk = (key, depth) => {
    const m = byId.get(key)
    if (!m || depth > 5) return
    if (!isPack(m)) {
      if (!out.includes(key)) out.push(key)
      return
    }
    m.children.forEach(child => walk(child, depth + 1))
  }
  walk(id, 0)
  return out
}

// rootOf is the pack no other pack gathers above a module or a pack: the
// pack itself when none does, null for a module of no pack.
export const rootOf = (modules, id) => {
  const above = packsAbove(modules, id)
  if (above.length) return above[above.length - 1]
  const self = modules.find(m => m.id === id)
  return isPack(self) ? self : null
}

// shortLevel names a level by its school level, such as CP, when it has one
// of its own, else by its name.
export const shortLevel = (level, siblings = []) => {
  const own = level?.levels || []
  if (own.length !== 1) return level?.name || ''
  const shared = siblings.filter(
    other => other !== level && (other.levels || []).includes(own[0]),
  )
  return shared.length ? level.name : own[0]
}

// byRootPack gathers groups of modules, one by level, under the pack on top
// of them, in the order they come: a section { id, name, pack, levels },
// each level { group, title }, with no title for a pack of a single level.
// A group of no pack, or a group already made (the sorted list), stands on
// its own.
export const byRootPack = (groups, packs) => {
  const sections = []
  const byId = new Map()
  for (const group of groups) {
    const root = group.id ? rootOf(packs, group.id) : null
    if (!root) {
      sections.push({
        id: group.id,
        name: group.name,
        pack: null,
        levels: [{ group, title: null }],
      })
      continue
    }
    let section = byId.get(root.id)
    if (!section) {
      section = { id: root.id, name: root.name, pack: root, levels: [] }
      byId.set(root.id, section)
      sections.push(section)
    }
    section.levels.push({
      group,
      title: group.id === root.id ? null : group.name,
    })
  }
  return sections
}
