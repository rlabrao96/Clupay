import { sendNotification } from "@/lib/email/send-notification";

// Mock resend module
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn(),
}));

import { sendEmail } from "@/lib/email/resend";

const mockSendEmail = sendEmail as jest.MockedFunction<typeof sendEmail>;

// Mock Supabase client
function createMockSupabase(insertResult: { error: null | { message: string } } = { error: null }) {
  const insert = jest.fn().mockReturnValue({ error: insertResult.error });
  return {
    from: jest.fn().mockReturnValue({ insert }),
    _insert: insert,
  };
}

describe("sendNotification", () => {
  beforeEach(() => jest.clearAllMocks());

  it("sends email and logs to notifications table on success", async () => {
    mockSendEmail.mockResolvedValue({ success: true });
    const supabase = createMockSupabase();

    await sendNotification({
      supabase: supabase as any,
      parentId: "parent-1",
      clubId: "club-1",
      email: "parent@test.cl",
      type: "reminder",
      subject: "Test Subject",
      html: "<p>Test</p>",
      metadata: { invoice_id: "inv-1" },
    });

    expect(mockSendEmail).toHaveBeenCalledWith("parent@test.cl", "Test Subject", "<p>Test</p>");
    expect(supabase.from).toHaveBeenCalledWith("notifications");
    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({
        parent_id: "parent-1",
        club_id: "club-1",
        channel: "email",
        type: "reminder",
        subject: "Test Subject",
        status: "sent",
      })
    );
  });

  it("logs as failed when Resend returns error, does not throw", async () => {
    mockSendEmail.mockResolvedValue({ success: false, error: "Rate limited" });
    const supabase = createMockSupabase();

    await sendNotification({
      supabase: supabase as any,
      parentId: "parent-1",
      clubId: "club-1",
      email: "parent@test.cl",
      type: "reminder",
      subject: "Test",
      html: "<p>Test</p>",
    });

    expect(supabase._insert).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" })
    );
  });
});
