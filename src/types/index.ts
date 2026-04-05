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
