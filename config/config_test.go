package config

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/mcuadros/go-defaults"
	"github.com/spf13/viper"
)

func TestGenerateDefaultConfigFile(t *testing.T) {
	dir := t.TempDir()
	if err := generateDefaultConfigFile(dir); err != nil {
		t.Fatalf("generateDefaultConfigFile: %v", err)
	}

	content, err := os.ReadFile(filepath.Join(dir, "selfhosted.yaml"))
	if err != nil {
		t.Fatalf("read generated config: %v", err)
	}
	if strings.Contains(string(content), placeholderJWTSecret) {
		t.Fatal("generated config still contains the placeholder JWT secret")
	}

	v := viper.New()
	v.SetConfigFile(filepath.Join(dir, "selfhosted.yaml"))
	if err := v.ReadInConfig(); err != nil {
		t.Fatalf("parse generated config: %v", err)
	}
	var cfg Config
	if err := v.Unmarshal(&cfg); err != nil {
		t.Fatalf("unmarshal generated config: %v", err)
	}
	if err := validateJWTSecret(cfg.Jwt.Secret); err != nil {
		t.Fatalf("generated JWT secret is invalid: %v", err)
	}
	if !cfg.Server.ServeFrontend {
		t.Error("expected serve_frontend to be true")
	}
}

func TestStorageLimitsHaveDefaults(t *testing.T) {
	var cfg Config
	defaults.SetDefaults(&cfg)
	if cfg.Storage.MaxFileSize != 20<<20 {
		t.Errorf("max_file_size = %d, want 20 MB", cfg.Storage.MaxFileSize)
	}
	if cfg.Storage.MaxUserStorage != 10<<30 {
		t.Errorf("max_user_storage = %d, want 10 GB", cfg.Storage.MaxUserStorage)
	}

	cfg = Config{Storage: StorageConfig{MaxFileSize: 1000, MaxUserStorage: 5000}}
	defaults.SetDefaults(&cfg)
	if cfg.Storage.MaxFileSize != 1000 || cfg.Storage.MaxUserStorage != 5000 {
		t.Errorf("set limits were replaced: %+v", cfg.Storage)
	}
}
