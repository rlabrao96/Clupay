import * as XLSX from "xlsx";
import { parseImportFile, REQUIRED_COLUMNS } from "@/lib/import/parse";

function buildXlsx(rows: Record<string, string | number>[]): ArrayBuffer {
  const sheet = XLSX.utils.json_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, "Sheet1");
  return XLSX.write(wb, { type: "array", bookType: "xlsx" }) as ArrayBuffer;
}

describe("parseImportFile", () => {
  it("parses an xlsx with all columns", () => {
    const buf = buildXlsx([
      {
        parent_name: "juan",
        parent_last_names: "perez",
        parent_rut: "12.345.678-5",
        parent_email: "j@p.com",
        parent_phone: "+56912345678",
        parent_date_of_birth: "1985-01-01",
        kid_name: "pedro",
        kid_last_names: "perez",
        kid_rut: "23.456.789-K",
        kid_date_of_birth: "2015-03-21",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows).toHaveLength(1);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[0].parent_rut).toBe("12.345.678-5");
    expect(rows[0].kid_name).toBe("pedro");
  });

  it("parses a CSV string", () => {
    const csv =
      `${REQUIRED_COLUMNS.join(",")}\n` +
      `juan,perez,12.345.678-5,j@p.com,,,pedro,perez,23.456.789-K,2015-03-21`;
    const rows = parseImportFile(csv, "csv");
    expect(rows).toHaveLength(1);
    expect(rows[0].kid_rut).toBe("23.456.789-K");
  });

  it("throws when a required column is missing", () => {
    const buf = buildXlsx([
      { parent_name: "x", parent_last_names: "y" }, // missing most
    ]);
    expect(() => parseImportFile(buf, "xlsx")).toThrow(/columna/i);
  });

  it("returns empty optional fields as empty string", () => {
    const buf = buildXlsx([
      {
        parent_name: "a",
        parent_last_names: "b",
        parent_rut: "1-9",
        parent_email: "a@b.com",
        kid_name: "c",
        kid_last_names: "d",
        kid_rut: "2-7",
        kid_date_of_birth: "2015-01-01",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows[0].parent_phone).toBe("");
    expect(rows[0].parent_date_of_birth).toBeNull();
  });

  it("rowNumber matches user-visible Excel row (header=1, first data row=2)", () => {
    const buf = buildXlsx([
      {
        parent_name: "a",
        parent_last_names: "b",
        parent_rut: "1-9",
        parent_email: "a@b.com",
        kid_name: "c",
        kid_last_names: "d",
        kid_rut: "2-7",
        kid_date_of_birth: "2015-01-01",
      },
      {
        parent_name: "x",
        parent_last_names: "y",
        parent_rut: "3-7",
        parent_email: "x@y.com",
        kid_name: "z",
        kid_last_names: "w",
        kid_rut: "4-5",
        kid_date_of_birth: "2016-01-01",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[1].rowNumber).toBe(3);
  });

  it("skips fully-blank rows", () => {
    const buf = buildXlsx([
      {
        parent_name: "juan",
        parent_last_names: "perez",
        parent_rut: "12.345.678-5",
        parent_email: "j@p.com",
        kid_name: "pedro",
        kid_last_names: "perez",
        kid_rut: "23.456.789-K",
        kid_date_of_birth: "2015-03-21",
      },
      {
        parent_name: "",
        parent_last_names: "",
        parent_rut: "",
        parent_email: "",
        kid_name: "",
        kid_last_names: "",
        kid_rut: "",
        kid_date_of_birth: "",
      },
      {
        parent_name: "maria",
        parent_last_names: "lopez",
        parent_rut: "11.111.111-1",
        parent_email: "m@l.com",
        kid_name: "ana",
        kid_last_names: "lopez",
        kid_rut: "22.222.222-2",
        kid_date_of_birth: "2014-05-10",
      },
    ]);
    const rows = parseImportFile(buf, "xlsx");
    expect(rows).toHaveLength(2);
    expect(rows[0].rowNumber).toBe(2);
    expect(rows[1].rowNumber).toBe(4);
  });
});
