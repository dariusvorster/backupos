package nbdread

import (
	"strings"
	"testing"
)

func TestBuildURI(t *testing.T) {
	conn := Connection{
		Address:    "192.168.69.2",
		Port:       10809,
		ExportName: "/abc-123?session_id=OpaqueRef:foo",
		Subject:    "xenpool4host3",
	}
	got := buildURI(conn, "/tmp/certs")

	mustContain := []string{
		"nbds://192.168.69.2:10809/",
		"tls-certificates=%2Ftmp%2Fcerts",
		"tls-hostname=xenpool4host3",
	}
	for _, s := range mustContain {
		if !strings.Contains(got, s) {
			t.Errorf("URI missing %q\nfull URI: %s", s, got)
		}
	}
	// The export name has slashes and a query-marker — it should be percent-encoded
	// so it doesn't poison our query string.
	if strings.Contains(got, "?session_id=OpaqueRef") {
		t.Errorf("export name not properly URL-escaped (raw '?session_id' leaked): %s", got)
	}
}

func TestBuildPythonScript(t *testing.T) {
	regions := []Region{
		{Offset: 0, Length: 65536},
		{Offset: 1048576, Length: 131072},
	}
	script := buildPythonScript("nbds://example/foo", regions)

	mustContain := []string{
		`h.connect_uri("nbds://example/foo")`,
		`h.pread(65536, 0)`,
		`h.pread(131072, 1048576)`,
		`h.shutdown()`,
	}
	for _, s := range mustContain {
		if !strings.Contains(script, s) {
			t.Errorf("script missing %q\nfull script:\n%s", s, script)
		}
	}
}

func TestBuildPythonScript_EmptyRegions(t *testing.T) {
	script := buildPythonScript("nbds://example/foo", nil)
	if !strings.Contains(script, `h.connect_uri("nbds://example/foo")`) {
		t.Errorf("script missing connect call:\n%s", script)
	}
	if !strings.Contains(script, "h.shutdown()") {
		t.Errorf("script missing shutdown:\n%s", script)
	}
	if strings.Contains(script, "h.pread") {
		t.Errorf("script has pread for empty region list:\n%s", script)
	}
}
