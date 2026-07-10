/**
 * Minimal transactional email via the Resend HTTP API (no SMTP needed).
 * Gated on RESEND_API_KEY: when it's absent (e.g. before the key is added),
 * sendEmail logs and returns false instead of throwing, so the reset flow
 * still functions in development without leaking the code to the client.
 */

const RESEND_ENDPOINT = 'https://api.resend.com/emails';

export async function sendEmail(opts: { to: string; subject: string; html: string }): Promise<boolean> {
  const key = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM || 'Vantage <onboarding@resend.dev>';
  if (!key) {
    // No provider configured yet - do not fail the request.
    console.warn(`[mailer] RESEND_API_KEY not set; would email ${opts.to}: ${opts.subject}`);
    return false;
  }
  try {
    const res = await fetch(RESEND_ENDPOINT, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from, to: [opts.to], subject: opts.subject, html: opts.html }),
    });
    if (!res.ok) {
      console.error('[mailer] send failed', res.status, await res.text());
      return false;
    }
    return true;
  } catch (e) {
    console.error('[mailer] send error', e);
    return false;
  }
}

export function resetCodeEmailHtml(code: string): string {
  return `<!doctype html><html><body style="font-family:-apple-system,Helvetica,Arial,sans-serif;background:#F4F5EF;padding:32px;">
    <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #EBEDE3;">
      <div style="background:linear-gradient(135deg,#16A34A,#22C55E);padding:24px 28px;color:#fff;">
        <div style="font-size:13px;letter-spacing:1.2px;text-transform:uppercase;opacity:.9;">Vantage</div>
        <div style="font-size:22px;font-weight:800;margin-top:4px;">Reset your password</div>
      </div>
      <div style="padding:28px;">
        <p style="color:#5C665F;font-size:14px;margin:0 0 16px;">Enter this code in the app to set a new password. It expires in 15 minutes.</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#171C19;text-align:center;background:#F4F5EF;border-radius:12px;padding:18px;">${code}</div>
        <p style="color:#939C94;font-size:12px;margin:18px 0 0;">If you did not request this, you can safely ignore this email.</p>
      </div>
    </div>
  </body></html>`;
}
