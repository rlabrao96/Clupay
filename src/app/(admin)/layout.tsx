"use client";

import { type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AuthGuard } from "@/components/shared/auth-guard";
import { LogoutButton } from "@/components/shared/logout-button";

const navItems = [
  { href: "/admin", label: "Dashboard", exact: true },
  { href: "/admin/clubes", label: "Clubes", exact: false },
  { href: "/admin/usuarios", label: "Usuarios", exact: false },
  { href: "/admin/facturacion", label: "Facturación", exact: false },
];

function AdminSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="w-64 min-h-screen flex flex-col border-r border-gray-100"
      style={{ backgroundColor: "#FFFFFF" }}
    >
      <div className="px-6 py-6 border-b border-gray-100">
        <h1 className="text-xl font-bold" style={{ color: "#3B82F6" }}>
          CluPay
        </h1>
        <p className="text-xs text-gray-500 mt-0.5">Super Admin</p>
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

export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <AuthGuard requiredRole="super_admin">
      <div className="flex min-h-screen" style={{ backgroundColor: "#F0F7FF" }}>
        <AdminSidebar />
        <main className="flex-1 p-8">{children}</main>
      </div>
    </AuthGuard>
  );
}
