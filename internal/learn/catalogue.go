package learn

import (
	"embed"
	"fmt"
	"io/fs"
	"sort"
	"sync"
)

//go:embed catalogue/*.json
var catalogueFiles embed.FS

// Entry is a module of the Hopla catalogue.
type Entry struct {
	Doc Document
	Raw []byte
}

var (
	catalogueOnce sync.Once
	catalogue     map[string]Entry
	catalogueErr  error
)

// Catalogue returns the modules shipped with Hopla, by id. A broken file is
// a bug of the release, reported by the tests.
func Catalogue() (map[string]Entry, error) {
	catalogueOnce.Do(func() {
		catalogue = map[string]Entry{}
		catalogueErr = fs.WalkDir(catalogueFiles, "catalogue", func(path string, entry fs.DirEntry, err error) error {
			if err != nil || entry.IsDir() {
				return err
			}
			raw, err := catalogueFiles.ReadFile(path)
			if err != nil {
				return err
			}
			doc, err := Parse(raw)
			if err != nil {
				return fmt.Errorf("%s: %w", path, err)
			}
			if _, dup := catalogue[doc.ID]; dup {
				return fmt.Errorf("%s: module %s en double", path, doc.ID)
			}
			catalogue[doc.ID] = Entry{Doc: doc, Raw: raw}
			return nil
		})
		if catalogueErr == nil {
			for id, entry := range catalogue {
				for _, child := range entry.Doc.Modules {
					if _, ok := catalogue[child]; !ok {
						catalogueErr = fmt.Errorf("paquet %s : module %s absent du catalogue", id, child)
					}
				}
			}
		}
		if catalogueErr == nil {
			children := func(id string) ([]string, bool) {
				entry, ok := catalogue[id]
				return entry.Doc.Modules, ok
			}
			for id := range catalogue {
				if err := CheckTree(id, children); err != nil {
					catalogueErr = err
					break
				}
			}
		}
	})
	return catalogue, catalogueErr
}

// CatalogueIDs lists the catalogue's modules, packs first then by name.
func CatalogueIDs() ([]string, error) {
	entries, err := Catalogue()
	if err != nil {
		return nil, err
	}
	ids := make([]string, 0, len(entries))
	for id := range entries {
		ids = append(ids, id)
	}
	sort.Slice(ids, func(i, j int) bool {
		a, b := entries[ids[i]].Doc, entries[ids[j]].Doc
		if a.IsPack() != b.IsPack() {
			return a.IsPack()
		}
		return a.Name < b.Name
	})
	return ids, nil
}

// CheckTree refuses a pack that does not follow the shape of every pack:
// a pack gathers its levels, each a pack of modules, or its modules alone
// when it has a single level. A pack never mixes levels and modules, and a
// level holds no pack. children tells the modules a module gathers, and
// whether it is known; an unknown one is left aside.
func CheckTree(id string, children func(string) ([]string, bool)) error {
	kids, _ := children(id)
	packs := 0
	for _, child := range kids {
		grand, ok := children(child)
		if !ok || len(grand) == 0 {
			continue
		}
		packs++
		for _, g := range grand {
			if deeper, ok := children(g); ok && len(deeper) > 0 {
				return fmt.Errorf("paquet %s : le niveau %s contient le paquet %s, un niveau ne contient que des modules", id, child, g)
			}
		}
	}
	if packs > 0 && packs < len(kids) {
		return fmt.Errorf("paquet %s : il mélange des niveaux et des modules, il ne contient que l'un ou l'autre", id)
	}
	return nil
}
