package email

import (
	"bytes"
	"embed"
	"encoding/json"
	"fmt"
	"html/template"
	"strings"
)

// The texts of each e-mail live in one file per language, locales/<lang>.json,
// and every e-mail shares layout.html.

//go:embed locales/*.json
var locales embed.FS

//go:embed layout.html
var layoutHTML string

var layout = template.Must(template.New("email").Parse(layoutHTML))

// DefaultLanguage is used when the asked language has no texts.
const DefaultLanguage = "en"

// texts are an e-mail's words in one language.
type texts struct {
	Subject string `json:"subject"`
	Title   string `json:"title"`
	Body    string `json:"body"`
	Button  string `json:"button"`
	Ignore  string `json:"ignore"`
}

// Language is the language with texts that best fits an Accept-Language
// header or a plain code such as "fr" or "fr-BE", else DefaultLanguage.
func Language(asked string) string {
	for _, part := range strings.Split(asked, ",") {
		code := strings.ToLower(strings.TrimSpace(strings.SplitN(part, ";", 2)[0]))
		code = strings.SplitN(code, "-", 2)[0]
		if code == "" {
			continue
		}
		if _, err := locales.Open("locales/" + code + ".json"); err == nil {
			return code
		}
	}
	return DefaultLanguage
}

func textsOf(name, lang string) (texts, error) {
	raw, err := locales.ReadFile("locales/" + Language(lang) + ".json")
	if err != nil {
		return texts{}, err
	}
	all := map[string]texts{}
	if err := json.Unmarshal(raw, &all); err != nil {
		return texts{}, err
	}
	t, ok := all[name]
	if !ok {
		return texts{}, fmt.Errorf("no e-mail %q in %s", name, Language(lang))
	}
	return t, nil
}

// render gives the subject and the HTML body of an e-mail, with its button
// leading to url.
func render(name, lang, url string) (string, string, error) {
	t, err := textsOf(name, lang)
	if err != nil {
		return "", "", err
	}
	var body bytes.Buffer
	err = layout.Execute(&body, struct {
		texts
		Lang string
		URL  string
	}{t, Language(lang), url})
	return t.Subject, body.String(), err
}
