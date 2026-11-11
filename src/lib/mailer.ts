import nodemailer from "nodemailer";

// Kirim email dari akun Google Workspace perusahaan (mis. admin@citrabanjar.com) lewat SMTP Gmail.
// Pemilik mengisi SMTP_USER (alamat email) dan SMTP_PASS (App Password Google, 16 huruf) di Vercel.
// Selama belum diisi, mailerReady() = false dan kode OTP ditampilkan ke HRD di menu Onboarding
// untuk diteruskan ke calon karyawan.
export const mailerReady = () => !!(process.env.SMTP_USER && process.env.SMTP_PASS);

let transport: nodemailer.Transporter | null = null;
function mailer() {
  transport ??= nodemailer.createTransport({
    host: process.env.SMTP_HOST || "smtp.gmail.com",
    port: Number(process.env.SMTP_PORT || 465),
    secure: Number(process.env.SMTP_PORT || 465) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS?.replace(/\s/g, "") },
  });
  return transport;
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export async function sendOtpEmail(to: string, name: string, code: string): Promise<boolean> {
  if (!mailerReady()) {
    if (process.env.NODE_ENV !== "production") console.log(`[onboarding] OTP untuk ${name} <${to}>: ${code}`);
    return false;
  }
  try {
    await mailer().sendMail({
      from: { name: "HRD PT. Citra Banjar Abadi", address: process.env.SMTP_FROM || process.env.SMTP_USER! },
      to,
      subject: `Kode OTP Onboarding: ${code}`,
      text: `Halo ${name},\n\nKode OTP untuk mengisi data calon karyawan PT. Citra Banjar Abadi: ${code}\nKode berlaku 10 menit. Jangan berikan kode ini kepada siapa pun.\n\nHRD PT. Citra Banjar Abadi`,
      html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:auto;color:#1f2937">
        <h2 style="color:#BE353F;margin-bottom:4px">PT. Citra Banjar Abadi</h2>
        <p>Halo <b>${esc(name)}</b>,</p>
        <p>Kode OTP untuk mengisi data calon karyawan:</p>
        <p style="font-size:32px;font-weight:bold;letter-spacing:8px;background:#f3f4f6;padding:16px;text-align:center;border-radius:12px">${esc(code)}</p>
        <p style="font-size:13px;color:#6b7280">Kode berlaku 10 menit. Jangan berikan kode ini kepada siapa pun, termasuk yang mengaku dari HRD.</p>
        <p style="font-size:13px;color:#6b7280">HRD PT. Citra Banjar Abadi</p>
      </div>`,
    });
    return true;
  } catch (e) {
    console.error("[mailer] gagal kirim OTP:", e instanceof Error ? e.message : e);
    return false;
  }
}

// Email undangan calon karyawan: tombol menuju halaman onboarding (email sudah terisi).
export async function sendInviteEmail(to: string, name: string, link: string): Promise<boolean> {
  if (!mailerReady()) return false;
  try {
    await mailer().sendMail({
      from: { name: "HRD PT. Citra Banjar Abadi", address: process.env.SMTP_FROM || process.env.SMTP_USER! },
      to,
      subject: "Undangan melengkapi data calon karyawan PT. Citra Banjar Abadi",
      text: `Halo ${name},\n\nAnda diminta melengkapi data calon karyawan PT. Citra Banjar Abadi.\nBuka tautan berikut: ${link}\nMasuk dengan email ini dan nomor HP yang Anda berikan ke HRD. Kode OTP akan dikirim ke email ini.\n\nHRD PT. Citra Banjar Abadi`,
      html: `<div style="font-family:Arial,sans-serif;max-width:520px;margin:auto;color:#1f2937">
        <h2 style="color:#BE353F;margin-bottom:4px">PT. Citra Banjar Abadi</h2>
        <p>Halo <b>${esc(name)}</b>,</p>
        <p>Selamat! Anda diminta melengkapi <b>data calon karyawan</b> PT. Citra Banjar Abadi: data diri, alamat, keluarga, rekening, dan pajak.</p>
        <p style="text-align:center;margin:28px 0"><a href="${esc(link)}" style="background:#BE353F;color:#fff;text-decoration:none;padding:14px 28px;border-radius:12px;font-weight:bold;display:inline-block">Isi Data Calon Karyawan</a></p>
        <p style="font-size:13px;color:#6b7280">Masuk dengan <b>email ini</b> dan <b>nomor HP</b> yang Anda berikan ke HRD. Kode OTP akan dikirim ke email ini setiap kali masuk.</p>
        <p style="font-size:13px;color:#6b7280">Kalau tombol tidak bisa diklik, salin alamat ini ke browser: ${esc(link)}</p>
        <p style="font-size:13px;color:#6b7280">HRD PT. Citra Banjar Abadi</p>
      </div>`,
    });
    return true;
  } catch (e) {
    console.error("[mailer] gagal kirim undangan:", e instanceof Error ? e.message : e);
    return false;
  }
}
