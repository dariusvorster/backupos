package main

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNormalizeLeadingSlashes(t *testing.T) {
	cases := []struct {
		name     string
		inPath   string
		wantPath string
	}{
		{"single slash unchanged", "/api2/json/backup", "/api2/json/backup"},
		{"double slash collapsed", "//api2/json/backup", "/api2/json/backup"},
		{"triple slash collapsed", "///api2/json/backup", "/api2/json/backup"},
		{"single slash root", "/", "/"},
		{"double slash root", "//", "/"},
		{"empty stays empty", "", ""},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var seen string
			inner := http.HandlerFunc(func(_ http.ResponseWriter, r *http.Request) {
				seen = r.URL.Path
			})
			h := normalizeLeadingSlashes(inner)

			r := httptest.NewRequest(http.MethodGet, "http://example.com"+tc.inPath, nil)
			// httptest.NewRequest cleans paths; force the raw value:
			r.URL.Path = tc.inPath

			w := httptest.NewRecorder()
			h.ServeHTTP(w, r)

			if seen != tc.wantPath {
				t.Errorf("path: got %q, want %q", seen, tc.wantPath)
			}
		})
	}
}
