package main

import (
	_ "embed"
	"strings"

	"github.com/nico87lbs/hopla/config"
)

// version is the Hopla version, from the VERSION file shared with the web app.
//
//go:embed VERSION
var version string

// A build without -X config.Version (go run, a local docker build) still
// reports the version it was built from.
func init() {
	if config.Version == "" || config.Version == "dev" {
		config.Version = strings.TrimSpace(version)
	}
}
