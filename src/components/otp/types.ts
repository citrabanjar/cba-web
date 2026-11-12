// Antarmuka bersama 4 desain OTP asli dari galeri codexr (24, 67, 70, 28).
// Setiap desain menampilkan kartu OTP lengkap (judul, kotak angka, tautan kirim ulang) dan memutar animasinya sendiri.
// Halaman /onboarding memilih satu desain secara acak, memeriksa kode ke server, lalu menunggu onSuccessDone
// (dipanggil desain setelah animasi berhasil BENAR-BENAR selesai) sebelum membuka formulir.

export type OtpStatus = "idle" | "checking" | "success" | "error";

export type OtpDesignProps = {
  length: number; // jumlah kotak (6)
  value: string; // angka yang sudah diketik (hanya digit, maksimal `length`)
  onChange: (v: string) => void; // kirim string digit baru; induk memeriksa otomatis saat panjang = length
  status: OtpStatus; // checking = menunggu server; success = kode benar; error = kode salah (induk mengosongkan sesudah ±900 ms)
  email: string; // ditampilkan di subjudul
  message?: { tone: "info" | "error"; text: string } | null; // pesan dari server (mis. "Kode OTP salah.")
  resendPending?: boolean;
  onResend: () => void; // "Kirim ulang"
  onChangeContact: () => void; // "Ganti email / nomor"
  onSuccessDone: () => void; // panggil SEKALI ketika animasi berhasil sudah tuntas
};

// Teks bahasa Indonesia yang dipakai semua desain.
export const OTP_TEXT = {
  title: "Verifikasi Kode OTP",
  subtitle: (email: string) => `Kode 6 angka sudah dikirim ke ${email}. Kode diperiksa otomatis.`,
  noCode: "Tidak menerima kode?",
  resend: "Kirim ulang",
  changeContact: "Ganti email / nomor",
  checking: "Memeriksa kode…",
  successTitle: "Kode benar!",
  successSub: "Membuka formulir data calon karyawan…",
};
