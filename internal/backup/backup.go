package backup

import (
	"archive/zip"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/nico87lbs/hopla/config"
	"github.com/nico87lbs/hopla/internal/storage"
	"github.com/nico87lbs/hopla/internal/zone"
)

// Format is the version of the file. A restore refuses a newer one.
const Format = 1

// Extension is the end of a backup's file name.
const Extension = ".hopla-famille"

const (
	dataEntry  = "famille.json"
	filesEntry = "fichiers/"
)

// ErrNotBackup means the file is not a family backup.
var ErrNotBackup = errors.New("ce fichier n'est pas une sauvegarde de famille Hopla")

// ErrNewerFormat means the backup comes from a newer Hopla.
var ErrNewerFormat = errors.New("cette sauvegarde vient d'une version plus récente de Hopla")

// ErrTaken means rows of the backup would land on rows of another family.
type ErrTaken struct{ Table string }

func (e ErrTaken) Error() string {
	return fmt.Sprintf("une autre famille de ce serveur occupe déjà des lignes de la sauvegarde (%s)", e.Table)
}

// Data is what famille.json holds.
type Data struct {
	Format     int                         `json:"format"`
	Version    string                      `json:"version"`
	ExportedAt time.Time                   `json:"exportedAt"`
	FamilyID   int                         `json:"familyId"`
	FamilyName string                      `json:"familyName"`
	Tables     map[string][]map[string]any `json:"tables"`
	Files      []string                    `json:"files"`
}

// Service makes and restores the backups.
type Service struct {
	db      *gorm.DB
	storage storage.Storage
	cfg     *config.Config
}

func NewService(db *gorm.DB, st storage.Storage, cfg *config.Config) *Service {
	return &Service{db: db, storage: st, cfg: cfg}
}

// keys reads the ids that tie a family's rows together.
func keys(tx *gorm.DB, familyID int) (ids, error) {
	k := ids{family: familyID}
	if err := tx.Table("user_families").Where("family_id = ?", familyID).Distinct().Pluck("user_id", &k.members).Error; err != nil {
		return k, err
	}
	if err := tx.Table("chores").Where("family_id = ?", familyID).Pluck("id", &k.chores).Error; err != nil {
		return k, err
	}
	if err := tx.Table("routines").Where("family_id = ?", familyID).Pluck("id", &k.routines).Error; err != nil {
		return k, err
	}
	if err := tx.Table("challenges").Where("family_id = ?", familyID).Pluck("id", &k.challenges).Error; err != nil {
		return k, err
	}
	return k, nil
}

// Collect reads a family's rows, table by table.
func (s *Service) Collect(ctx context.Context, familyID int) (*Data, error) {
	tx := s.db.WithContext(ctx)
	k, err := keys(tx, familyID)
	if err != nil {
		return nil, err
	}
	data := &Data{
		Format:     Format,
		Version:    s.cfg.Info.Version,
		ExportedAt: time.Now().UTC(),
		FamilyID:   familyID,
		Tables:     map[string][]map[string]any{},
	}
	for _, t := range saved {
		if !tx.Migrator().HasTable(t.name) {
			continue
		}
		where, args := t.where(k)
		var rows []map[string]any
		if err := tx.Table(t.name).Where(where, args...).Find(&rows).Error; err != nil {
			return nil, fmt.Errorf("%s: %w", t.name, err)
		}
		for _, row := range rows {
			for col, v := range row {
				row[col] = encode(v)
			}
		}
		data.Tables[t.name] = rows
	}
	if fam := data.Tables["families"]; len(fam) == 1 {
		data.FamilyName, _ = fam[0]["name"].(string)
	}
	data.Files = filesOf(data)
	return data, nil
}

// filesOf lists the stored files of a family: attachments and photos.
func filesOf(data *Data) []string {
	seen := map[string]bool{}
	for _, row := range data.Tables["storage_files"] {
		if p, ok := row["file_path"].(string); ok && p != "" {
			seen[p] = true
		}
	}
	for _, row := range data.Tables["users"] {
		if p, ok := row["image"].(string); ok && p != "" && !strings.Contains(p, "://") {
			seen[p] = true
		}
	}
	files := make([]string, 0, len(seen))
	for p := range seen {
		files = append(files, p)
	}
	sort.Strings(files)
	return files
}

// Write writes a family's backup to w.
func (s *Service) Write(ctx context.Context, familyID int, w io.Writer) (*Data, error) {
	data, err := s.Collect(ctx, familyID)
	if err != nil {
		return nil, err
	}
	z := zip.NewWriter(w)
	entry, err := z.CreateHeader(&zip.FileHeader{Name: dataEntry, Method: zip.Deflate, Modified: data.ExportedAt})
	if err != nil {
		return nil, err
	}
	if err := json.NewEncoder(entry).Encode(data); err != nil {
		return nil, err
	}
	kept := data.Files[:0]
	for _, path := range data.Files {
		if s.copyFile(ctx, z, path) {
			kept = append(kept, path)
		}
	}
	data.Files = kept
	return data, z.Close()
}

// copyFile puts a stored file in the zip; a missing file is skipped.
func (s *Service) copyFile(ctx context.Context, z *zip.Writer, path string) bool {
	in, err := s.storage.Get(ctx, path)
	if err != nil {
		return false
	}
	defer in.Close()
	out, err := z.CreateHeader(&zip.FileHeader{Name: filesEntry + path, Method: zip.Deflate, Modified: time.Now().UTC()})
	if err != nil {
		return false
	}
	_, err = io.Copy(out, in)
	return err == nil
}

