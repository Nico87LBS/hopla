package voice

import (
	"context"
	"testing"

	"github.com/stretchr/testify/require"
)

func TestASoundAloneIsWrittenForTheVoice(t *testing.T) {
	fr := "fr_FR-siwis-medium"
	for text, want := range map[string]string{
		"in":    "hein",
		"eu":    "eux",
		"é":     "ée",
		"É":     "ée",
		" ch ":  "che",
		"gn.":   "gne.",
		"ill ?": "ye?",
		"ç":     "sse",
		// Read well already: left as they are.
		"ou":    "ou",
		"au":    "au",
		"on":    "on",
		"lapin": "lapin",
		"chat":  "chat",
		"l":     "l",
	} {
		require.Equal(t, want, sayable(text, fr), text)
	}
}

func TestASoundBetweenQuotesIsWrittenForTheVoice(t *testing.T) {
	fr := "fr_FR-siwis-medium"
	require.Equal(t, "Le son « hein » s’écrit aussi ain.", sayable("Le son « in » s’écrit aussi ain.", fr))
	require.Equal(t, "Quel son entends-tu dans « chat » ?", sayable("Quel son entends-tu dans « chat » ?", fr))
	require.Equal(t, "On écrit «aie» ou «ée».", sayable("On écrit «è» ou «é».", fr))
	// Other languages read their own way.
	require.Equal(t, "in", sayable("in", "en_GB-alba-medium"))
}

func TestTheVoiceGetsTheSoundWritten(t *testing.T) {
	addr, _ := fakeServer(t)
	piper := New(addr, t.TempDir())
	sound, err := piper.Speak(context.Background(), "eu", "fr_FR-siwis-medium")
	require.NoError(t, err)
	before, after := 150*16*2, 250*16*2
	require.Equal(t, "euxfr_FR-siwis-medium", string(sound[44+before:len(sound)-after]))
}
