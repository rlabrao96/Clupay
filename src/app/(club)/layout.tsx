import type { ReactNode } from "react";
import Link from "next/link";
import { AuthGuard } from "@/components/shared/auth-guard";

const navItems = [
  { href: "/club", label: "Dashboard" },
  { href: "/club/deportistas", label: "Deportistas" },
  { href: "/club/deportes", label: "Deportes" },
  { href: "/club/planes", label: "Planes" },
  { href: "/club/cobros", label: "Cobros" },
  { href: "/club/invitaciones", label: "Invitaciones" },
  { href: "/club/descuentos", label: "Descuentos" },
  { href: "/club/configuracion", label: "Configuración" },
];

function ClubSidebar() {
  return (
    <aside
      className="w-64 min-h-screen flex flex-col border-r border-gray-100"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-xl font-bold" style={{ color: "#3B82F6" }}>
          CluPay
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Club Admin</p>
      </div>
      <nav className="flex-1 px-3 py-4">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.href}>
              <Link
                href={item.href}
                className="flex items-center px-3 py-2.5 rounded-lg text-sm font-medium text-gray-700 hover:bg-blue-50 hover:text-blue-600 transition-colors"
              >
                {item.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
}

export default function ClubLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="club_admin">
      <div className="flex min-h-screen" style={{ backgroundColor: "#F0F7FF" }}>
        <ClubSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
