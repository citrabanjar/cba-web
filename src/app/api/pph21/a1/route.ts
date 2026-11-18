import { auth } from "@/auth";
import { getAccess } from "@/lib/access";
import { hasMenu } from "@/lib/roles";
import { build1721A1 } from "@/lib/form1721a1";
import { build1721A1Pdf } from "@/lib/a1-pdf";

export const dynamic = "force-dynamic";

// PDF 1721-A1: /api/pph21/a1?tahun=2026[&user=<id>]. Tanpa user = milik sendiri (hanya tahun yang sudah final,
// sama seperti menu PPh 21). Dengan user = preview Admin (akses Data Karyawan / Gaji), boleh sebelum akhir tahun
// selama sudah ada Proses Gaji final (ditandai SEMENTARA).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return new Response("Unauthorized", { status: 401 });
  const url = new URL(req.url);
  const year = Number(url.searchParams.get("tahun"));
  if (!Number.isInteger(year) || year < 2020 || year > 2100) return new Response("Tahun tidak valid", { status: 400 });
  const target = url.searchParams.get("user");
  let userId = session.user.id, provisional = false;
  if (target && target !== session.user.id) {
    const access = await getAccess();
    if (!access || !(hasMenu(access, "karyawan") || hasMenu(access, "gaji"))) return new Response("Forbidden", { status: 403 });
    userId = target; provisional = true;
  }
  const form = await build1721A1(userId, year, { provisional });
  if (!form) return new Response("Bukti potong belum tersedia untuk tahun ini.", { status: 404 });
  const bytes = await build1721A1Pdf(form);
  const name = `1721-A1_${(form.employee.employeeId ?? "karyawan").replace(/[^\w-]/g, "")}_${year}.pdf`;
  return new Response(Buffer.from(bytes), {
    headers: { "Content-Type": "application/pdf", "Content-Disposition": `${url.searchParams.get("unduh") ? "attachment" : "inline"}; filename="${name}"`, "Cache-Control": "no-store" },
  });
}
