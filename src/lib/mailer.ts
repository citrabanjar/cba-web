// Kirim email dari admin@citrabanjar.com (Google Workspace). Belum tersambung: pemilik akan
// membuat App Password lalu mengisi SMTP_USER dan SMTP_PASS di Vercel. Selama belum ada,
// fungsi ini mengembalikan false dan kode OTP ditampilkan ke HRD di menu Onboarding untuk
// diteruskan ke calon karyawan.
export const mailerReady = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

export async function sendOtpEmail(to: string, name: string, code: string): Promise<boolean> {
  if (!mailerReady()) {
    if (process.env.NODE_ENV !== "production") console.log(`[onboarding] OTP untuk ${name} <${to}>: ${code}`);
    return false;
  }
  // Pengiriman SMTP dipasang saat koneksi Google Workspace dibuat.
  return false;
}
