"use client";

import { useState } from "react";

interface Props {
  label: string;
  value: string;
}

export function CopyableField({ label, value }: Props) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard API can fail in insecure contexts; fall back silently.
    }
  }

  return (
    <div className="flex items-center justify-between gap-4">
      <div>
        <p className="text-xs text-text-secondary">{label}</p>
        <p className="text-sm font-medium text-text">{value}</p>
      </div>
      <button
        type="button"
        onClick={handleCopy}
        className="text-xs font-medium text-primary hover:text-primary-dark"
      >
        {copied ? "Copiado ✓" : "Copiar"}
      </button>
    </div>
  );
}
