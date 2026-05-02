package namespace

import (
	"errors"
	"strings"
	"testing"
)

func TestParse_EmptyString_ReturnsRoot(t *testing.T) {
	ns, err := Parse("")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !ns.IsRoot() {
		t.Errorf("expected root namespace, got %q", ns)
	}
}

func TestParse_SingleComponent(t *testing.T) {
	ns, err := Parse("alice")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ns.String() != "alice" {
		t.Errorf("got %q, want %q", ns, "alice")
	}
}

func TestParse_MultipleComponents(t *testing.T) {
	ns, err := Parse("alice/dev")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ns.String() != "alice/dev" {
		t.Errorf("got %q, want %q", ns, "alice/dev")
	}
}

func TestParse_TooDeep_ReturnsError(t *testing.T) {
	// 5 components exceeds MaxDepth=4
	_, err := Parse("a/b/c/d/e")
	if !errors.Is(err, ErrInvalidNamespace) {
		t.Errorf("expected ErrInvalidNamespace for depth 5, got %v", err)
	}
}

func TestParse_ExactlyMaxDepth_Accepted(t *testing.T) {
	_, err := Parse("a/b/c/d")
	if err != nil {
		t.Errorf("expected depth 4 to be accepted, got %v", err)
	}
}

func TestParse_TooLong_ReturnsError(t *testing.T) {
	// 65 chars exceeds MaxStringLen=64
	long := strings.Repeat("a", 65)
	_, err := Parse(long)
	if !errors.Is(err, ErrInvalidNamespace) {
		t.Errorf("expected ErrInvalidNamespace for length 65, got %v", err)
	}
}

func TestParse_InvalidCharacter_ReturnsError(t *testing.T) {
	cases := []string{
		"alice/with space",
		"alice/..",
		"alice/.",
		"alice/with.dot",
		"alice//double",
	}
	for _, c := range cases {
		t.Run(c, func(t *testing.T) {
			_, err := Parse(c)
			if !errors.Is(err, ErrInvalidNamespace) {
				t.Errorf("Parse(%q): expected ErrInvalidNamespace, got %v", c, err)
			}
		})
	}
}

func TestParse_EmptyComponent_ReturnsError(t *testing.T) {
	cases := []string{"/alice", "alice/"}
	for _, c := range cases {
		t.Run(c, func(t *testing.T) {
			_, err := Parse(c)
			if !errors.Is(err, ErrInvalidNamespace) {
				t.Errorf("Parse(%q): expected ErrInvalidNamespace, got %v", c, err)
			}
		})
	}
}

func TestPathSegments_Root_ReturnsNil(t *testing.T) {
	ns := Root()
	if segs := ns.PathSegments(); segs != nil {
		t.Errorf("Root().PathSegments() = %v, want nil", segs)
	}
}

func TestPathSegments_OneLevel(t *testing.T) {
	ns, _ := Parse("alice")
	want := []string{"ns", "alice"}
	got := ns.PathSegments()
	if len(got) != len(want) {
		t.Fatalf("PathSegments() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("PathSegments()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestPathSegments_TwoLevels(t *testing.T) {
	ns, _ := Parse("alice/dev")
	want := []string{"ns", "alice", "ns", "dev"}
	got := ns.PathSegments()
	if len(got) != len(want) {
		t.Fatalf("PathSegments() = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Errorf("PathSegments()[%d] = %q, want %q", i, got[i], want[i])
		}
	}
}

func TestJoinPath_Root_ReturnsRoot(t *testing.T) {
	ns := Root()
	root := "/var/lib/backupos/pbs/mystore"
	if got := ns.JoinPath(root); got != root {
		t.Errorf("Root().JoinPath(%q) = %q, want %q", root, got, root)
	}
}

func TestJoinPath_OneLevel(t *testing.T) {
	ns, _ := Parse("alice")
	got := ns.JoinPath("/data")
	want := "/data/ns/alice"
	if got != want {
		t.Errorf("JoinPath = %q, want %q", got, want)
	}
}

func TestString_RoundTrip(t *testing.T) {
	cases := []string{"alice", "alice/dev", "a/b/c/d", ""}
	for _, s := range cases {
		ns, err := Parse(s)
		if err != nil {
			t.Fatalf("Parse(%q): %v", s, err)
		}
		if got := ns.String(); got != s {
			t.Errorf("Parse(%q).String() = %q, want %q", s, got, s)
		}
	}
}
