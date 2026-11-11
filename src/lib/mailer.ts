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
