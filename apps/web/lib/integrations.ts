export type ConfigField = {
  name:        string
  label:       string
  type:        'text' | 'url' | 'password'
  required:    boolean
  placeholder?: string
  helpText?:   string
}

export type SamplePayload = {
  title:   string
  body:    string
  footer?: string
}

export type IntegrationDefinition = {
  type:           string
  name:           string
  description:    string
  setupSteps:     string[]
  configFields:   ConfigField[]
  samplePayload:  SamplePayload
  externalDocsUrl: string
}

export const INTEGRATIONS_REGISTRY: IntegrationDefinition[] = [
  {
    type: 'discord',
    name: 'Discord',
    description: 'Send backup alerts to a Discord channel via an incoming webhook. Each alert appears as a rich embed with a severity color indicator.',
    setupSteps: [
      'Open your Discord server and go to Server Settings → Integrations → Webhooks.',
      'Click "New Webhook", choose the target text channel, and copy the Webhook URL.',
      'Paste the URL into the form below and save.',
    ],
    configFields: [
      { name: 'url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://discord.com/api/webhooks/…' },
    ],
    samplePayload: {
      title:  '[BackupOS] backup failed',
      body:   'Backup job "nightly-prod" failed: repository unreachable',
      footer: 'error · ' + new Date().toISOString().slice(0, 10),
    },
    externalDocsUrl: 'https://discord.com/developers/docs/resources/webhook',
  },
  {
    type: 'gotify',
    name: 'Gotify',
    description: 'Push backup alerts to your self-hosted Gotify server as push notifications. Priority scales with alert severity.',
    setupSteps: [
      'Self-host Gotify by following the quickstart at gotify.net.',
      'In the Gotify web UI, navigate to Apps and click the + button to create a new application.',
      'Copy the generated app token shown in the application list.',
      'Enter your Gotify server URL (e.g. https://gotify.example.com) and the app token below.',
    ],
    configFields: [
      { name: 'url',      label: 'Server URL', type: 'url',      required: true, placeholder: 'https://gotify.example.com' },
      { name: 'appToken', label: 'App token',  type: 'password', required: true, placeholder: 'Gotify application token' },
    ],
    samplePayload: {
      title: '[BackupOS] backup failed',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://gotify.net/docs/pushmsg',
  },
  {
    type: 'ntfy',
    name: 'ntfy',
    description: 'Deliver backup alerts to any ntfy topic — self-hosted or via ntfy.sh. Supports access-controlled topics via an Authorization header.',
    setupSteps: [
      'Self-host ntfy following docs.ntfy.sh/install, or use the public server at ntfy.sh (note: topics on ntfy.sh are public by default).',
      'Choose a topic name (e.g. my-backup-alerts). Topics are created on first publish.',
      'Subscribe to the topic in the ntfy app on your devices.',
      'If your server requires authentication, generate an access token in the ntfy web UI under Account → Access tokens, then format it as "Bearer <token>".',
      'Enter the server URL, topic, and optional Authorization header below.',
    ],
    configFields: [
      { name: 'url',   label: 'Server URL', type: 'url',      required: true,  placeholder: 'https://ntfy.sh' },
      { name: 'topic', label: 'Topic',      type: 'text',     required: true,  placeholder: 'my-backup-alerts' },
      { name: 'auth',  label: 'Authorization header', type: 'password', required: false, placeholder: 'Bearer tk_…', helpText: 'Leave blank for public topics.' },
    ],
    samplePayload: {
      title: 'BackupOS — backup failed',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://docs.ntfy.sh/publish/',
  },
  {
    type: 'pagerduty',
    name: 'PagerDuty',
    description: 'Trigger PagerDuty incidents from backup failures. Uses the Events API v2 to route alerts through your on-call schedules and escalation policies.',
    setupSteps: [
      'In PagerDuty, go to Services → Service Directory and open the service that should receive backup alerts (create one if needed).',
      'Click the Integrations tab, then "Add an integration".',
      'Search for "Events API v2" and click Add.',
      'Copy the Integration Key (also called the routing key) — it is a 32-character hex string.',
      'Paste the key into the field below.',
    ],
    configFields: [
      { name: 'integrationKey', label: 'Integration key', type: 'password', required: true, placeholder: 'Events API v2 routing key (32 chars)' },
    ],
    samplePayload: {
      title:  '[BackupOS] backup failed',
      body:   'Backup job "nightly-prod" failed: repository unreachable',
      footer: 'Source: backupos · Severity: error',
    },
    externalDocsUrl: 'https://developer.pagerduty.com/docs/events-api-v2/overview/',
  },
  {
    type: 'pushover',
    name: 'Pushover',
    description: 'Send backup alerts as Pushover push notifications to your phone or desktop. Alert priority maps to BackupOS severity levels.',
    setupSteps: [
      'Register at pushover.net and install the Pushover app on your devices.',
      'Go to pushover.net/apps/build and create a new application. Name it "BackupOS" and copy the API Token shown after creation.',
      'Your User Key is shown on your Pushover account dashboard.',
      'Enter both values below.',
    ],
    configFields: [
      { name: 'apiToken', label: 'API token',  type: 'password', required: true, placeholder: 'Pushover application API token' },
      { name: 'userKey',  label: 'User key',   type: 'password', required: true, placeholder: 'Your Pushover user or group key' },
    ],
    samplePayload: {
      title: '[BackupOS] backup failed',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://pushover.net/api',
  },
  {
    type: 'slack',
    name: 'Slack',
    description: 'Post backup alerts to a Slack channel using an incoming webhook. Messages use Block Kit formatting for scannable, structured alerts.',
    setupSteps: [
      'Go to api.slack.com/apps and click "Create New App" → "From scratch". Name the app and choose your workspace.',
      'Under Features in the left sidebar, click "Incoming Webhooks" and toggle it on.',
      'Click "Add New Webhook to Workspace", select the destination channel, and click Allow.',
      'Copy the generated Webhook URL — it starts with https://hooks.slack.com/services/…',
      'Paste the URL into the form below.',
    ],
    configFields: [
      { name: 'url', label: 'Webhook URL', type: 'url', required: true, placeholder: 'https://hooks.slack.com/services/…' },
    ],
    samplePayload: {
      title: '[BackupOS] backup failed',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://api.slack.com/messaging/webhooks',
  },
  {
    type: 'telegram',
    name: 'Telegram',
    description: 'Receive backup alerts as Telegram messages via a bot. Works with private chats, groups, and channels.',
    setupSteps: [
      'Open Telegram and search for @BotFather.',
      'Send /newbot and follow the prompts. BotFather will provide a bot token.',
      'Add the bot to the group or channel where you want alerts, or open a direct chat with it and send a message.',
      'Get the chat ID: forward a message from the target chat to @userinfobot, or call https://api.telegram.org/bot<TOKEN>/getUpdates after sending a message.',
      'Enter the bot token and chat ID below.',
    ],
    configFields: [
      { name: 'botToken', label: 'Bot token', type: 'password', required: true, placeholder: '1234567890:AABBCCDDEEFFaabbccddeeff…' },
      { name: 'chatId',   label: 'Chat ID',   type: 'text',     required: true, placeholder: '-100123456789 (group) or 123456789 (private)' },
    ],
    samplePayload: {
      title: '❌ backup failed',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://core.telegram.org/bots/api#sendmessage',
  },
  {
    type: 'webhook',
    name: 'Webhook',
    description: 'POST alert payloads as JSON to any HTTP endpoint. Useful for custom integrations, automation platforms like Zapier or n8n, or your own scripts.',
    setupSteps: [
      'Set up an HTTP endpoint that accepts POST requests with Content-Type: application/json.',
      'The request body includes: type, severity, message, timestamp, and a payload object with job or agent details.',
      'Respond with any 2xx status to acknowledge the delivery.',
      'Paste your endpoint URL into the form below.',
    ],
    configFields: [
      { name: 'url', label: 'Endpoint URL', type: 'url', required: true, placeholder: 'https://your-server.example.com/hook' },
    ],
    samplePayload: {
      title: 'POST /your-endpoint',
      body:  '{ "type": "backup_failed", "severity": "error", "message": "Backup job \\"nightly-prod\\" failed", "timestamp": "…" }',
    },
    externalDocsUrl: 'https://github.com/dariusvorster/backupos',
  },
  {
    type: 'zulip',
    name: 'Zulip',
    description: 'Post backup alerts to a Zulip stream using a bot. Supports full stream and topic routing.',
    setupSteps: [
      'In your Zulip organization, open your profile menu and go to Personal settings → Bots.',
      'Click "Add a new bot", choose type "Generic bot" or "Incoming webhook", and create it.',
      'Note the bot email address and API key shown in the bot list.',
      'Decide on a stream (channel) and optional topic where BackupOS alerts should appear.',
      'Enter your Zulip server URL, bot email, API key, and stream below.',
    ],
    configFields: [
      { name: 'url',    label: 'Zulip server URL', type: 'url',      required: true,  placeholder: 'https://your-org.zulipchat.com' },
      { name: 'email',  label: 'Bot email',        type: 'text',     required: true,  placeholder: 'backupos-bot@your-org.zulipchat.com' },
      { name: 'apiKey', label: 'Bot API key',      type: 'password', required: true,  placeholder: 'Zulip bot API key' },
      { name: 'stream', label: 'Stream',           type: 'text',     required: true,  placeholder: 'ops-alerts' },
      { name: 'topic',  label: 'Topic',            type: 'text',     required: false, placeholder: 'BackupOS alerts', helpText: 'Defaults to "[BackupOS] alerts" if blank.' },
    ],
    samplePayload: {
      title: '❌ ops-alerts / BackupOS alerts',
      body:  'Backup job "nightly-prod" failed: repository unreachable',
    },
    externalDocsUrl: 'https://zulip.com/api/send-message',
  },
]
