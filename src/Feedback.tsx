export const sendFeedbackWebhook = async (app: any) => {
    try {
      await fetch("https://excessive-shadow-alexandria-fat.trycloudflare.com/webhook-test/cdb7d2e0-5531-48dd-ad1a-79765ad55f20", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          patientName: app.patientName,
          phone: app.phone,
          serviceName: app.serviceName,
          date: app.date,
        }),
      });
    } catch (err) {
      console.error("Feedback Webhook error:", err);
    }
  };