// Package voice makes the questions of the games heard with a natural
// voice: Hopla asks a Piper speech server, through the Wyoming protocol,
// and keeps each sentence it made on disk, so it is made only once.
package voice

import (
	"bufio"
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"
)

// MaxText is the longest sentence said, in characters.
const MaxText = 400

// ErrOff tells that no speech server is set.
var ErrOff = errors.New("no speech server")

// ErrInvalid tells a text or a voice Hopla does not send.
var ErrInvalid = errors.New("invalid text or voice")

var voiceName = regexp.MustCompile(`^[A-Za-z0-9_.+-]{1,80}$`)

// Voice is a voice of the speech server.
type Voice struct {
	Name        string   `json:"name"`
	Description string   `json:"description,omitempty"`
	Languages   []string `json:"languages"`
	Installed   bool     `json:"installed"`
}

// Piper talks to a Wyoming speech server.
type Piper struct {
	addr string
	dir  string
	// Only a few sentences are made at a time, not to overload the server.
	slots chan struct{}

	mu        sync.Mutex
	voices    []Voice
	voicesAt  time.Time
	timeout   time.Duration
	voicesTTL time.Duration
}

// New sets the speech server at addr (host:port, or tcp://host:port) and
// the folder of the sentences kept. An empty addr turns the voice off.
func New(addr, dir string) *Piper {
	addr = strings.TrimSpace(strings.TrimPrefix(strings.TrimSpace(addr), "tcp://"))
	return &Piper{addr: addr, dir: dir, slots: make(chan struct{}, 2),
		timeout: 20 * time.Second, voicesTTL: 10 * time.Minute}
}

// CacheDir is where the sentences made are kept: the folder given, else
// "voix" next to the SQLite database, where the volume of Hopla keeps them.
func CacheDir(dir string) string {
	if dir != "" {
		return dir
	}
	db := os.Getenv("HOPLA_SQLITE_PATH")
	if db == "" {
		db = "hopla.db"
	}
	return filepath.Join(filepath.Dir(db), "voix")
}

// Enabled tells whether a speech server is set.
func (p *Piper) Enabled() bool { return p != nil && p.addr != "" }

// Voices lists the voices of the server, asked again every few minutes.
func (p *Piper) Voices(ctx context.Context) ([]Voice, error) {
	if !p.Enabled() {
		return nil, ErrOff
	}
	p.mu.Lock()
	if p.voices != nil && time.Since(p.voicesAt) < p.voicesTTL {
		voices := p.voices
		p.mu.Unlock()
		return voices, nil
	}
	p.mu.Unlock()

	var voices []Voice
	err := p.talk(ctx, event{Type: "describe"}, func(e event) (bool, error) {
		if e.Type != "info" {
			return false, nil
		}
		var info struct {
			TTS []struct {
				Voices []Voice `json:"voices"`
			} `json:"tts"`
		}
		if err := json.Unmarshal(e.Data, &info); err != nil {
			return true, err
		}
		voices = []Voice{}
		for _, tts := range info.TTS {
			voices = append(voices, tts.Voices...)
		}
		return true, nil
	})
	if err != nil {
		return nil, err
	}
	p.mu.Lock()
	p.voices, p.voicesAt = voices, time.Now().UTC()
	p.mu.Unlock()
	return voices, nil
}

// Speak gives a sentence said by a voice, as a WAV sound: from the disk
// when it was made before, else from the server. A short silence goes
// before and after it: a tablet cuts the very start of a sound, and some
// words end so abruptly that they seem cut.
func (p *Piper) Speak(ctx context.Context, text, voice string) ([]byte, error) {
	sound, err := p.made(ctx, text, voice)
	if err != nil {
		return nil, err
	}
	return padded(sound), nil
}

// pathOf tells where a sentence is kept, or why it is not said.
func (p *Piper) pathOf(text, voice string) (string, string, error) {
	if !p.Enabled() {
		return "", "", ErrOff
	}
	text = strings.TrimSpace(text)
	if text == "" || utf8.RuneCountInString(text) > MaxText || !voiceName.MatchString(voice) {
		return "", "", ErrInvalid
	}
	if p.dir == "" {
		return text, "", nil
	}
	sum := sha256.Sum256([]byte(voice + "\x00" + text))
	key := hex.EncodeToString(sum[:])
	return text, filepath.Join(p.dir, voice, key[:2], key+".wav"), nil
}

