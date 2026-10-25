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
