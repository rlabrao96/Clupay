export function cleanRut(rut: string): string {
  return rut.replace(/[\.\-\s]/g, "").toUpperCase();
}

export function validateRut(rut: string): boolean {
  const cleaned = cleanRut(rut);

  if (cleaned.length < 7 || cleaned.length > 9) {
    return false;
  }

  const body = cleaned.slice(0, -1);
  const providedDigit = cleaned.slice(-1);

  if (!/^\d+$/.test(body)) {
    return false;
  }

  const expectedDigit = calculateVerificationDigit(body);
  return providedDigit === expectedDigit;
}

function calculateVerificationDigit(body: string): string {
  let sum = 0;
  let multiplier = 2;

  for (let i = body.length - 1; i >= 0; i--) {
    sum += parseInt(body[i], 10) * multiplier;
    multiplier = multiplier === 7 ? 2 : multiplier + 1;
  }

  const remainder = 11 - (sum % 11);

  if (remainder === 11) return "0";
  if (remainder === 10) return "K";
  return remainder.toString();
}

export function formatRut(rut: string): string {
  const cleaned = cleanRut(rut);

  if (cleaned.length < 2) return cleaned;

  const body = cleaned.slice(0, -1);
  const digit = cleaned.slice(-1);

  const formatted = body.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  return `${formatted}-${digit}`;
}
