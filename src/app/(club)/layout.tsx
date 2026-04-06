"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/shared/auth-guard";
import { LogoutButton } from "@/components/shared/logout-button";
import { createClient } from "@/lib/supabase/client";

const navItems = [
  { href: "/club", label: "Dashboard", exact: true },
  { href: "/club/deportistas", label: "Deportistas", exact: false },
  { href: "/club/planes", label: "Deportes y Planes", exact: false },
  { href: "/club/cobros", label: "Cobros", exact: false },
  { href: "/club/invitaciones", label: "Invitaciones", exact: false },
  { href: "/club/descuentos", label: "Descuentos", exact: false },
  { href: "/club/configuracion", label: "Configuración", exact: false },
];

function ClubSidebar() {
  const pathname = usePathname();
  const [clubName, setClubName] = useState<string>("");

  useEffect(() => {
    async function loadClubName() {
      const supabase = createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: clubAdmin } = await supabase
        .from("club_admins")
        .select("club_id, clubs:club_id(name)")
        .eq("profile_id", user.id)
        .limit(1)
        .single();

      if (clubAdmin?.clubs) {
        setClubName((clubAdmin.clubs as unknown as { name: string }).name);
      }
    }
    loadClubName();
  }, []);

  return (
    <aside className="w-64 min-h-screen flex flex-col border-r border-gray-100 bg-white">
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-xl font-bold text-primary">CluPay</h1>
        <p className="text-xs text-text-secondary mt-0.5">
          {clubName || "Club Admin"}
        </p>
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => {
            const isActive = item.exact
              ? pathname === item.href
              : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={`flex items-center px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                    isActive
                      ? "bg-blue-50 text-blue-600"
                      : "text-gray-700 hover:bg-blue-50 hover:text-blue-600"
                  }`}
                >
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="px-3 py-4 border-t border-gray-100">
        <LogoutButton />
      </div>
    </aside>
  );
}

export default function ClubLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="club_admin">
      <div className="flex min-h-screen bg-background">
        <ClubSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
