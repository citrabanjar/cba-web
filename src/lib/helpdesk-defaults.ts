// Artikel SOP bawaan Help Desk, disusun dari aturan yang berlaku di portal. Admin dapat memuatnya sekali
// (tombol "Muat Artikel SOP Bawaan"), lalu mengubah atau menambah sesuai kebijakan perusahaan.
export const DEFAULT_HELP_ARTICLES: { title: string; keywords: string; body: string }[] = [
  {
    title: "Cara mengajukan cuti",
    keywords: "cuti, ajukan cuti, pengajuan cuti, cuti tahunan, delegasi, saldo cuti",
    body: "1. Buka menu Cuti (Tombol HP → Cuti), lalu pilih Ajukan Cuti.\n2. Pilih jenis cuti, tanggal, dan alasan. Untuk Cuti Tahunan, tunjuk rekan sebagai delegasi tanggung jawab.\n3. Pengajuan diputus oleh atasan langsung atau penyetuju sesuai Workflow perusahaan. Status pengajuan dapat dipantau di menu Cuti dan di Notifikasi.\n4. Hari cuti dihitung berdasarkan hari kerja pada jadwal Anda; pengajuan yang melebihi saldo dihitung sebagai cuti di luar tanggungan.",
  },
  {
    title: "Tidak masuk kerja karena sakit atau izin",
    keywords: "sakit, izin, tidak masuk, absen sakit, surat dokter, alpha, mangkir",
    body: "Ajukan melalui menu Kehadiran → Ajukan Tidak Masuk, lalu pilih Sakit atau Izin dan lampirkan bukti bila diminta (misalnya surat keterangan dokter).\nHari kerja tanpa absen dan tanpa cuti, izin, sakit, atau dinas yang disetujui dicatat sebagai Alpha (mangkir) dan dapat memengaruhi gaji.",
  },
  {
    title: "Aturan absen masuk dan pulang",
    keywords: "absen, absensi, check in, check-in, check out, check-out, terlambat, lokasi absen, gps, lupa absen, lupa check-out, batas absen",
    body: "1. Absen dilakukan melalui menu Absensi dengan GPS aktif dan berada di dalam radius lokasi absen yang ditetapkan.\n2. Absen masuk dibuka beberapa menit sebelum jam masuk shift sesuai pengaturan shift. Absen yang sangat terlambat atau pulang jauh lebih awal akan menampilkan peringatan potongan gaji; gunakan cuti setengah hari sebagai alternatif.\n3. Absen pulang ditutup beberapa menit setelah jam pulang shift (atau jam akhir SPL). Bila lupa check-in / check-out atau batas absen terlewat, ajukan melalui menu Lupa Absen; setelah disetujui atasan, jam absen langsung tercatat.\n4. Check-out yang belum selesai harus diajukan melalui Lupa Absen sebelum dapat check-in di hari berikutnya.",
  },
  {
    title: "Lembur dan Surat Perintah Lembur (SPL)",
    keywords: "lembur, spl, surat perintah lembur, jam lembur, bersedia, istirahat lembur, upah lembur, cek fisik",
    body: "1. Bila perusahaan memakai SPL, Admin Lembur menerbitkan SPL dan Anda menjawab Bersedia atau Tidak bersedia melalui Notifikasi. Bila tidak memakai SPL, ajukan lembur melalui menu Lembur.\n2. Istirahat lembur: hari kerja 18.00–19.00; hari libur 12.00–13.00 dan 18.00–19.00. Istirahat hanya dipotong bila seluruhnya tercakup dalam jam lembur.\n3. Lembur dibayar per 1 jam penuh sampai absen pulang. Selama lembur, security dapat melakukan cek fisik keberadaan Anda.",
  },
  {
    title: "Mengajukan dinas luar",
    keywords: "dinas, dinas luar, perjalanan dinas, tugas luar kota",
    body: "Ajukan melalui menu Dinas Luar (Tombol HP → Dinas Luar) dengan mengisi tujuan, tanggal, dan keperluan. Pengajuan diputus oleh atasan langsung atau penyetuju sesuai Workflow. Selama dinas luar, absen dapat dilakukan di luar lokasi absen dan lembur tidak dapat diajukan pada tanggal yang sama.",
  },
  {
    title: "Tukar shift dengan rekan",
    keywords: "tukar shift, ganti shift, tukar jadwal, shift",
    body: "1. Buka menu Tukar Shift, pilih tanggal dan rekan yang akan bertukar, lalu kirim pengajuan.\n2. Rekan menerima atau menolak permintaan terlebih dahulu.\n3. Setelah diterima rekan, pengajuan diputus oleh atasan langsung kedua karyawan. Jadwal berubah setelah disetujui.",
  },
  {
    title: "Pengajuan pinjaman karyawan",
    keywords: "pinjaman, kasbon, pinjam uang, angsuran, cicilan",
    body: "1. Ajukan melalui menu Pinjaman dengan mengisi jumlah, tenor, dan keperluan.\n2. Alur persetujuan: atasan langsung → pemeriksaan dokumen oleh Admin → keputusan pimpinan.\n3. Angsuran mulai dipotong dari gaji setelah pinjaman dicairkan. Sisa pinjaman dapat dilihat di menu Pinjaman.",
  },
  {
    title: "Slip gaji dan bukti potong PPh 21",
    keywords: "slip gaji, gaji, payslip, pph 21, pph21, pajak, bukti potong, 1721",
    body: "Slip gaji tersedia di menu Slip Gaji setelah proses gaji periode tersebut difinalkan oleh Admin Payroll. Bukti potong PPh 21 tahunan (1721-A1) tersedia di menu PPh 21 setelah tahun pajak berakhir.",
  },
  {
    title: "Lupa password atau aktivasi akun",
    keywords: "password, lupa password, kata sandi, aktivasi, tidak bisa login, login, otp",
    body: "Buka halaman masuk portal, klik \"Aktivasi akun / lupa password?\", masukkan Employee ID atau email, lalu masukkan kode OTP yang dikirim ke email Anda dan buat password baru. Bila email Anda tidak menerima kode, hubungi Admin HRD.",
  },
  {
    title: "Mengubah data diri",
    keywords: "ubah data, data diri, alamat, rekening, nomor hp, profil, perubahan data, keluarga",
    body: "Buka Profil Saya, pilih data yang akan diubah, lalu ajukan perubahan. Data baru berlaku setelah disetujui Admin HRD.",
  },
];
