package auth

import (
	"errors"
	"testing"
)

func TestAuthorizeDatastore_NilIdentity_Denied(t *testing.T) {
	err := AuthorizeDatastore(nil, "ds-1")
	if !errors.Is(err, ErrDatastoreNotAuthorized) {
		t.Errorf("expected ErrDatastoreNotAuthorized, got %v", err)
	}
}

func TestAuthorizeDatastore_EmptyTokenDatastoreID_Unrestricted(t *testing.T) {
	id := &Identity{TokenID: "tok", TokenDatastoreID: ""}
	if err := AuthorizeDatastore(id, "ds-1"); err != nil {
		t.Errorf("expected nil for unrestricted token, got %v", err)
	}
}

func TestAuthorizeDatastore_MatchingDatastoreID_Allowed(t *testing.T) {
	id := &Identity{TokenID: "tok", TokenDatastoreID: "ds-1"}
	if err := AuthorizeDatastore(id, "ds-1"); err != nil {
		t.Errorf("expected nil for matching datastore, got %v", err)
	}
}

func TestAuthorizeDatastore_NonMatchingDatastoreID_Denied(t *testing.T) {
	id := &Identity{TokenID: "tok", TokenDatastoreID: "ds-1"}
	err := AuthorizeDatastore(id, "ds-2")
	if !errors.Is(err, ErrDatastoreNotAuthorized) {
		t.Errorf("expected ErrDatastoreNotAuthorized, got %v", err)
	}
}
