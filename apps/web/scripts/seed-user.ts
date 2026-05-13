import { auth }          from '../lib/auth'
import { trustedSignup } from '../lib/signup-trust'

async function seed() {
  try {
    await trustedSignup.run({}, async () => {
      await auth.api.signUpEmail({
        body: {
          name:     'Admin',
          email:    'admin@backupos.local',
          password: 'changeme',
        },
      })
    })
    console.log('Default user created: admin@backupos.local / changeme')
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('already exists') || msg.includes('UNIQUE') || msg.toLowerCase().includes('already registered')) {
      console.log('User already exists — skipping seed.')
    } else {
      console.error('Seed failed:', msg)
      process.exit(1)
    }
  }
}

seed()
