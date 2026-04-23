import { redirect } from 'next/navigation'
import { getCurrentUser } from '@/lib/user'
import { getDb, instanceSettings } from '@backupos/db'
import { saveInstanceSettings } from '@/app/actions/settings'

const TIMEZONE_GROUPS: { label: string; zones: string[] }[] = [
  { label: 'UTC', zones: ['UTC'] },
  { label: 'Americas', zones: [
    'America/New_York', 'America/Toronto', 'America/Chicago', 'America/Denver',
    'America/Phoenix', 'America/Los_Angeles', 'America/Vancouver', 'America/Anchorage',
    'America/Honolulu', 'America/Mexico_City', 'America/Bogota', 'America/Lima',
    'America/Caracas', 'America/Santiago', 'America/Sao_Paulo', 'America/Argentina/Buenos_Aires',
    'America/Montevideo',
  ]},
  { label: 'Europe', zones: [
    'Europe/London', 'Europe/Dublin', 'Europe/Lisbon', 'Europe/Paris', 'Europe/Brussels',
    'Europe/Amsterdam', 'Europe/Berlin', 'Europe/Zurich', 'Europe/Madrid', 'Europe/Rome',
    'Europe/Stockholm', 'Europe/Oslo', 'Europe/Copenhagen', 'Europe/Warsaw', 'Europe/Prague',
    'Europe/Vienna', 'Europe/Budapest', 'Europe/Bucharest', 'Europe/Athens', 'Europe/Helsinki',
    'Europe/Riga', 'Europe/Tallinn', 'Europe/Vilnius', 'Europe/Kiev', 'Europe/Istanbul',
    'Europe/Moscow', 'Europe/Samara', 'Europe/Yekaterinburg',
  ]},
  { label: 'Africa', zones: [
    'Africa/Casablanca', 'Africa/Abidjan', 'Africa/Accra', 'Africa/Lagos',
    'Africa/Tunis', 'Africa/Cairo', 'Africa/Nairobi', 'Africa/Dar_es_Salaam',
    'Africa/Johannesburg', 'Africa/Harare', 'Africa/Lusaka',
  ]},
  { label: 'Middle East', zones: [
    'Asia/Jerusalem', 'Asia/Beirut', 'Asia/Damascus', 'Asia/Baghdad',
    'Asia/Kuwait', 'Asia/Riyadh', 'Asia/Qatar', 'Asia/Tehran', 'Asia/Dubai', 'Asia/Muscat',
  ]},
  { label: 'Asia', zones: [
    'Asia/Karachi', 'Asia/Tashkent', 'Asia/Kolkata', 'Asia/Colombo', 'Asia/Dhaka',
    'Asia/Almaty', 'Asia/Bangkok', 'Asia/Ho_Chi_Minh', 'Asia/Jakarta',
    'Asia/Kuala_Lumpur', 'Asia/Singapore', 'Asia/Manila', 'Asia/Taipei',
    'Asia/Hong_Kong', 'Asia/Shanghai', 'Asia/Seoul', 'Asia/Tokyo',
    'Asia/Yakutsk', 'Asia/Vladivostok',
  ]},
  { label: 'Pacific', zones: [
    'Australia/Perth', 'Australia/Darwin', 'Australia/Brisbane', 'Australia/Adelaide',
    'Australia/Sydney', 'Australia/Melbourne', 'Pacific/Auckland', 'Pacific/Fiji',
    'Pacific/Guam', 'Pacific/Samoa',
  ]},
]

const LANGUAGES = [
  { value: 'en', label: 'English' },
  { value: 'de', label: 'Deutsch' },
  { value: 'fr', label: 'Français' },
  { value: 'es', label: 'Español' },
  { value: 'pt', label: 'Português' },
]

const DATE_FORMATS = ['YYYY-MM-DD','DD/MM/YYYY','MM/DD/YYYY','DD.MM.YYYY']

function utcOffset(tz: string): string {
  if (tz === 'UTC') return 'UTC+0'
  try {
    const parts = new Intl.DateTimeFormat('en', { timeZone: tz, timeZoneName: 'shortOffset' }).formatToParts(new Date())
    return parts.find(p => p.type === 'timeZoneName')?.value ?? ''
  } catch { return '' }
}

export default async function GeneralSettingsPage({ searchParams }: { searchParams: Promise<{ saved?: string }> }) {
  const user = await getCurrentUser()
  if (!user) redirect('/login')

  const { saved } = await searchParams
  const db = getDb()
  const [cfg] = await db.select().from(instanceSettings).limit(1).all()

  const inputStyle: React.CSSProperties = {
    width: '100%', padding: '8px 12px', fontSize: 13,
    backgroundColor: 'var(--surf2)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-sm)', color: 'var(--fg)',
    outline: 'none', boxSizing: 'border-box',
  }
  const labelStyle: React.CSSProperties = { display: 'block', fontSize: 12, fontWeight: 500, color: 'var(--fg-mute)', marginBottom: 4 }
  const fieldStyle: React.CSSProperties = { marginBottom: 16 }

  return (
    <div style={{ maxWidth: 580 }}>
      <a href="/settings" style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 13, color: 'var(--fg-dim)', textDecoration: 'none', marginBottom: 24 }}>← Settings</a>
      <h1 style={{ fontSize: 20, fontWeight: 700, color: 'var(--fg)', marginBottom: 4 }}>General</h1>
      <p style={{ fontSize: 13, color: 'var(--fg-dim)', marginBottom: 24 }}>Instance name and locale preferences.</p>

      {saved === '1' && (
        <div style={{ padding: '10px 16px', marginBottom: 20, backgroundColor: 'var(--ok-dim)', border: '1px solid color-mix(in srgb, var(--ok) 30%, transparent)', borderRadius: 'var(--radius-sm)', fontSize: 13, color: 'var(--ok)' }}>
          Settings saved.
        </div>
      )}

      <form action={saveInstanceSettings}>
        <div style={{ backgroundColor: 'var(--surf)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', padding: '20px 24px', marginBottom: 16 }}>
          <div style={fieldStyle}>
            <label style={labelStyle}>Instance name</label>
            <input name="instanceName" type="text" defaultValue={cfg?.instanceName ?? 'BackupOS'} style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--fg-faint)', marginTop: 4 }}>Shown in the browser tab and emails.</div>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Time zone</label>
            <select name="timezone" defaultValue={cfg?.timezone ?? 'UTC'} style={inputStyle}>
              {TIMEZONE_GROUPS.map(g => (
                <optgroup key={g.label} label={g.label}>
                  {g.zones.map(tz => <option key={tz} value={tz}>{tz} ({utcOffset(tz)})</option>)}
                </optgroup>
              ))}
            </select>
          </div>
          <div style={fieldStyle}>
            <label style={labelStyle}>Language</label>
            <select name="language" defaultValue={cfg?.language ?? 'en'} style={inputStyle}>
              {LANGUAGES.map(l => <option key={l.value} value={l.value}>{l.label}</option>)}
            </select>
          </div>
          <div style={{ marginBottom: 0 }}>
            <label style={labelStyle}>Date format</label>
            <select name="dateFormat" defaultValue={cfg?.dateFormat ?? 'YYYY-MM-DD'} style={inputStyle}>
              {DATE_FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
            </select>
          </div>
        </div>
        <button type="submit" style={{ padding: '8px 20px', backgroundColor: 'var(--accent)', color: 'var(--accent-fg)', border: 'none', borderRadius: 'var(--radius-sm)', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
          Save changes
        </button>
      </form>
    </div>
  )
}
