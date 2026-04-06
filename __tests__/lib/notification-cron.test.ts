import { processNotifications } from "@/lib/notification-cron";

// Mock email modules
jest.mock("@/lib/email/resend", () => ({
  sendEmail: jest.fn().mockResolvedValue({ success: true }),
}));

jest.mock("@/lib/email/send-notification", () => ({
  sendNotification: jest.fn().mockResolvedValue(undefined),
}));

import { sendNotification } from "@/lib/email/send-notification";
const mockSendNotification = sendNotification as jest.MockedFunction<typeof sendNotification>;

function createMockSupabase(overrides: Record<string, any> = {}) {
  const defaultData: Record<string, any[]> = {
    invoices_reminder: [],
    invoices_overdue: [],
    invoices_auto: [],
    notifications: [],
    profiles: [],
    clubs: [],
    ...overrides,
  };

  // Build a chainable mock
  const createChain = (tableName: string) => {
    const chain: any = {};
    chain.select = jest.fn().mockReturnValue(chain);
    chain.eq = jest.fn().mockReturnValue(chain);
    chain.in = jest.fn().mockReturnValue(chain);
    chain.contains = jest.fn().mockReturnValue(chain);
    chain.single = jest.fn().mockReturnValue(chain);
    chain.limit = jest.fn().mockReturnValue(chain);
    // Resolve when awaited
    chain.then = (resolve: any) => resolve({ data: defaultData[tableName] ?? [], error: null });
    return chain;
  };

  return {
    from: jest.fn((table: string) => createChain(table)),
  };
}

describe("processNotifications", () => {
  beforeEach(() => jest.clearAllMocks());

  it("returns zero counts when no invoices match", async () => {
    const supabase = createMockSupabase();
    const result = await processNotifications(supabase as any, { autoApprovedInvoiceIds: [] });
    expect(result.reminders_sent).toBe(0);
    expect(result.overdue_sent).toBe(0);
    expect(result.auto_approved_sent).toBe(0);
  });
});
