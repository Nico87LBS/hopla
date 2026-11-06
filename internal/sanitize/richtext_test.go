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

// The editor's own formatting survives: bullets stay bullets, a code block
// keeps its lines, a centered paragraph stays centered.
func TestRichTextHTMLKeepsEditorFormatting(t *testing.T) {
	cases := map[string]string{
		`<ol><li data-list="bullet">a</li><li data-list="ordered">b</li><li data-list="checked">c</li></ol>`:                                                                                  `<ol><li data-list="bullet">a</li><li data-list="ordered">b</li><li data-list="checked">c</li></ol>`,
		`<div class="ql-code-block-container" spellcheck="false"><div class="ql-code-block" data-language="plain">x := 1</div><div class="ql-code-block" data-language="plain">y</div></div>`: `<div class="ql-code-block-container"><div class="ql-code-block" data-language="plain">x := 1</div><div class="ql-code-block" data-language="plain">y</div></div>`,
		`<p class="ql-align-center ql-indent-2 evil">c</p>`:              `<p class="ql-align-center ql-indent-2">c</p>`,
		`<ol><li data-list="x&quot; onclick=&quot;a">d</li></ol>`:        `<ol><li>d</li></ol>`,
		`<div class="ql-code-block" data-language="java script">e</div>`: `<div class="ql-code-block">e</div>`,
	}
	for input, want := range cases {
		if got := RichTextHTML(input); got != want {
			t.Fatalf("RichTextHTML(%s)\n got %s\nwant %s", input, got, want)
		}
	}
}

// A plain-text note keeps its characters; only text with tags is cleaned.
func TestRichTextHTMLLeavesPlainTextAlone(t *testing.T) {
	for _, text := range []string{"Fait & bien", "Rangé \"vite\" : 5 > 3", "Ligne 1\nLigne 2"} {
		if got := RichTextHTML(text); got != text {
			t.Fatalf("plain text changed: %q -> %q", text, got)
		}
	}
	if got := RichTextHTML("a < b <script>x</script>"); strings.Contains(got, "<script") {
		t.Fatalf("a script survived: %s", got)
	}
}
