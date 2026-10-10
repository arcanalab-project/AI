export const DEMO_AS_OF = "2026-10-09";

export function computeAge(birthDate: string, asOf: string | Date = new Date()): number {
  const birth = new Date(`${birthDate}T00:00:00Z`);
  const now = typeof asOf === "string" ? new Date(`${asOf}T00:00:00Z`) : asOf;
  let age = now.getUTCFullYear() - birth.getUTCFullYear();
  const month = now.getUTCMonth() - birth.getUTCMonth();
  if (month < 0 || (month === 0 && now.getUTCDate() < birth.getUTCDate())) {
    age -= 1;
  }
  return age;
}
