package storage

import "net/http"

// heifBrands are the brands of the ftyp box of the photos phones take as
// HEIC or HEIF.
var heifBrands = map[string]string{
	"heic": "image/heic", "heix": "image/heic", "hevc": "image/heic", "hevx": "image/heic",
	"heim": "image/heic", "heis": "image/heic",
	"mif1": "image/heif", "msf1": "image/heif",
}

// sniffContentType finds the type of a file from its first bytes, never from
// its name. It adds HEIC and HEIF to what the standard library knows.
func sniffContentType(head []byte) string {
	if len(head) >= 12 && string(head[4:8]) == "ftyp" {
		if kind, ok := heifBrands[string(head[8:12])]; ok {
			return kind
		}
	}
	return http.DetectContentType(head)
}

// inlineImage reports whether a browser may show the type inline: raster
// images only, never anything that could run.
func inlineImage(contentType string) bool {
	switch contentType {
	case "image/jpeg", "image/png", "image/gif", "image/webp", "image/heic", "image/heif":
		return true
	}
	return false
}
