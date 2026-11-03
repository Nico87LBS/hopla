package voice

import (
	"regexp"
	"strings"
)

// Every Piper voice turns the text into sounds with the same tool (espeak),
// which reads a written sound alone as a word or spells it out: « in » as
// the English « inn », « eu » as « u », « é » as « e accent aigu », « ch »
// as « cé ache ». In a word it reads them well. So a sound said alone, or
// put between « », is written for the voice the way it reads it right.
var frenchSounds = map[string]string{
	"é":   "ée",
	"è":   "aie",
	"ê":   "aie",
	"eu":  "eux",
	"in":  "hein",
	"ein": "hein",
	"gn":  "gne",
	"ill": "ye",
	"ph":  "phe",
	"gu":  "gue",
	"ch":  "che",
	"ç":   "sse",
	"ss":  "sse",
}

// quoted is a written sound between « », as in « Le son « in » ».
var quoted = regexp.MustCompile(`«(\s*)([^«»\s]{1,3})(\s*)»`)

// sayable gives the text as it is sent to the voice.
func sayable(text, voice string) string {
	if !strings.HasPrefix(voice, "fr") {
		return text
	}
	if said, ok := soundAlone(text); ok {
		return said
	}
	return quoted.ReplaceAllStringFunc(text, func(match string) string {
		parts := quoted.FindStringSubmatch(match)
		said, ok := frenchSounds[strings.ToLower(parts[2])]
		if !ok {
			return match
		}
		return "«" + parts[1] + said + parts[3] + "»"
	})
}

// soundAlone tells whether the whole text is one written sound, perhaps
// with a dot or a question mark, and how the voice should get it.
func soundAlone(text string) (string, bool) {
	core := strings.TrimSpace(text)
	end := ""
	if trimmed := strings.TrimRight(core, ".?!…"); trimmed != core {
		end, core = core[len(trimmed):], strings.TrimSpace(trimmed)
	}
	said, ok := frenchSounds[strings.ToLower(core)]
	if !ok {
		return "", false
	}
	return said + end, true
}
