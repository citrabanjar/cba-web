"use server";

import { signIn, signOut } from "@/auth";
import { AuthError } from "next-auth";
import { redirect } from "next/navigation";

export async function loginAction(_prevState: unknown, formData: FormData) {
  const login = formData.get("login") as string;
  const password = formData.get("password") as string;

  try {
    await signIn("credentials", {
      login,
      password,
      redirectTo: "/portal/dashboard",
    });
  } catch (err) {
    if (err instanceof AuthError) {
      switch (err.type) {
        case "CredentialsSignin":
          return { error: "ID karyawan atau password salah." };
        default:
          return { error: "Terjadi kesalahan. Coba lagi." };
      }
    }
    throw err;
  }
}

export async function logoutAction() {
  await signOut({ redirectTo: "/portal" });
}
