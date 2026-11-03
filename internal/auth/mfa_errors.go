package auth

// MFARequiredError represents an error when MFA verification is required
type MFARequiredError struct {
	message string
}

func (e *MFARequiredError) Error() string {
	return e.message
}

func NewMFARequiredError() *MFARequiredError {
	return &MFARequiredError{
		message: "MFA verification required",
	}
}
