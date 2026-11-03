package voice

import (
	"bufio"
	"context"
	"encoding/json"
	"net"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/require"
)

// fakeServer answers like a Wyoming Piper server: its voices, and a
// sentence as two chunks of sound.
func fakeServer(t *testing.T) (string, *int32) {
	t.Helper()
	listener, err := net.Listen("tcp", "127.0.0.1:0")
	require.NoError(t, err)
	t.Cleanup(func() { listener.Close() })
	var made int32
	go func() {
		for {
			conn, err := listener.Accept()
			if err != nil {
				return
			}
			go func(conn net.Conn) {
				defer conn.Close()
				request, err := readEvent(bufio.NewReader(conn))
				if err != nil {
					return
				}
				switch request.Type {
				case "describe":
					// The data in the line, as older servers send it.
					line, _ := json.Marshal(map[string]any{"type": "info", "data": map[string]any{
						"tts": []any{map[string]any{"name": "piper", "voices": []any{
							map[string]any{"name": "fr_FR-siwis-medium", "languages": []string{"fr_FR"}, "installed": true},
						}}},
					}})
					_, _ = conn.Write(append(line, '\n'))
				case "synthesize":
					atomic.AddInt32(&made, 1)
					var asked struct {
						Text  string `json:"text"`
						Voice struct {
							Name string `json:"name"`
						} `json:"voice"`
					}
					_ = json.Unmarshal(request.Data, &asked)
					format, _ := json.Marshal(map[string]int{"rate": 16000, "width": 2, "channels": 1})
					_ = writeEvent(conn, event{Type: "audio-start", Data: format})
					_ = writeEvent(conn, event{Type: "audio-chunk", Data: format, Payload: []byte(asked.Text)})
					_ = writeEvent(conn, event{Type: "audio-chunk", Data: format, Payload: []byte(asked.Voice.Name)})
					_ = writeEvent(conn, event{Type: "audio-stop"})
				}
			}(conn)
		}
	}()
	return "tcp://" + listener.Addr().String(), &made
}

func TestPiperListsItsVoices(t *testing.T) {
	addr, _ := fakeServer(t)
	voices, err := New(addr, t.TempDir()).Voices(context.Background())
	require.NoError(t, err)
	require.Equal(t, []Voice{{Name: "fr_FR-siwis-medium", Languages: []string{"fr_FR"}, Installed: true}}, voices)
}

func TestASentenceIsMadeOnceThenKept(t *testing.T) {
	addr, made := fakeServer(t)
	piper := New(addr, t.TempDir())
	sound, err := piper.Speak(context.Background(), " Solide ou liquide ? ", "fr_FR-siwis-medium")
	require.NoError(t, err)
	require.Equal(t, "RIFF", string(sound[:4]))
	require.Equal(t, "WAVE", string(sound[8:12]))
	// 16 000 sounds a second of 2 bytes: 150 ms of silence before, 250 after.
	before, after := 150*16*2, 250*16*2
	require.Equal(t, "Solide ou liquide ?fr_FR-siwis-medium", string(sound[44+before:len(sound)-after]), "the chunks in order, after the header and the silence")
	require.Equal(t, make([]byte, before), sound[44:44+before])
	require.Equal(t, make([]byte, after), sound[len(sound)-after:])

	again, err := piper.Speak(context.Background(), "Solide ou liquide ?", "fr_FR-siwis-medium")
	require.NoError(t, err)
	require.Equal(t, sound, again)
	require.EqualValues(t, 1, atomic.LoadInt32(made), "the second time comes from the disk")
}

func TestPiperRefusesWhatItShouldNotSend(t *testing.T) {
	addr, _ := fakeServer(t)
	piper := New(addr, t.TempDir())
	_, err := piper.Speak(context.Background(), "", "fr_FR-siwis-medium")
	require.ErrorIs(t, err, ErrInvalid)
	_, err = piper.Speak(context.Background(), "Bonjour", "../etc/passwd")
	require.ErrorIs(t, err, ErrInvalid)
	_, err = New("", "").Speak(context.Background(), "Bonjour", "fr_FR-siwis-medium")
	require.ErrorIs(t, err, ErrOff)
}

func TestASentenceForgottenIsMadeAgain(t *testing.T) {
	addr, made := fakeServer(t)
	piper := New(addr, t.TempDir())
	_, err := piper.Speak(context.Background(), "le hibou", "fr_FR-siwis-medium")
	require.NoError(t, err)
	require.NoError(t, piper.Forget("le hibou", "fr_FR-siwis-medium"))
	require.NoError(t, piper.Forget("jamais dit", "fr_FR-siwis-medium"), "nothing to forget is not an error")
	_, err = piper.Speak(context.Background(), "le hibou", "fr_FR-siwis-medium")
	require.NoError(t, err)
	require.EqualValues(t, 2, atomic.LoadInt32(made))
	require.ErrorIs(t, piper.Forget("le hibou", "../x"), ErrInvalid)
}
