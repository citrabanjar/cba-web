import { createHmac, randomInt, timingSafeEqual } from "crypto";
import { cookies } from "next/headers";

// Sesi calon karyawan (terpisah dari login portal): cookie bertanda tangan berisi id calon dan
// waktu berakhir. OTP 6 angka berlaku 10 menit, maksimal 5 kali salah.
const COOKIE = "cba_onboarding";
const HOURS = 12;
export const OTP_MINUTES = 10;
export const OTP_MAX_TRIES = 5;

const secret = () => process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET || "cba-onboarding-dev";
const sign = (text: string) => createHmac("sha256", secret()).update(text).digest("base64url");

export const newOtp = () => String(randomInt(0, 1_000_000)).padStart(6, "0");

export async function setCandidateSession(candidateId: string) {
  const exp = Date.now() + HOURS * 3_600_000;
  const value = `${candidateId}.${exp}`;
  (await cookies()).set(COOKIE, `${value}.${sign(value)}`, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/onboarding", maxAge: HOURS * 3600,
  });
}

export async function getCandidateSession(): Promise<string | null> {
  const raw = (await cookies()).get(COOKIE)?.value;
  if (!raw) return null;
  const [id, exp, mac] = raw.split(".");
  if (!id || !exp || !mac) return null;
  const expected = Buffer.from(sign(`${id}.${exp}`));
  const given = Buffer.from(mac);
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;
  if (Number(exp) < Date.now()) return null;
  return id;
}

export async function clearCandidateSession() {
  (await cookies()).set(COOKIE, "", { path: "/onboarding", maxAge: 0 });
}
