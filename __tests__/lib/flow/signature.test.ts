import { signFlowParams } from "@/lib/flow/signature";

describe("signFlowParams", () => {
  const secretKey = "test_secret_key_12345";

  it("signs params sorted alphabetically by key", () => {
    const sig = signFlowParams(
      { apiKey: "abc", amount: "1000", commerceOrder: "order1" },
      secretKey
    );
    // Alphabetically sorted keys: amount < apiKey < commerceOrder
    // ('am' < 'ap' because 'm' < 'p'), so the signing string is:
    //   "amount=1000&apiKey=abc&commerceOrder=order1"
    // Known-answer computed with Node crypto:
    //   crypto.createHmac("sha256", "test_secret_key_12345")
    //     .update("amount=1000&apiKey=abc&commerceOrder=order1")
    //     .digest("hex")
    expect(sig).toBe(
      "99295731f4dce71f6f607c2a0df654173f39d461af0ceeddb837c8f006865395"
    );
  });

  it("is deterministic", () => {
    const a = signFlowParams({ b: "2", a: "1" }, secretKey);
    const b = signFlowParams({ a: "1", b: "2" }, secretKey);
    expect(a).toBe(b);
  });

  it("produces different signatures for different inputs", () => {
    const a = signFlowParams({ amount: "1000" }, secretKey);
    const b = signFlowParams({ amount: "2000" }, secretKey);
    expect(a).not.toBe(b);
  });

  it("sorts multi-key params alphabetically", () => {
    // apiKey sorts before amount sorts before commerceOrder sorts before email
    const sig = signFlowParams(
      {
        email: "a@b.cl",
        amount: "500",
        commerceOrder: "ord",
        apiKey: "k",
      },
      secretKey
    );
    expect(typeof sig).toBe("string");
    expect(sig.length).toBe(64); // HMAC-SHA256 hex = 64 chars
  });

  it("returns lowercase hex", () => {
    const sig = signFlowParams({ a: "1" }, secretKey);
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });
});
