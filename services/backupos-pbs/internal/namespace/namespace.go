// Package namespace implements PBS backup namespace parsing and path resolution.
//
// A namespace is an ordered list of path components that isolates backup
// groups within a datastore. The empty namespace (root) maps to the datastore
// root — today's layout is unchanged. Each non-root component adds two path
// segments: ns/<part>, mirroring pbs-datastore/src/datastore.rs:namespace_path.
//
// "alice"     → ns/alice/
// "alice/dev" → ns/alice/ns/dev/
package namespace

import (
	"errors"
	"fmt"
	"path/filepath"
	"regexp"
	"strings"
)

const (
	MaxDepth     = 4
	MaxStringLen = 64
)

var (
	ErrInvalidNamespace = errors.New("invalid namespace")
	componentPattern    = regexp.MustCompile(`^[a-zA-Z0-9_-]+$`)
)

// Namespace represents a backup namespace as an ordered list of path
// components. The empty namespace (zero components) is the root namespace —
// equivalent to today's no-namespace layout.
type Namespace struct {
	components []string
}

// Root returns the empty namespace (no components).
func Root() Namespace {
	return Namespace{}
}

// Parse builds a Namespace from a slash-separated string. Empty string
// returns the root namespace. Validates depth, length, and component format.
func Parse(s string) (Namespace, error) {
	if s == "" {
		return Root(), nil
	}
	if len(s) > MaxStringLen {
		return Namespace{}, fmt.Errorf("%w: longer than %d chars", ErrInvalidNamespace, MaxStringLen)
	}
	parts := strings.Split(s, "/")
	if len(parts) > MaxDepth {
		return Namespace{}, fmt.Errorf("%w: depth %d exceeds max %d", ErrInvalidNamespace, len(parts), MaxDepth)
	}
	for _, p := range parts {
		if !componentPattern.MatchString(p) {
			return Namespace{}, fmt.Errorf("%w: component %q invalid (must match [a-zA-Z0-9_-]+)", ErrInvalidNamespace, p)
		}
	}
	return Namespace{components: parts}, nil
}

// IsRoot returns true for the empty namespace.
func (n Namespace) IsRoot() bool {
	return len(n.components) == 0
}

// String returns the slash-separated representation. Root → "".
func (n Namespace) String() string {
	return strings.Join(n.components, "/")
}

// PathSegments returns the on-disk path segments for this namespace.
// Root → nil. "alice" → ["ns","alice"]. "alice/dev" → ["ns","alice","ns","dev"].
func (n Namespace) PathSegments() []string {
	if n.IsRoot() {
		return nil
	}
	segments := make([]string, 0, len(n.components)*2)
	for _, c := range n.components {
		segments = append(segments, "ns", c)
	}
	return segments
}

// JoinPath returns the absolute path of the namespace under the given root.
// Root namespace returns root unchanged.
func (n Namespace) JoinPath(root string) string {
	segments := n.PathSegments()
	if len(segments) == 0 {
		return root
	}
	return filepath.Join(append([]string{root}, segments...)...)
}
