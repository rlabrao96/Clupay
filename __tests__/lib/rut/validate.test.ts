import { validateRut, formatRut, cleanRut } from "@/lib/rut/validate";

describe("cleanRut", () => {
  it("removes dots and dashes", () => {
    expect(cleanRut("12.345.678-5")).toBe("123456785");
  });

  it("removes spaces", () => {
    expect(cleanRut("12 345 678 5")).toBe("123456785");
  });

  it("handles already clean input", () => {
    expect(cleanRut("123456785")).toBe("123456785");
  });
});

describe("validateRut", () => {
  it("returns true for valid RUT 12.345.678-5", () => {
    expect(validateRut("12.345.678-5")).toBe(true);
  });

  it("returns true for valid RUT 7.000.013-K", () => {
    expect(validateRut("7.000.013-K")).toBe(true);
  });

  it("returns true for valid RUT with lowercase k", () => {
    expect(validateRut("7.000.013-k")).toBe(true);
  });

  it("returns true for valid RUT without formatting", () => {
    expect(validateRut("123456785")).toBe(true);
  });

  it("returns false for invalid check digit", () => {
    expect(validateRut("12.345.678-0")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(validateRut("")).toBe(false);
  });

  it("returns false for too short input", () => {
    expect(validateRut("123")).toBe(false);
  });

  it("returns false for non-numeric body", () => {
    expect(validateRut("abc-5")).toBe(false);
  });
});

describe("formatRut", () => {
  it("formats a clean RUT with dots and dash", () => {
    expect(formatRut("123456785")).toBe("12.345.678-5");
  });

  it("formats a RUT with K", () => {
    expect(formatRut("7000013K")).toBe("7.000.013-K");
  });

  it("handles already formatted input", () => {
    expect(formatRut("12.345.678-5")).toBe("12.345.678-5");
  });
});