// Forget throws away a sentence kept, so that it is made again the next
// time: the voice draws a little at random, and a sentence badly said
// would otherwise stay so.
func (p *Piper) Forget(text, voice string) error {
	_, path, err := p.pathOf(text, voice)
	if err != nil || path == "" {
		return err
	}
	if err := os.Remove(path); err != nil && !errors.Is(err, os.ErrNotExist) {
		return err
	}
	return nil
}

// made is the sentence as the server said it, without the silences.
func (p *Piper) made(ctx context.Context, text, voice string) ([]byte, error) {
	text, path, err := p.pathOf(text, voice)
	if err != nil {
		return nil, err
	}
	if path != "" {
		if sound, err := os.ReadFile(path); err == nil {
			return sound, nil
		}
	}

	select {
	case p.slots <- struct{}{}:
		defer func() { <-p.slots }()
	case <-ctx.Done():
		return nil, ctx.Err()
	}

	request, _ := json.Marshal(map[string]any{"text": text, "voice": map[string]string{"name": voice}})
	var pcm bytes.Buffer
	rate, width, channels := 22050, 2, 1
	err = p.talk(ctx, event{Type: "synthesize", Data: request}, func(e event) (bool, error) {
		switch e.Type {
		case "audio-start", "audio-chunk":
			var format struct {
				Rate     int `json:"rate"`
				Width    int `json:"width"`
				Channels int `json:"channels"`
			}
			if json.Unmarshal(e.Data, &format) == nil && format.Rate > 0 {
				rate, width, channels = format.Rate, format.Width, format.Channels
			}
			pcm.Write(e.Payload)
		case "audio-stop":
			return true, nil
		case "error":
			return true, fmt.Errorf("speech server: %s", e.Data)
		}
		return false, nil
	})
	if err != nil {
		return nil, err
	}
	if pcm.Len() == 0 {
		return nil, errors.New("speech server: no sound")
	}
	sound := wav(pcm.Bytes(), rate, width, channels)
	if path != "" {
		// A sentence that cannot be kept is still said.
		if os.MkdirAll(filepath.Dir(path), 0o755) == nil {
			tmp := path + ".tmp"
			if os.WriteFile(tmp, sound, 0o644) == nil {
				_ = os.Rename(tmp, path)
			}
		}
	}
	return sound, nil
}

// event is a message of the Wyoming protocol: a line of JSON, then its
// data and its payload, whose lengths the line gives.
type event struct {
	Type    string
	Data    json.RawMessage
	Payload []byte
}

const protocolVersion = "1.5.2"

func writeEvent(w io.Writer, e event) error {
	header := map[string]any{"type": e.Type, "version": protocolVersion}
	if len(e.Data) > 0 {
		header["data_length"] = len(e.Data)
	}
	if len(e.Payload) > 0 {
		header["payload_length"] = len(e.Payload)
	}
	line, err := json.Marshal(header)
	if err != nil {
		return err
	}
	var buf bytes.Buffer
	buf.Write(line)
	buf.WriteByte('\n')
	buf.Write(e.Data)
	buf.Write(e.Payload)
	_, err = w.Write(buf.Bytes())
	return err
}

// The longest data and sound a message may carry, against a broken server.
const (
	maxData    = 1 << 20
	maxPayload = 4 << 20
	maxSound   = 30 << 20
)

