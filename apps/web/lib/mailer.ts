import nodemailer from 'nodemailer'

interface InviteEmailOpts {
  to:          string
  inviterName: string
  link:        string
}

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

export async function sendInviteEmail(opts: InviteEmailOpts): Promise<void> {
  const host = process.env['SMTP_HOST']
  if (!host) return // SMTP not configured — skip silently

  const transporter = nodemailer.createTransport({
    host,
    port:   Number(process.env['SMTP_PORT'] ?? 587),
    secure: Number(process.env['SMTP_PORT'] ?? 587) === 465,
    auth: {
      user: process.env['SMTP_USER'],
      pass: process.env['SMTP_PASS'],
    },
  })

  const from = process.env['SMTP_FROM'] ?? `BackupOS <noreply@backupos.dev>`

  try {
    await transporter.sendMail({
      from,
      to:      opts.to,
      subject: `${opts.inviterName} invited you to BackupOS`,
      html: `
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;background:#0E0E0E;font-family:system-ui,sans-serif">
  <div style="max-width:480px;margin:40px auto;background:#1A1A1A;border:1px solid #2A2A2A;border-radius:12px;overflow:hidden">
    <div style="padding:32px 32px 24px">
      <div style="display:flex;align-items:center;gap:10px;margin-bottom:28px">
        <svg width="32" height="32" viewBox="0 0 48 48" fill="none">
          <rect width="48" height="48" rx="12" fill="#1A1206"/>
          <rect x="4" y="4" width="19" height="19" fill="#F5A623"/>
          <rect x="25" y="4" width="19" height="19" fill="#854F0B"/>
          <rect x="4" y="25" width="19" height="19" fill="#854F0B"/>
          <rect x="25" y="25" width="19" height="19" fill="#C77A14"/>
          <rect x="19" y="19" width="10" height="10" fill="#FEF5E0"/>
        </svg>
        <span style="color:#F5F5F5;font-size:16px;font-weight:600">BackupOS</span>
      </div>
      <h1 style="color:#F5F5F5;font-size:20px;font-weight:700;margin:0 0 8px">You've been invited</h1>
      <p style="color:#A3A3A3;font-size:14px;margin:0 0 28px">
        <strong style="color:#F5F5F5">${escHtml(opts.inviterName)}</strong> invited you to join BackupOS.
      </p>
      <a href="${escHtml(opts.link)}"
         style="display:inline-block;padding:10px 24px;background:#F5A623;color:#000;font-size:14px;font-weight:600;border-radius:6px;text-decoration:none">
        Accept invitation
      </a>
      <p style="color:#6B6B6B;font-size:12px;margin:24px 0 0">
        This link expires in 7 days. If you didn't expect this invitation, ignore this email.
      </p>
    </div>
  </div>
</body>
</html>`,
    })
  } catch (err) {
    throw new Error(`Failed to send invite email: ${err instanceof Error ? err.message : String(err)}`)
  }
}