// Read opens a backup file.
func Read(r io.ReaderAt, size int64) (*Data, *zip.Reader, error) {
	z, err := zip.NewReader(r, size)
	if err != nil {
		return nil, nil, ErrNotBackup
	}
	f, err := z.Open(dataEntry)
	if err != nil {
		return nil, nil, ErrNotBackup
	}
	defer f.Close()
	dec := json.NewDecoder(f)
	dec.UseNumber()
	var data Data
	if err := dec.Decode(&data); err != nil || data.Format == 0 || data.Tables["families"] == nil {
		return nil, nil, ErrNotBackup
	}
	if data.Format > Format {
		return nil, nil, ErrNewerFormat
	}
	return &data, z, nil
}

// Restore replaces the family familyID with the family of the backup: every
// row of familyID goes, the rows of the backup come back with their own ids.
// It returns the id of the restored family.
func (s *Service) Restore(ctx context.Context, familyID int, data *Data, z *zip.Reader) (int, error) {
	old, err := s.Collect(ctx, familyID)
	if err != nil {
		return 0, err
	}
	oldFiles := old.Files
	err = s.db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {
		k, err := keys(tx, familyID)
		if err != nil {
			return err
		}
		for _, t := range dropped {
			if err := clear(tx, t, k); err != nil {
				return err
			}
		}
		for i := len(saved) - 1; i >= 0; i-- {
			if err := clear(tx, saved[i], k); err != nil {
				return err
			}
		}
		for _, t := range saved {
			if err := s.insert(tx, t.name, data.Tables[t.name]); err != nil {
				return err
			}
		}
		return nil
	})
	if err != nil {
		return 0, err
	}
	zone.Forget(familyID)
	zone.Forget(data.FamilyID)

	// The files go back once the rows are in, the old ones out after.
	restored := map[string]bool{}
	for _, f := range z.File {
		path, ok := strings.CutPrefix(f.Name, filesEntry)
		if !ok || path == "" || f.FileInfo().IsDir() {
			continue
		}
		in, err := f.Open()
		if err != nil {
			continue
		}
		if s.storage.Save(ctx, path, in) == nil {
			restored[path] = true
		}
		in.Close()
	}
	var gone []string
	for _, p := range oldFiles {
		if !restored[p] {
			gone = append(gone, p)
		}
	}
	if len(gone) > 0 {
		_ = s.storage.Delete(ctx, gone)
	}
	return data.FamilyID, nil
}

func clear(tx *gorm.DB, t table, k ids) error {
	if !tx.Migrator().HasTable(t.name) {
		return nil
	}
	where, args := t.where(k)
	if err := tx.Exec("DELETE FROM "+t.name+" WHERE "+where, args...).Error; err != nil {
		return fmt.Errorf("%s: %w", t.name, err)
	}
	return nil
}

// insert puts rows back. Columns this server no longer has are left out, and
// columns it gained take their default.
func (s *Service) insert(tx *gorm.DB, name string, rows []map[string]any) error {
	if len(rows) == 0 || !tx.Migrator().HasTable(name) {
		return nil
	}
	types, err := tx.Migrator().ColumnTypes(name)
	if err != nil {
		return err
	}
	columns := map[string]bool{}
	for _, c := range types {
		columns[c.Name()] = true
	}
	clean := make([]map[string]any, 0, len(rows))
	var taken []any
	for _, row := range rows {
		out := map[string]any{}
		for col, v := range row {
			if columns[col] {
				out[col] = decode(v)
			}
		}
		if id, ok := out["id"]; ok {
			taken = append(taken, id)
		}
		if p, ok := out["file_path"]; ok && name == "storage_files" {
			taken = append(taken, p)
		}
		clean = append(clean, out)
	}
	if len(taken) > 0 {
		key := "id"
		if name == "storage_files" {
			key = "file_path"
		}
		var n int64
		if err := tx.Table(name).Where(key+" IN ?", taken).Count(&n).Error; err != nil {
			return err
		}
		if n > 0 {
			return ErrTaken{Table: name}
		}
	}
	for _, row := range clean {
		if err := tx.Table(name).Create(row).Error; err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	if columns["id"] && tx.Dialector.Name() == "postgres" {
		seq := fmt.Sprintf("SELECT setval(pg_get_serial_sequence('%s', 'id'), (SELECT COALESCE(MAX(id), 1) FROM %s))", name, name)
		if err := tx.Exec(seq).Error; err != nil {
			return fmt.Errorf("%s: %w", name, err)
		}
	}
	return nil
}

// encode keeps the type of the values JSON would lose: dates and bytes.
func encode(v any) any {
	switch x := v.(type) {
	case time.Time:
		return map[string]any{"$date": x.UTC().Format(time.RFC3339Nano)}
	case *time.Time:
		if x == nil {
			return nil
		}
		return encode(*x)
	case []byte:
		return map[string]any{"$bytes": base64.StdEncoding.EncodeToString(x)}
	}
	return v
}

func decode(v any) any {
	switch x := v.(type) {
	case json.Number:
		if i, err := strconv.ParseInt(string(x), 10, 64); err == nil {
			return i
		}
		f, _ := x.Float64()
		return f
	case map[string]any:
		if s, ok := x["$date"].(string); ok && len(x) == 1 {
			if t, err := time.Parse(time.RFC3339Nano, s); err == nil {
				return t
			}
		}
		if s, ok := x["$bytes"].(string); ok && len(x) == 1 {
			if b, err := base64.StdEncoding.DecodeString(s); err == nil {
				return b
			}
		}
	case float64:
		if x == float64(int64(x)) {
			return int64(x)
		}
	}
	return v
}
