"use client";

import { useRouter } from "next/navigation";
import { deleteInvitation } from "@/lib/actions/delete-invitation";

export function DeleteInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();

  async function handleDelete() {
    if (!confirm("¿Eliminar esta invitación?")) return;
    const result = await deleteInvitation(invitationId);
    if (result.error) {
      alert(`Error: ${result.error}`);
      return;
    }
    router.refresh();
  }

  return (
    <button onClick={handleDelete} className="text-sm text-danger hover:text-danger/80 font-medium">
      Eliminar
    </button>
  );
}
