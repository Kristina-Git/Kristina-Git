import nodemailer, { Transporter } from "nodemailer";

const FROM = process.env.SMTP_FROM ?? "no-reply@example.com";
const APP_NAME = "Cayman Trade Order System";

let transporter: Transporter | null | undefined; // undefined = not yet checked, null = not configured

function getTransporter(): Transporter | null {
  if (transporter !== undefined) return transporter;

  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;
  if (!SMTP_HOST || !SMTP_PORT || !SMTP_USER || !SMTP_PASS) {
    transporter = null;
    return transporter;
  }

  transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: Number(SMTP_PORT),
    secure: Number(SMTP_PORT) === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
  });
  return transporter;
}

/** True only when SMTP_HOST/PORT/USER/PASS are all set. When false, callers should surface
 * the link/content for manual sending instead of silently failing. */
export function isEmailConfigured(): boolean {
  return getTransporter() !== null;
}

export interface EmailResult {
  sent: boolean;
  error?: string;
}

export async function sendInviteEmail(toEmail: string, fullName: string, inviteUrl: string): Promise<EmailResult> {
  const t = getTransporter();
  if (!t) return { sent: false, error: "Email is not configured (SMTP_HOST/PORT/USER/PASS not set)" };

  try {
    await t.sendMail({
      from: FROM,
      to: toEmail,
      subject: `Set up your ${APP_NAME} account`,
      text: `Hi ${fullName},\n\nAn account has been created for you on ${APP_NAME}. Set your password to activate it:\n${inviteUrl}\n\nThis link expires in 7 days and can only be used once.\n\nIf you weren't expecting this, you can ignore this email.`,
      html: `<p>Hi ${fullName},</p><p>An account has been created for you on ${APP_NAME}. Set your password to activate it:</p><p><a href="${inviteUrl}">${inviteUrl}</a></p><p>This link expires in 7 days and can only be used once.</p><p>If you weren't expecting this, you can ignore this email.</p>`,
    });
    return { sent: true };
  } catch (err) {
    return { sent: false, error: err instanceof Error ? err.message : "Failed to send email" };
  }
}
