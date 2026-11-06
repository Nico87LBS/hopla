package sanitize

import (
	"strings"
	"testing"
)

func TestRichTextHTMLRemovesActiveContent(t *testing.T) {
	input := `<p onclick="alert(1)">Safe <strong>text</strong><img src="/api/v1/assets/a.jpg" data-hopla-path="users/1/a.jpg" onerror="alert(2)"></p><script>alert(3)</script><a href="javascript:alert(4)">bad link</a>`
	got := RichTextHTML(input)

	for _, forbidden := range []string{"onclick", "onerror", "<script", "javascript:", "alert("} {
		if strings.Contains(strings.ToLower(got), forbidden) {
			t.Fatalf("unsafe content %q remained in sanitized HTML: %s", forbidden, got)
		}
	}
	for _, expected := range []string{"Safe", "<strong>text</strong>", "data-hopla-path"} {
		if !strings.Contains(got, expected) {
			t.Fatalf("expected sanitized HTML to preserve %q: %s", expected, got)
		}
	}
}

func TestRichTextHTMLDropsUnsafeImageAndEmbeddedDocument(t *testing.T) {
	input := `<p>before<img src="data:text/html,<script>alert(1)</script>">after</p><iframe src="https://attacker.invalid"></iframe>`
	got := RichTextHTML(input)
	if strings.Contains(got, "data:") || strings.Contains(got, "iframe") || strings.Contains(got, "attacker") {
		t.Fatalf("unsafe embedded content remained: %s", got)
	}
	if !strings.Contains(got, "before") || !strings.Contains(got, "after") {
		t.Fatalf("safe surrounding text should be preserved: %s", got)
	}
}
