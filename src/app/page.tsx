"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";

export default function Home() {
  const router = useRouter();
  const supabase = createClient();

  useEffect(() => {
    async function redirect() {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", user.id)
        .single();

      if (!profile) {
        router.push("/register");
        return;
      }

      switch (profile.role) {
        case "super_admin":
          router.push("/admin");
          break;
        case "club_admin":
          router.push("/club");
          break;
        case "parent":
          router.push("/app");
          break;
        default:
          router.push("/login");
      }
    }

    redirect();
  }, [router, supabase]);

  return (
    <div
      className="flex items-center justify-center min-h-screen"
      style={{ backgroundColor: "#F0F7FF" }}
    >
      <div
        className="animate-spin rounded-full h-8 w-8 border-b-2"
        style={{ borderColor: "#3B82F6" }}
      />
    </div>
  );
}
