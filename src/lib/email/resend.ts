import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

const DEFAULT_FROM = "CluPay <onboarding@resend.dev>";

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.RESEND_FROM_EMAIL || DEFAULT_FROM;

  const { error } = await resend.emails.send({ from, to, subject, html });

  if (error) {
    console.error("Resend error:", error);
    return { success: false, error: error.message };
  }

  return { success: true };
}
