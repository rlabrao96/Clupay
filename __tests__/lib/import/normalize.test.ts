import {
  normalizeName,
  normalizeEmail,
  normalizePhone,
  normalizeDate,
} from "@/lib/import/normalize";

describe("normalizeName", () => {
  it("title-cases lowercase input", () => {
    expect(normalizeName("juan perez")).toBe("Juan Perez");
  });
  it("preserves accents and ñ", () => {
    expect(normalizeName("MARÍA NÚÑEZ")).toBe("María Núñez");
  });
  it("collapses repeated whitespace and trims", () => {
    expect(normalizeName("  juan   PÉREZ  ")).toBe("Juan Pérez");
  });
});

describe("normalizeEmail", () => {
  it("trims and lowercases", () => {
    expect(normalizeEmail("  Foo@Bar.COM  ")).toBe("foo@bar.com");
  });
});

describe("normalizePhone", () => {
  it("strips spaces dots parens, keeps leading +", () => {
    expect(normalizePhone("+56 9 1234.5678")).toBe("+56912345678");
    expect(normalizePhone("(02) 234-5678")).toBe("02234-5678");
  });
  it("returns empty string when input is empty", () => {
    expect(normalizePhone("")).toBe("");
  });
});

describe("normalizeDate", () => {
  it("parses ISO YYYY-MM-DD", () => {
    expect(normalizeDate("2015-03-21")).toBe("2015-03-21");
  });
  it("parses Chilean DD/MM/YYYY", () => {
    expect(normalizeDate("21/03/2015")).toBe("2015-03-21");
  });
  it("parses DD-MM-YYYY", () => {
    expect(normalizeDate("21-03-2015")).toBe("2015-03-21");
  });
  it("parses D/M/YY assuming 19xx for >= 50, 20xx for < 50", () => {
    expect(normalizeDate("3/2/15")).toBe("2015-02-03");
    expect(normalizeDate("3/2/85")).toBe("1985-02-03");
  });
  it("parses Excel date serial numbers", () => {
    // 42005 = 2015-01-01 in Excel's 1900-based serial system
    expect(normalizeDate(42005)).toBe("2015-01-01");
  });
  it("returns null for unparseable input", () => {
    expect(normalizeDate("not a date")).toBeNull();
    expect(normalizeDate("")).toBeNull();
  });
});
