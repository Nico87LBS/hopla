package sanitize

import (
	"bytes"
	"net/url"
	"strings"

	"golang.org/x/net/html"
)

// RichTextHTML removes active content and restricts rich text to the small
// formatting subset emitted by the editor. It is intentionally server-side:
// persisted descriptions and completion notes must be safe for every client.
func RichTextHTML(input string) string {
	if input == "" {
		return ""
	}

	doc, err := html.Parse(strings.NewReader(input))
	if err != nil {
		return ""
	}
	body := findBody(doc)
	if body == nil {
		return ""
	}

	var out bytes.Buffer
	for child := body.FirstChild; child != nil; child = child.NextSibling {
		renderSafe(&out, child)
	}
	return out.String()
}

func findBody(node *html.Node) *html.Node {
	if node.Type == html.ElementNode && node.Data == "body" {
		return node
	}
	for child := node.FirstChild; child != nil; child = child.NextSibling {
		if body := findBody(child); body != nil {
			return body
		}
	}
	return nil
}

var allowedTags = map[string]bool{
	"p": true, "br": true, "strong": true, "b": true, "em": true,
	"i": true, "u": true, "s": true, "blockquote": true, "pre": true,
	"code": true, "ul": true, "ol": true, "li": true, "h1": true,
	"h2": true, "h3": true, "h4": true, "a": true, "img": true,
}

var dropContentTags = map[string]bool{
	"script": true, "style": true, "iframe": true, "object": true,
	"embed": true, "svg": true, "math": true, "template": true,
	"form": true, "input": true, "button": true, "textarea": true,
}

func renderSafe(out *bytes.Buffer, node *html.Node) {
	for _, safe := range safeNodes(node) {
		_ = html.Render(out, safe)
	}
}

func safeNodes(node *html.Node) []*html.Node {
	switch node.Type {
	case html.TextNode:
		return []*html.Node{{Type: html.TextNode, Data: node.Data}}
	case html.ElementNode:
		if dropContentTags[node.Data] {
			return nil
		}
		if !allowedTags[node.Data] {
			var flattened []*html.Node
			for child := node.FirstChild; child != nil; child = child.NextSibling {
				flattened = append(flattened, safeNodes(child)...)
			}
			return flattened
		}

		safe := &html.Node{Type: html.ElementNode, Data: node.Data}
		for _, attr := range node.Attr {
			key, value := strings.ToLower(attr.Key), strings.TrimSpace(attr.Val)
			switch key {
			case "href", "src":
				if safeURL(value) {
					safe.Attr = append(safe.Attr, html.Attribute{Key: key, Val: value})
				}
			case "alt", "title":
				safe.Attr = append(safe.Attr, html.Attribute{Key: key, Val: value})
			case "data-hopla-path":
				if value != "" && !strings.ContainsAny(value, "\r\n\x00") {
					safe.Attr = append(safe.Attr, html.Attribute{Key: key, Val: value})
				}
			case "target":
				if node.Data == "a" && value == "_blank" {
					safe.Attr = append(safe.Attr, html.Attribute{Key: key, Val: value})
				}
			}
		}
		if node.Data == "a" {
			safe.Attr = append(safe.Attr, html.Attribute{Key: "rel", Val: "noopener noreferrer"})
		}
		if node.Data == "img" && !hasAttr(safe, "src") {
			return nil
		}
		for child := node.FirstChild; child != nil; child = child.NextSibling {
			for _, safeChild := range safeNodes(child) {
				safe.AppendChild(safeChild)
			}
		}
		return []*html.Node{safe}
	}
	return nil
}

func hasAttr(node *html.Node, key string) bool {
	for _, attr := range node.Attr {
		if attr.Key == key {
			return true
		}
	}
	return false
}

func safeURL(value string) bool {
	if value == "" || strings.ContainsAny(value, "\r\n\x00\\") {
		return false
	}
	for _, r := range value {
		if r < 0x20 || r == 0x7f {
			return false
		}
	}
	lower := strings.ToLower(strings.TrimSpace(value))
	if strings.HasPrefix(lower, "javascript:") || strings.HasPrefix(lower, "vbscript:") ||
		strings.HasPrefix(lower, "data:") || strings.HasPrefix(lower, "//") {
		return false
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return false
	}
	return parsed.Scheme == "" || parsed.Scheme == "http" || parsed.Scheme == "https" || parsed.Scheme == "mailto"
}
