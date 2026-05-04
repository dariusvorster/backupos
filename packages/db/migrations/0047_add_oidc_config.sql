CREATE TABLE `oidc_config` (
  `id` text PRIMARY KEY NOT NULL,
  `enabled` integer NOT NULL DEFAULT 0,
  `provider_label` text NOT NULL,
  `discovery_url` text NOT NULL,
  `client_id` text NOT NULL,
  `client_secret_enc` text NOT NULL,
  `scopes` text NOT NULL DEFAULT 'openid profile email',
  `button_label` text NOT NULL DEFAULT 'Sign in with SSO',
  `created_at` integer NOT NULL,
  `updated_at` integer NOT NULL
);
