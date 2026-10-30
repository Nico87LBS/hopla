package email

import (
	"strings"
	"testing"
)

func TestEncodeDecodeEmailAndCode_RoundTrip(t *testing.T) {
	cases := []struct{ email, code string }{
		{"evan@example.com", "abc123"},
		{"a.b@example.co.uk", "Zm9vYmFyX2Jhei0xMjM"},
		{"someone+tagged@example.org", "tok_with-url_safe-chars"},
	}
	for _, tc := range cases {
		enc := encodeEmailAndCode(tc.email, tc.code)

		// Must be URL-safe so it survives query parsing untouched (the bug).
		if strings.ContainsAny(enc, "+/") {
			t.Fatalf("encoded value contains URL-unsafe chars %q for (%q,%q)", enc, tc.email, tc.code)
		}

		gotEmail, gotCode, err := DecodeEmailAndCode(enc)
		if err != nil {
			t.Fatalf("DecodeEmailAndCode(%q) error: %v", enc, err)
		}
		if gotEmail != tc.email || gotCode != tc.code {
			t.Fatalf("round-trip mismatch: got (%q,%q), want (%q,%q)", gotEmail, gotCode, tc.email, tc.code)
		}
	}
}

func TestLanguagePicksAnAvailableOne(t *testing.T) {
	cases := map[string]string{
		"fr":                      "fr",
		"fr-BE,fr;q=0.9,en;q=0.8": "fr",
		"de-DE,en;q=0.5":          "en",
		"de":                      DefaultLanguage,
		"":                        DefaultLanguage,
	}
	for asked, want := range cases {
		if got := Language(asked); got != want {
			t.Errorf("Language(%q) = %q, want %q", asked, got, want)
		}
	}
}

func TestEveryLanguageHasTheSameEmails(t *testing.T) {
	for _, lang := range []string{"fr", "en"} {
		subject, body, err := render("resetPassword", lang, "https://hopla.example/password/update?c=x&y")
		if err != nil {
			t.Fatalf("%s: %v", lang, err)
		}
		if subject == "" || !strings.Contains(body, `href="https://hopla.example/password/update?c=x&amp;y"`) {
			t.Fatalf("%s: unexpected e-mail %q %q", lang, subject, body)
		}
		if !strings.Contains(body, `lang="`+lang+`"`) {
			t.Fatalf("%s: missing language", lang)
		}
	}
}
