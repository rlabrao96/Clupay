import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

export async function sendEmail(
  to: string,
  subject: string,
  html: string
): Promise<{ success: boolean; error?: string }> {
  const from = process.env.SMTP_FROM || `CluPay <${process.env.SMTP_USER}>`;

  try {
    await transporter.sendMail({ from, to, subject, html });
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("SMTP error:", message);
    return { success: false, error: message };
  }
}
