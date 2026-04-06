import {
  buildEmailHtml,
  invitationEmail,
  invoiceReadyEmail,
  paymentConfirmationEmail,
  paymentReminderEmail,
  overdueAlertEmail,
} from "@/lib/email/templates";

describe("buildEmailHtml", () => {
  it("wraps content in CluPay branded layout", () => {
    const html = buildEmailHtml({
      title: "Test Title",
      body: "<p>Test body</p>",
    });
    expect(html).toContain("CluPay");
    expect(html).toContain("#3B82F6");
    expect(html).toContain("Test Title");
    expect(html).toContain("<p>Test body</p>");
    expect(html).toContain("Plataforma de pagos para clubes deportivos");
  });

  it("includes CTA button when provided", () => {
    const html = buildEmailHtml({
      title: "Title",
      body: "Body",
      ctaText: "Click me",
      ctaUrl: "https://example.com",
    });
    expect(html).toContain("Click me");
    expect(html).toContain("https://example.com");
  });

  it("omits CTA button when not provided", () => {
    const html = buildEmailHtml({ title: "Title", body: "Body" });
    expect(html).not.toContain("<!--cta-->");
  });
});

describe("invitationEmail", () => {
  it("returns subject and html with club name and invite link", () => {
    const result = invitationEmail("Club Deportivo", "abc123", "https://app.clupay.cl");
    expect(result.subject).toBe("Club Deportivo te invita a CluPay");
    expect(result.html).toContain("Club Deportivo");
    expect(result.html).toContain("https://app.clupay.cl/invite/abc123");
    expect(result.html).toContain("Aceptar invitación");
  });
});

describe("invoiceReadyEmail", () => {
  it("returns subject and html with invoice details", () => {
    const result = invoiceReadyEmail("Club Deportivo", "$50.000", "15 abr. 2026", "https://app.clupay.cl");
    expect(result.subject).toBe("Nueva factura de Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("15 abr. 2026");
  });
});

describe("paymentConfirmationEmail", () => {
  it("returns subject and html with payment details", () => {
    const result = paymentConfirmationEmail("Club Deportivo", "$50.000", "abril 2026");
    expect(result.subject).toBe("Pago confirmado — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("abril 2026");
  });
});

describe("paymentReminderEmail", () => {
  it("returns subject and html with reminder details", () => {
    const result = paymentReminderEmail("Club Deportivo", "$50.000", "15 abr. 2026", "https://app.clupay.cl");
    expect(result.subject).toBe("Recordatorio: factura por vencer — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("15 abr. 2026");
  });
});

describe("overdueAlertEmail", () => {
  it("returns subject and html with overdue details", () => {
    const result = overdueAlertEmail("Club Deportivo", "$50.000", 3, "https://app.clupay.cl");
    expect(result.subject).toBe("Factura vencida — Club Deportivo");
    expect(result.html).toContain("$50.000");
    expect(result.html).toContain("3 día(s)");
  });
});
