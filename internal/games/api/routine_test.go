package api

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/require"
)

// The web marks optional steps by their place: the request must keep them.
func TestRoutineRequestKeepsOptionalSteps(t *testing.T) {
	var req RoutineReq
	require.NoError(t, json.Unmarshal([]byte(`{"name":"Matin","choreIds":[4,5,6],"optionalStepIds":[2,3],"dependencies":[]}`), &req))
	require.Equal(t, []int{2, 3}, req.OptionalStepIDs)
}
