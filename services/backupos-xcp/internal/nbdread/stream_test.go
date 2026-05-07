package nbdread

import "testing"

// StreamFullExport requires a live NBD server, so we don't unit test the
// full call path. Real verification is the integration test.
func TestStreamFullExport_RequiresNbdcopy(t *testing.T) {
	t.Skip("integration only — nbdcopy availability tested by integration suite")
}
