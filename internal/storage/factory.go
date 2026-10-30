package storage

import (
	"github.com/nico87lbs/hopla/config"
)

// NewStorage returns the storage of attachments and photos: files on the
// server's disk.
func NewStorage(cfg *config.Config) (Storage, error) {
	return NewLocalStorage(cfg), nil
}

// NewURLSigner returns the URLSigner that signs links to the stored files
// with HMAC-SHA256.
func NewURLSigner(cfg *config.Config, _ Storage) (URLSigner, error) {
	return NewURLSignerLocal(cfg), nil
}
