package auth

import (
	"errors"
	"testing"
)

func TestParseAuthHeader_Valid(t *testing.T) {
	h, err := ParseAuthHeader("PBSAPIToken=root@pbs!test1:abc123def")
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if h.User != "root" {
		t.Errorf("user: got %q, want %q", h.User, "root")
	}
	if h.Realm != "pbs" {
		t.Errorf("realm: got %q, want %q", h.Realm, "pbs")
	}
	if h.TokenName != "test1" {
		t.Errorf("tokenName: got %q, want %q", h.TokenName, "test1")
	}
	if h.Secret != "abc123def" {
		t.Errorf("secret: got %q, want %q", h.Secret, "abc123def")
	}
}

func TestParseAuthHeader_SecretWithSpecialChars(t *testing.T) {
	// Secrets are hex strings in practice but the parser shouldn't choke
	// on colons/at signs/bangs in the secret portion.
	h, err := ParseAuthHeader("PBSAPIToken=root@pbs!test1:secret:with:colons")
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if h.Secret != "secret:with:colons" {
		t.Errorf("secret: got %q", h.Secret)
	}
}

func TestParseAuthHeader_SpaceSeparated(t *testing.T) {
	h, err := ParseAuthHeader("PBSAPIToken root@pbs!test1:abcdef")
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if h.User != "root" {
		t.Errorf("user: got %q, want %q", h.User, "root")
	}
	if h.Realm != "pbs" {
		t.Errorf("realm: got %q, want %q", h.Realm, "pbs")
	}
	if h.TokenName != "test1" {
		t.Errorf("tokenName: got %q, want %q", h.TokenName, "test1")
	}
	if h.Secret != "abcdef" {
		t.Errorf("secret: got %q, want %q", h.Secret, "abcdef")
	}
}

func TestParseAuthHeader_Malformed(t *testing.T) {
	cases := []string{
		"",                               // empty
		"Bearer abc",                     // wrong scheme
		"PBSAPIToken=",                   // empty body
		"PBSAPIToken=user",               // missing everything
		"PBSAPIToken=user@realm",         // missing !tokenname:secret
		"PBSAPIToken=user@realm!name",    // missing :secret
		"PBSAPIToken=user@realm!name:",   // empty secret
		"PBSAPIToken=@realm!name:secret", // empty user
		"PBSAPIToken=user@!name:secret",  // empty realm
		"PBSAPIToken=user@realm!:secret", // empty token name
		"PBSAPIToken=user!name:secret",   // missing @realm
		"PBSAPIToken:root@pbs!test1:x",   // unrecognised separator
		"PBSAPIToken",                    // scheme only, no separator
	}
	for _, c := range cases {
		t.Run(c, func(t *testing.T) {
			if _, err := ParseAuthHeader(c); !errors.Is(err, ErrMalformed) {
				t.Errorf("input %q: expected ErrMalformed, got %v", c, err)
			}
		})
	}
}

func TestHashSecret_KnownVector(t *testing.T) {
	// Sanity check: sha256("hello") = 2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824
	got := HashSecret("hello")
	want := "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824"
	if got != want {
		t.Errorf("got %q, want %q", got, want)
	}
}

func TestHashSecret_Length(t *testing.T) {
	// All hashes are 64 hex chars regardless of input.
	if got := len(HashSecret("")); got != 64 {
		t.Errorf("expected length 64, got %d", got)
	}
	if got := len(HashSecret("a")); got != 64 {
		t.Errorf("expected length 64, got %d", got)
	}
	if got := len(HashSecret("a much longer string")); got != 64 {
		t.Errorf("expected length 64, got %d", got)
	}
}
