package email

import (
	"context"
	"encoding/base64"
	"fmt"
	"strings"

	"github.com/nico87lbs/hopla/config"
	"github.com/nico87lbs/hopla/logging"
	gomail "gopkg.in/gomail.v2"
)

type EmailSender struct {
	client    *gomail.Dialer
	appHost   string
	fromMail  string
	logRawURL bool
}

// Sender is the interface consumed by callers, so tests can swap the SMTP
// sender for a fake one.
type Sender interface {
	SendResetPasswordEmail(c context.Context, to, code, lang string) error
}

// NewSender returns the SMTP sender configured in email.
func NewSender(conf *config.Config) Sender {
	return NewEmailSender(conf)
}

func NewEmailSender(conf *config.Config) *EmailSender {

	// if no user is set, use the email as user
	if conf.EmailConfig.User == "" {
		conf.EmailConfig.User = conf.EmailConfig.Email
	}

	client := gomail.NewDialer(conf.EmailConfig.Host, conf.EmailConfig.Port, conf.EmailConfig.User, conf.EmailConfig.Key)

	// format conf.EmailConfig.Host and port :

	// auth := smtp.PlainAuth("", conf.EmailConfig.Email, conf.EmailConfig.Password, host)
	return &EmailSender{
		fromMail:  conf.EmailConfig.Email,
		client:    client,
		appHost:   conf.EmailConfig.AppHost,
		logRawURL: conf.EmailConfig.LogRawURL,
	}
}

// SendResetPasswordEmail sends the link to choose a new password, in the
// language asked for (see Language).
func (es *EmailSender) SendResetPasswordEmail(c context.Context, to, code, lang string) error {
	u := es.appHost + "/password/update?c=" + encodeEmailAndCode(to, code)
	subject, body, err := render("resetPassword", lang, u)
	if err != nil {
		return err
	}
	msg := gomail.NewMessage()
	msg.SetHeader("From", es.fromMail)
	msg.SetHeader("To", to)
	msg.SetHeader("Subject", subject)
	msg.SetBody("text/html", body)

	if err := es.client.DialAndSend(msg); err != nil {
		if es.logRawURL {
			logging.FromContext(c).Infof("\n\n\n=== PASSWORD RESET LINK ===\nUser: %s\nURL:  %s\n==================================================\n\n\n", to, u)
			return nil
		}
		return err
	}
	return nil
}

func encodeEmailAndCode(email, code string) string {
	data := email + ":" + code
	return base64.RawURLEncoding.EncodeToString([]byte(data))
}

func DecodeEmailAndCode(encoded string) (string, string, error) {
	data, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return "", "", err
	}
	parts := string(data)
	split := strings.Split(parts, ":")
	if len(split) != 2 {
		return "", "", fmt.Errorf("Invalid format")
	}
	return split[0], split[1], nil
}
