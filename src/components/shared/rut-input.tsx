"use client";

import { useState, type ChangeEvent } from "react";
import { validateRut, formatRut, cleanRut } from "@/lib/rut/validate";

interface RutInputProps {
  value: string;
  onChange: (value: string, isValid: boolean) => void;
  name?: string;
  placeholder?: string;
  required?: boolean;
}

export function RutInput({
  value,
  onChange,
  name = "rut",
  placeholder = "12.345.678-5",
  required = false,
}: RutInputProps) {
  const [touched, setTouched] = useState(false);

  function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;
    const cleaned = cleanRut(raw);
    const formatted = cleaned.length >= 2 ? formatRut(cleaned) : raw;
    const isValid = validateRut(cleaned);
    onChange(formatted, isValid);
  }

  const isValid = validateRut(value);
  const showError = touched && value.length > 0 && !isValid;

  return (
    <div>
      <input
        type="text"
        name={name}
        value={value}
        onChange={handleChange}
        onBlur={() => setTouched(true)}
        placeholder={placeholder}
        required={required}
        className={`w-full px-4 py-2.5 rounded-lg border bg-white placeholder:text-gray-400 focus:outline-none focus:ring-2 ${
          showError
            ? "border-red-400 focus:ring-red-200"
            : "border-gray-200 focus:ring-blue-200 focus:border-blue-400"
        }`}
      />
      {showError && <p className="mt-1 text-sm text-red-500">RUT inválido</p>}
    </div>
  );
}
