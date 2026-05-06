package xapi

import (
	"strings"
	"testing"
)

func TestNormalizeFingerprint(t *testing.T) {
	tests := []struct {
		name    string
		in      string
		want    string
		wantErr bool
	}{
		{
			name: "colon-separated uppercase",
			in:   "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89",
			want: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
		},
		{
			name: "lowercase no separator",
			in:   "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
			want: "abcdef0123456789abcdef0123456789abcdef0123456789abcdef0123456789",
		},
		{
			name:    "too short",
			in:      "AB:CD",
			wantErr: true,
		},
		{
			name:    "non-hex",
			in:      "ZZ:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89",
			wantErr: true,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := normalizeFingerprint(tt.in)
			if (err != nil) != tt.wantErr {
				t.Fatalf("err = %v, wantErr = %v", err, tt.wantErr)
			}
			if !tt.wantErr && got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}

func TestNewConfigValidation(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Config
		wantErr string
	}{
		{
			name:    "missing url",
			cfg:     Config{Username: "root", Password: "x"},
			wantErr: "PoolMasterURL required",
		},
		{
			name:    "missing user",
			cfg:     Config{PoolMasterURL: "https://example.com", Password: "x"},
			wantErr: "Username required",
		},
		{
			name:    "missing password",
			cfg:     Config{PoolMasterURL: "https://example.com", Username: "root"},
			wantErr: "Password required",
		},
		{
			name:    "fingerprint and insecure mutually exclusive",
			cfg:     Config{PoolMasterURL: "https://example.com", Username: "root", Password: "x", CertFingerprint: "ab", InsecureSkipVerify: true},
			wantErr: "mutually exclusive",
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := New(tt.cfg, nil)
			if err == nil {
				t.Fatalf("expected error containing %q, got nil", tt.wantErr)
			}
			if !strings.Contains(err.Error(), tt.wantErr) {
				t.Fatalf("err = %v, want substring %q", err, tt.wantErr)
			}
		})
	}
}

func TestXmlrpcURL(t *testing.T) {
	tests := []struct {
		name string
		in   string
		want string
	}{
		{"https with no path", "https://192.168.69.2", "https://192.168.69.2/"},
		{"https with trailing slash", "https://192.168.69.2/", "https://192.168.69.2/"},
		{"http (scheme stays)", "http://example.com", "http://example.com/"},
		{"no scheme defaults https", "192.168.69.2", "https://192.168.69.2/"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := &Client{cfg: Config{PoolMasterURL: tt.in}}
			got, err := c.xmlrpcURL()
			if err != nil {
				t.Fatal(err)
			}
			if got != tt.want {
				t.Fatalf("got %q, want %q", got, tt.want)
			}
		})
	}
}
