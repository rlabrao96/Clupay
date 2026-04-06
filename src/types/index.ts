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