func readEvent(r *bufio.Reader) (event, error) {
	line, err := r.ReadBytes('\n')
	if err != nil {
		return event{}, err
	}
	var header struct {
		Type          string          `json:"type"`
		Data          json.RawMessage `json:"data"`
		DataLength    int             `json:"data_length"`
		PayloadLength int             `json:"payload_length"`
	}
	if err := json.Unmarshal(line, &header); err != nil {
		return event{}, err
	}
	if header.DataLength < 0 || header.DataLength > maxData || header.PayloadLength < 0 || header.PayloadLength > maxPayload {
		return event{}, errors.New("speech server: message too long")
	}
	e := event{Type: header.Type, Data: header.Data}
	if header.DataLength > 0 {
		data := make([]byte, header.DataLength)
		if _, err := io.ReadFull(r, data); err != nil {
			return event{}, err
		}
		e.Data = merge(header.Data, data)
	}
	if header.PayloadLength > 0 {
		e.Payload = make([]byte, header.PayloadLength)
		if _, err := io.ReadFull(r, e.Payload); err != nil {
			return event{}, err
		}
	}
	return e, nil
}

// merge lays the data sent after the line over the data in the line.
func merge(inline, sent json.RawMessage) json.RawMessage {
	if len(inline) == 0 || string(inline) == "null" {
		return sent
	}
	fields := map[string]json.RawMessage{}
	_ = json.Unmarshal(inline, &fields)
	more := map[string]json.RawMessage{}
	if json.Unmarshal(sent, &more) != nil {
		return sent
	}
	for k, v := range more {
		fields[k] = v
	}
	out, _ := json.Marshal(fields)
	return out
}

// talk sends one message and reads the answers until done says so.
func (p *Piper) talk(ctx context.Context, request event, done func(event) (bool, error)) error {
	ctx, cancel := context.WithTimeout(ctx, p.timeout)
	defer cancel()
	var dialer net.Dialer
	conn, err := dialer.DialContext(ctx, "tcp", p.addr)
	if err != nil {
		return err
	}
	defer conn.Close()
	if deadline, ok := ctx.Deadline(); ok {
		_ = conn.SetDeadline(deadline)
	}
	if err := writeEvent(conn, request); err != nil {
		return err
	}
	reader := bufio.NewReader(conn)
	total := 0
	for {
		e, err := readEvent(reader)
		if err != nil {
			return err
		}
		if total += len(e.Payload); total > maxSound {
			return errors.New("speech server: sound too long")
		}
		finished, err := done(e)
		if err != nil || finished {
			return err
		}
	}
}

// The silences around a sentence.
const (
	silenceBefore = 150 * time.Millisecond
	silenceAfter  = 250 * time.Millisecond
)

// padded puts the silences around a WAV sound made by wav.
func padded(sound []byte) []byte {
	if len(sound) < 44 || string(sound[:4]) != "RIFF" || string(sound[36:40]) != "data" {
		return sound
	}
	le := binary.LittleEndian
	channels := int(le.Uint16(sound[22:24]))
	rate := int(le.Uint32(sound[24:28]))
	width := int(le.Uint16(sound[34:36])) / 8
	frame := channels * width
	if frame <= 0 || rate <= 0 {
		return sound
	}
	silence := func(d time.Duration) []byte {
		return make([]byte, int(d.Milliseconds())*rate/1000*frame)
	}
	pcm := sound[44:]
	all := make([]byte, 0, len(pcm)+len(silence(silenceBefore))+len(silence(silenceAfter)))
	all = append(all, silence(silenceBefore)...)
	all = append(all, pcm...)
	all = append(all, silence(silenceAfter)...)
	return wav(all, rate, width, channels)
}

// wav wraps raw sound in a WAV file, which every browser plays.
func wav(pcm []byte, rate, width, channels int) []byte {
	var buf bytes.Buffer
	le := binary.LittleEndian
	buf.WriteString("RIFF")
	_ = binary.Write(&buf, le, uint32(36+len(pcm)))
	buf.WriteString("WAVEfmt ")
	_ = binary.Write(&buf, le, uint32(16))
	_ = binary.Write(&buf, le, uint16(1))
	_ = binary.Write(&buf, le, uint16(channels))
	_ = binary.Write(&buf, le, uint32(rate))
	_ = binary.Write(&buf, le, uint32(rate*width*channels))
	_ = binary.Write(&buf, le, uint16(width*channels))
	_ = binary.Write(&buf, le, uint16(8*width))
	buf.WriteString("data")
	_ = binary.Write(&buf, le, uint32(len(pcm)))
	buf.Write(pcm)
	return buf.Bytes()
}
