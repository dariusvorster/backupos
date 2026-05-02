package streamctx

import (
	"context"
	"net/http/httptest"
	"testing"
	"time"
)

func TestWithSession_RoundTrip(t *testing.T) {
	want := &SessionContext{
		SessionID:     "sess-1",
		DatastoreID:   "ds-1",
		DatastoreRoot: "/var/lib/backupos/pbs/default",
		BackupType:    "vm",
		BackupID:      "100",
		BackupTime:    time.Unix(1735000000, 0),
		Namespace:     "",
	}
	ctx := WithSession(context.Background(), want)
	got := FromContext(ctx)
	if got != want {
		t.Errorf("FromContext returned different pointer: got %p, want %p", got, want)
	}
}

func TestFromContext_Empty(t *testing.T) {
	if got := FromContext(context.Background()); got != nil {
		t.Errorf("expected nil for unset context, got %v", got)
	}
}

func TestFromRequest(t *testing.T) {
	want := &SessionContext{SessionID: "sess-1"}
	r := httptest.NewRequest("GET", "/", nil)
	r = r.WithContext(WithSession(r.Context(), want))
	if got := FromRequest(r); got != want {
		t.Errorf("FromRequest returned different pointer")
	}
}
