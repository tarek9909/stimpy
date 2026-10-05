/** Masking for logs: never log full phone numbers or e-mail addresses. */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  return digits.length <= 3 ? '***' : `***${digits.slice(-3)}`;
}

export function maskEmail(email: string): string {
  const at = email.lastIndexOf('@');
  return at < 0 ? '***' : `***${email.slice(at)}`;
}

/** Best-effort scrub of free text (error messages, stacks) so a stray phone number or e-mail never reaches the logs. */
export function scrubText(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+(\.[\w-]+)+/g, (m) => maskEmail(m))
    .replace(/\+?\d[\d\s\-()]{6,}\d/g, (m) => maskPhone(m));
}
