import { createOpenAI } from "@ai-sdk/openai";
import { convertToModelMessages, streamText, type UIMessage } from "ai";

import { attachRunId, createRunIdFetch } from "./ai-run-id.server.ts";

const SYSTEM = `You are Smart Saver's concise, friendly support assistant. Only answer questions about Smart Saver and its policies. Use these verified facts:
- 100 Smart Coins convert to ₹1 Smart Money. Minimum conversion is 100 coins.
- To add Smart Money, choose an amount of at least ₹10, pay smartsaver@upi using the shown QR, then submit the 12-digit UTR. Credit appears after admin verification.
- Withdrawals are sent to the submitted UPI ID and normally take 24–48 hours after review.
- VIP is ₹49/month. VIP gets 2x spin rewards, 2x ad rewards, 50 ads/day instead of 20, a Gold Crown badge, and unlimited savings-goal breaks with no ₹10 penalty and a full goal-balance refund during the active month.
- Rejected withdrawal requests return the held Smart Money. Unused wallet balances may be withdrawn or refunded under platform policy.
- Smart Saver is a personal budget utility and promotional reward platform, not a bank, NBFC, or deposit-taking entity.
Never invent account status, payment approval, legal promises, or transaction details. For account-specific help, direct users to yuvrajsinghsingh498@gmail.com. Keep answers under 120 words.`;

export async function handleSupportChat(request: Request) {
  const key = process.env['LOVABLE_API_KEY'];
  if (!key) return Response.json({ message: "AI support is not configured." }, { status: 401 });
  const body = await request.json().catch(() => null) as { messages?: UIMessage[] } | null;
  if (!body || !Array.isArray(body.messages) || body.messages.length > 40) {
    return Response.json({ message: "Invalid support conversation." }, { status: 400 });
  }
  const messages = body.messages.filter((message) => message && (message.role === "user" || message.role === "assistant"));
  const gateway = createRunIdFetch(request.headers.get("X-Lovable-AIG-Run-ID") ?? undefined);
  const provider = createOpenAI({
    baseURL: "https://ai.gateway.lovable.dev/v1",
    apiKey: key,
    headers: { "Lovable-API-Key": key, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: gateway.fetch,
  });
  const result = streamText({
    model: provider.responses("openai/gpt-6-astra"),
    system: SYSTEM,
    messages: await convertToModelMessages(messages),
    abortSignal: request.signal,
    providerOptions: { openai: { forceReasoning: true, reasoningEffort: "medium", reasoningSummary: "auto", store: false, include: ["reasoning.encrypted_content"] } },
  });
  return attachRunId(result.toUIMessageStreamResponse({ originalMessages: messages, sendReasoning: true }), gateway);
}