import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readApproval, stepCandidates } from "@/lib/onboarding-interview";

// Lampiran reimbursement: pemilik, atasan langsungnya, penyetuju Workflow-nya, dan Admin / Super Admin.
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  const me = session?.user;
  if (!me?.id) return new Response(null, { status: 401 });
  const { id } = await params;
  const file = await prisma.medicalClaimFile.findUnique({
    where: { id },
    select: { mime: true, name: true, data: true, claim: { select: { userId: true, approval: true, user: { select: { managerId: true } } } } },
  });
  if (!file) return new Response(null, { status: 404 });
  const c = file.claim;
  const allowed = c.userId === me.id || me.role === "ADMIN" || me.role === "SUPER_ADMIN" || c.user.managerId === me.id
    || !!readApproval(c.approval)?.steps.some((s) => stepCandidates(s).includes(me.id!));
  if (!allowed) return new Response(null, { status: 403 });
  return new Response(new Uint8Array(file.data), {
    headers: {
      "Content-Type": file.mime,
      "Content-Disposition": `inline; filename="${encodeURIComponent(file.name)}"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
