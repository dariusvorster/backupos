package auth

import "errors"

// ErrDatastoreNotAuthorized is returned by AuthorizeDatastore when the token
// is scoped to a different datastore than the one being accessed.
var ErrDatastoreNotAuthorized = errors.New("token not authorized for this datastore")

// AuthorizeDatastore checks whether id is allowed to access datastoreID.
// A nil identity returns ErrDatastoreNotAuthorized.
// An empty TokenDatastoreID means the token is unrestricted.
// A non-empty TokenDatastoreID must match datastoreID exactly.
func AuthorizeDatastore(id *Identity, datastoreID string) error {
	if id == nil {
		return ErrDatastoreNotAuthorized
	}
	if id.TokenDatastoreID == "" {
		return nil
	}
	if id.TokenDatastoreID == datastoreID {
		return nil
	}
	return ErrDatastoreNotAuthorized
}
