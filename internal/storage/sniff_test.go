package storage

import "testing"

func TestSniffContentType(t *testing.T) {
	heic := append([]byte{0, 0, 0, 24}, []byte("ftypheic")...)
	heic = append(heic, make([]byte, 16)...)
	cases := map[string][]byte{
		"image/heic":      heic,
		"image/png":       {0x89, 'P', 'N', 'G', 0x0d, 0x0a, 0x1a, 0x0a},
		"application/pdf": []byte("%PDF-1.7"),
	}
	for want, head := range cases {
		if got := sniffContentType(head); got != want {
			t.Fatalf("got %s, want %s", got, want)
		}
	}
	// A file called .heic that is a web page is not an image.
	if kind := sniffContentType([]byte("<html><script>alert(1)</script>")); inlineImage(kind) {
		t.Fatalf("a web page must not be shown inline: %s", kind)
	}
	if !inlineImage("image/heic") || inlineImage("image/svg+xml") {
		t.Fatal("HEIC is shown inline, SVG never")
	}
}
