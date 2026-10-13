import "server-only";
import { Resend } from "resend";

function getResendClient(): Resend {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error("RESEND_API_KEY is not set.");
  }
  return new Resend(apiKey);
}

/**
 * Sends the password reset email. Uses Resend's shared sandbox sender
 * (onboarding@resend.dev) for now — this only delivers to the email address
 * verified on the Resend account. Swap to a verified domain sender before
 * this needs to reach real users.
 */
export async function sendPasswordResetEmail(
  to: string,
  resetUrl: string,
): Promise<void> {
  const resend = getResendClient();
  const { error } = await resend.emails.send({
    from: "Lingua Lab <noreply@mail.routelapps.com.ng>",
    to,
    subject: "Reset your Lingua Lab password",
    html: `
      <p>Someone requested a password reset for this email address.</p>
      <p><a href="${resetUrl}">Click here to reset your password</a></p>
      <p>This link expires in 1 hour. If you didn't request this, you can safely ignore this email.</p>
    `,
  });

  if (error) {
    throw new Error(`Failed to send password reset email: ${error.message}`);
  }
}