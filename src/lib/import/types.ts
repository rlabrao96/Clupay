export interface ParsedRow {
  rowNumber: number; // 1-based, excluding header
  parent_name: string;
  parent_last_names: string;
  parent_rut: string;
  parent_email: string;
  parent_phone: string;
  parent_date_of_birth: string | number | null;
  kid_name: string;
  kid_last_names: string;
  kid_rut: string;
  kid_date_of_birth: string | number | null;
}

export type RowStatus =
  | "new"
  | "reuse_parent"
  | "no_change"
  | "error";

export interface ValidatedRow {
  rowNumber: number;
  status: RowStatus;
  errors: string[];
  // Normalized values
  parent: {
    name: string;
    last_names: string;
    rut: string; // canonical
    email: string;
    phone: string;
    date_of_birth: string | null;
    existingProfileId?: string;
  };
  kid: {
    name: string;
    last_names: string;
    rut: string; // canonical
    date_of_birth: string;
    existingKidId?: string;
  };
}
