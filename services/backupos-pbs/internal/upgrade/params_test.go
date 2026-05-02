package upgrade

import (
	"net/url"
	"testing"
	"time"
)

func parseTestURL(t *testing.T, raw string) *url.URL {
	t.Helper()
	u, err := url.Parse(raw)
	if err != nil {
		t.Fatalf("test url parse: %v", err)
	}
	return u
}

func TestParseParams_Valid(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=100&backup-time=1735000000")
	p, err := ParseParams(u)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if p.Store != "default" {
		t.Errorf("Store: got %q", p.Store)
	}
	if p.BackupType != BackupTypeVM {
		t.Errorf("BackupType: got %q", p.BackupType)
	}
	if p.BackupID != "100" {
		t.Errorf("BackupID: got %q", p.BackupID)
	}
	if p.BackupTime.Unix() != 1735000000 {
		t.Errorf("BackupTime: got %v", p.BackupTime)
	}
	if p.Namespace != "" {
		t.Errorf("Namespace: expected empty, got %q", p.Namespace)
	}
}

func TestParseParams_WithNamespace(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=ct&backup-id=200&backup-time=1735000000&ns=tenant-a/group1")
	p, err := ParseParams(u)
	if err != nil {
		t.Fatalf("expected ok, got %v", err)
	}
	if p.BackupType != BackupTypeCT {
		t.Errorf("BackupType: got %q", p.BackupType)
	}
	if p.Namespace != "tenant-a/group1" {
		t.Errorf("Namespace: got %q", p.Namespace)
	}
}

func TestParseParams_AllBackupTypes(t *testing.T) {
	for _, bt := range []string{"vm", "ct", "host"} {
		u := parseTestURL(t, "/api2/json/backup?store=default&backup-type="+bt+"&backup-id=1&backup-time=1735000000")
		p, err := ParseParams(u)
		if err != nil {
			t.Errorf("backup-type=%s: expected ok, got %v", bt, err)
			continue
		}
		if string(p.BackupType) != bt {
			t.Errorf("backup-type=%s: got %q", bt, p.BackupType)
		}
	}
}

func TestParseParams_MissingFields(t *testing.T) {
	cases := []struct {
		name string
		url  string
		want string
	}{
		{"no store", "/api2/json/backup?backup-type=vm&backup-id=1&backup-time=1735000000", `missing required parameter "store"`},
		{"no backup-type", "/api2/json/backup?store=default&backup-id=1&backup-time=1735000000", `missing required parameter "backup-type"`},
		{"no backup-id", "/api2/json/backup?store=default&backup-type=vm&backup-time=1735000000", `missing required parameter "backup-id"`},
		{"no backup-time", "/api2/json/backup?store=default&backup-type=vm&backup-id=1", `missing required parameter "backup-time"`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			u := parseTestURL(t, tc.url)
			_, err := ParseParams(u)
			if err == nil {
				t.Fatalf("expected error, got nil")
			}
			if !IsInvalidParams(err) {
				t.Errorf("expected IsInvalidParams, got %T", err)
			}
			if err.Error() != tc.want {
				t.Errorf("reason: got %q, want %q", err.Error(), tc.want)
			}
		})
	}
}

func TestParseParams_InvalidStore(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=../etc&backup-type=vm&backup-id=1&backup-time=1735000000")
	_, err := ParseParams(u)
	if !IsInvalidParams(err) {
		t.Errorf("expected IsInvalidParams, got %v", err)
	}
}

func TestParseParams_InvalidBackupType(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=tape&backup-id=1&backup-time=1735000000")
	_, err := ParseParams(u)
	if !IsInvalidParams(err) {
		t.Errorf("expected IsInvalidParams, got %v", err)
	}
}

func TestParseParams_InvalidBackupID(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=hello%20world&backup-time=1735000000")
	_, err := ParseParams(u)
	if !IsInvalidParams(err) {
		t.Errorf("expected IsInvalidParams, got %v", err)
	}
}

func TestParseParams_BackupTimeOutOfRange(t *testing.T) {
	cases := []string{
		"0",           // before 2010
		"100",         // before 2010
		"1262303999",  // 1 second before threshold
		"32503680001", // after year 3000
	}
	for _, ts := range cases {
		t.Run(ts, func(t *testing.T) {
			u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time="+ts)
			_, err := ParseParams(u)
			if !IsInvalidParams(err) {
				t.Errorf("expected IsInvalidParams, got %v", err)
			}
		})
	}
}

func TestParseParams_BackupTimeNotInteger(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=notanumber")
	_, err := ParseParams(u)
	if !IsInvalidParams(err) {
		t.Errorf("expected IsInvalidParams, got %v", err)
	}
}

func TestParseParams_InvalidNamespace(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=1735000000&ns=has%20space")
	_, err := ParseParams(u)
	if !IsInvalidParams(err) {
		t.Errorf("expected IsInvalidParams, got %v", err)
	}
}

func TestParseParams_BoundaryBackupTimes(t *testing.T) {
	// At exactly the lower bound — should be valid
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=1262304000")
	if _, err := ParseParams(u); err != nil {
		t.Errorf("lower bound: expected ok, got %v", err)
	}
	// At exactly the upper bound — should be valid
	u = parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=32503680000")
	if _, err := ParseParams(u); err != nil {
		t.Errorf("upper bound: expected ok, got %v", err)
	}
}

// Ensure BackupTime is interpreted as seconds, not milliseconds.
func TestParseParams_BackupTimeIsSeconds(t *testing.T) {
	u := parseTestURL(t, "/api2/json/backup?store=default&backup-type=vm&backup-id=1&backup-time=1735000000")
	p, err := ParseParams(u)
	if err != nil {
		t.Fatal(err)
	}
	expected := time.Unix(1735000000, 0)
	if !p.BackupTime.Equal(expected) {
		t.Errorf("BackupTime: got %v, want %v", p.BackupTime, expected)
	}
}
