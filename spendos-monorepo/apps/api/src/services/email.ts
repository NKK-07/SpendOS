import { Resend } from 'resend';

const resend = new Resend(process.env.EMAIL_API_KEY || 're_mock12345');
const FROM_EMAIL = process.env.EMAIL_FROM || 'finance@spendos.com';

export async function sendEmail({ to, subject, html }: { to: string; subject: string; html: string }) {
  // In development/test mode without a valid API key, just log the email.
  if (!process.env.EMAIL_API_KEY || process.env.EMAIL_API_KEY.startsWith('re_mock')) {
    console.log(`\n[MOCK EMAIL SENT]`);
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`Body (HTML):\n${html}\n`);
    return { id: 'mock-email-id' };
  }

  try {
    const data = await resend.emails.send({
      from: FROM_EMAIL,
      to,
      subject,
      html,
    });
    return data;
  } catch (error) {
    console.error('Email sending failed:', error);
    throw error;
  }
}
