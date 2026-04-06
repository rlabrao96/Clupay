"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deleteInvitation } from "@/lib/actions/delete-invitation";

export function DeleteInvitationButton({ invitationId }: { invitationId: string }) {
  const router = useRouter();
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  async function handleDelete() {
    setDeleting(true);
    const result = await deleteInvitation(invitationId);
    if (result.error) {
      alert(`Error: ${result.error}`);
      setDeleting(false);
      setConfirming(false);
      return;
    }
    router.refresh();
  }

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-2 whitespace-nowrap">
        <span className="text-xs text-text-secondary">¿Eliminar?</span>
        <button
          onClick={handleDelete}
          disabled={deleting}
          className="text-xs text-white bg-danger px-2 py-1 rounded font-medium hover:bg-danger/80 transition-colors disabled:opacity-50"
        >
          {deleting ? "..." : "Sí"}
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="text-xs text-text-secondary px-2 py-1 rounded font-medium hover:bg-gray-100 transition-colors"
        >
          No
        </button>
      </span>
    );
  }

  return (
    <button onClick={() => setConfirming(true)} className="text-sm text-danger hover:text-danger/80 font-medium">
      Eliminar
    </button>
  );
}
