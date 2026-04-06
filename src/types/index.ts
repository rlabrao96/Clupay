export type UserRole = "super_admin" | "club_admin" | "parent";

export type EnrollmentStatus = "active" | "paused" | "cancelled";

export type InvoiceStatus = "generated" | "pending" | "paid" | "overdue";

export type PaymentMethod = "card_automatic" | "card_link" | "bank_transfer";

export type PaymentStatus = "pending" | "completed" | "failed" | "refunded";

export type DiscountType = "percentage" | "fixed_amount";

export type DiscountDuration = "one_time" | "n_months" | "until_removed";

export type NotificationChannel = "email" | "whatsapp";

export type NotificationType =
  | "reminder"
  | "confirmation"
  | "overdue"
  | "reward_message"
  | "invitation"
  | "invoice_pdf"
  | "receipt_pdf";

export interface Profile {
  id: string;
  name: string;
  last_names: string;
  rut: string;
  date_of_birth: string;
  email: string;
  phone: string | null;
  role: UserRole;
  created_at: string;
  updated_at: string;
}

export interface Club {
  id: string;
  name: string;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  billing_day: number;
  platform_fee_fixed: number;
  platform_fee_percent: number;
  created_at: string;
  updated_at: string;
}

export interface ClubAdmin {
  id: string;
  club_id: string;
  profile_id: string;
  created_at: string;
}

export interface Enrollment {
  id: string;
  kid_id: string;
  club_id: string;
  sport_id: string;
  plan_id: string;
  status: EnrollmentStatus;
  enrolled_at: string;
  created_at: string;
  updated_at: string;
}

export interface PlatformBillingRow {
  id: string;
  club_id: string;
  period_month: number;
  period_year: number;
  fixed_fee: number;
  commission_percent: number;
  total_collected: number;
  commission_amount: number;
  platform_revenue: number;
  created_at: string;
  updated_at: string;
}

export interface Sport {
  id: string;
  club_id: string;
  name: string;
  description: string | null;
  created_at: string;
  updated_at: string;
}

export interface Plan {
  id: string;
  sport_id: string;
  name: string;
  description: string | null;
  price: number;
  frequency: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Kid {
  id: string;
  parent_id: string;
  name: string;
  last_names: string;
  rut: string;
  date_of_birth: string;
  created_at: string;
  updated_at: string;
}

export interface Invoice {
  id: string;
  parent_id: string;
  club_id: string;
  period_month: number;
  period_year: number;
  subtotal: number;
  discount_total: number;
  total: number;
  due_date: string;
  status: InvoiceStatus;
  pdf_url: string | null;
  receipt_pdf_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvoiceItem {
  id: string;
  invoice_id: string;
  kid_id: string;
  sport_id: string;
  plan_id: string;
  amount: number;
  discount_amount: number;
  created_at: string;
}

export interface Discount {
  id: string;
  club_id: string;
  assigned_by: string;
  kid_id: string | null;
  parent_id: string | null;
  type: DiscountType;
  value: number;
  duration: DiscountDuration;
  remaining_months: number | null;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Invitation {
  id: string;
  club_id: string;
  invited_by: string;
  email: string | null;
  phone: string | null;
  token: string;
  status: "pending" | "accepted" | "expired";
  accepted_at: string | null;
  expires_at: string;
  created_at: string;
}

export interface ClubParent {
  id: string;
  club_id: string;
  parent_id: string;
  joined_at: string;
  created_at: string;
}

export type NotificationStatus = "scheduled" | "sent" | "failed";
export type InvitationStatus = "pending" | "accepted" | "expired";
