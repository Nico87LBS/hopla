package backup

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"

	"go.uber.org/fx"

	"github.com/nico87lbs/hopla/internal/zone"
	"github.com/nico87lbs/hopla/logging"
)

// nightHour is when, in the family's time zone, the nightly backup is made.
const nightHour = 3

// Saved is a nightly backup kept on the server.
type Saved struct {
	Name string    `json:"name"`
	Day  string    `json:"day"`
	Size int64     `json:"size"`
	At   time.Time `json:"at"`
}

// Dir is the folder of the nightly backups.
func (s *Service) Dir() string {
	if s.cfg.Backup.Dir != "" {
		return s.cfg.Backup.Dir
	}
	dbPath := os.Getenv("HOPLA_SQLITE_PATH")
	if dbPath == "" {
		dbPath = "hopla.db"
	}
	return filepath.Join(filepath.Dir(dbPath), "sauvegardes")
}

func (s *Service) keep() int {
	if s.cfg.Backup.Keep > 0 {
		return s.cfg.Backup.Keep
	}
	return 14
}

func nightlyName(familyID int, day string) string {
	return fmt.Sprintf("famille-%d-%s%s", familyID, day, Extension)
}

var nightlyFile = regexp.MustCompile(`^famille-(\d+)-(\d{4}-\d{2}-\d{2})` + regexp.QuoteMeta(Extension) + `$`)

// List returns a family's nightly backups, newest first.
func (s *Service) List(familyID int) ([]Saved, error) {
	entries, err := os.ReadDir(s.Dir())
	if os.IsNotExist(err) {
		return []Saved{}, nil
	}
	if err != nil {
		return nil, err
	}
	list := []Saved{}
	for _, e := range entries {
		m := nightlyFile.FindStringSubmatch(e.Name())
		if m == nil || m[1] != fmt.Sprint(familyID) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		list = append(list, Saved{Name: e.Name(), Day: m[2], Size: info.Size(), At: info.ModTime().UTC()})
	}
	sort.Slice(list, func(i, j int) bool { return list[i].Day > list[j].Day })
	return list, nil
}

// Path returns where a family's nightly backup lies, or "" when the name is
// not one of the family's.
func (s *Service) Path(familyID int, name string) string {
	m := nightlyFile.FindStringSubmatch(name)
	if m == nil || m[1] != fmt.Sprint(familyID) || strings.ContainsAny(name, `/\`) {
		return ""
	}
	return filepath.Join(s.Dir(), name)
}

// Nightly writes the backup of each family once a day, after 03:00 in its
// time zone, and keeps the last ones.
func (s *Service) Nightly(ctx context.Context, now time.Time) error {
	var families []int
	if err := s.db.WithContext(ctx).Table("families").Pluck("id", &families).Error; err != nil {
		return err
	}
	if err := os.MkdirAll(s.Dir(), 0o750); err != nil {
		return err
	}
	for _, id := range families {
		local := now.In(zone.Of(id))
		if local.Hour() < nightHour {
			continue
		}
		day := local.Format("2006-01-02")
		path := filepath.Join(s.Dir(), nightlyName(id, day))
		if _, err := os.Stat(path); err == nil {
			continue
		}
		if err := s.writeFile(ctx, id, path); err != nil {
			return fmt.Errorf("famille %d : %w", id, err)
		}
		s.prune(id)
	}
	return nil
}

// writeFile writes through a temporary file, so a half-written backup never
// carries the name of a finished one.
func (s *Service) writeFile(ctx context.Context, familyID int, path string) error {
	tmp := path + ".tmp"
	f, err := os.Create(tmp)
	if err != nil {
		return err
	}
	if _, err := s.Write(ctx, familyID, f); err != nil {
		f.Close()
		os.Remove(tmp)
		return err
	}
	if err := f.Close(); err != nil {
		os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, path)
}

func (s *Service) prune(familyID int) {
	list, err := s.List(familyID)
	if err != nil {
		return
	}
	for _, old := range list[min(len(list), s.keep()):] {
		os.Remove(filepath.Join(s.Dir(), old.Name))
	}
}

// Run starts the nightly backups with the server and stops them with it.
func Run(lc fx.Lifecycle, s *Service) {
	ctx, cancel := context.WithCancel(context.Background())
	lc.Append(fx.Hook{
		OnStart: func(context.Context) error { s.start(ctx); return nil },
		OnStop:  func(context.Context) error { cancel(); return nil },
	})
}

func (s *Service) start(ctx context.Context) {
	if s.cfg.Backup.DisableNightly {
		return
	}
	logger := logging.FromContext(ctx)
	go func() {
		ticker := time.NewTicker(15 * time.Minute)
		defer ticker.Stop()
		for {
			if err := s.Nightly(ctx, time.Now().UTC()); err != nil {
				logger.Errorw("Nightly family backup failed", "error", err)
			}
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}
