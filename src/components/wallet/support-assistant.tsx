import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Bot, Mail, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Shimmer } from "@/components/ai-elements/shimmer";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/app-toast";

const STORAGE_KEY = "smart-saver-support-chat";
const SUGGESTIONS = ["How do I submit a UTR?", "When will my withdrawal arrive?", "What do I get with VIP?"];

export function SupportAssistant() {
  const [input, setInput] = useState("");
  const loaded = useRef(false);
  const textarea = useRef<HTMLTextAreaElement | null>(null);
  const transport = useMemo(() => new DefaultChatTransport({ api: "/api/support-chat" }), []);
  const { messages, setMessages, sendMessage, status, stop, error } = useChat({
    id: "smart-saver-support",
    transport,
    onError: (chatError) => toast.error(chatError.message || "Support is temporarily unavailable"),
  });
  const busy = status === "submitted" || status === "streaming";

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(STORAGE_KEY);
      if (saved) setMessages(JSON.parse(saved) as UIMessage[]);
    } catch { window.localStorage.removeItem(STORAGE_KEY); }
    loaded.current = true;
    textarea.current?.focus();
  }, [setMessages]);
  useEffect(() => {
    if (loaded.current) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    if (!busy) textarea.current?.focus();
  }, [messages, busy]);

  const submit = (text: string) => {
    const clean = text.trim();
    if (!clean || busy) return;
    setInput("");
    void sendMessage({ text: clean });
  };

  return <section className="mt-5 rounded-lg border border-primary/40 bg-card p-4">
    <div className="flex items-center justify-between gap-3">
      <div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-full bg-primary text-primary-foreground"><Bot className="size-5"/></div><div><h3 className="font-bold">AI Support Assistant</h3><p className="text-xs text-muted-foreground">24/7 Smart Support</p></div></div>
      <Button variant="ghost" size="icon" aria-label="Clear support chat" title="Clear support chat" onClick={() => { stop(); setMessages([]); window.localStorage.removeItem(STORAGE_KEY); }}><RotateCcw/></Button>
    </div>
    <div className="mt-4 h-80 overflow-hidden rounded-lg border border-border bg-background/40">
      <Conversation>
        <ConversationContent className="gap-4 p-3">
          {messages.length === 0 && <ConversationEmptyState icon={<Bot className="size-9"/>} title="How can I help?" description="Ask about coins, payments, withdrawals, VIP, or refunds."/>}
          {messages.map((message) => <Message key={message.id} from={message.role}><MessageContent className={message.role === "user" ? "bg-primary text-primary-foreground" : undefined}>{message.parts.map((part, index) => part.type === "text" ? <MessageResponse key={index}>{part.text}</MessageResponse> : null)}</MessageContent></Message>)}
          {status === "submitted" && <div className="flex items-center gap-2 text-sm text-muted-foreground"><Bot className="size-4"/><Shimmer>Thinking…</Shimmer></div>}
          {error && <p className="text-sm text-destructive">{error.message || "Support is temporarily unavailable."}</p>}
        </ConversationContent>
        <ConversationScrollButton/>
      </Conversation>
    </div>
    {messages.length === 0 && <div className="mt-3 flex flex-wrap gap-2">{SUGGESTIONS.map((suggestion) => <Button key={suggestion} variant="outline" size="sm" onClick={() => submit(suggestion)}>{suggestion}</Button>)}</div>}
    <PromptInput className="mt-3" onSubmit={(message) => submit(message.text)}>
      <PromptInputTextarea ref={textarea} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask Smart Support…" disabled={busy}/>
      <PromptInputFooter className="justify-end"><PromptInputSubmit status={status} onStop={stop} disabled={!input.trim() && !busy}/></PromptInputFooter>
    </PromptInput>
    <div className="mt-4 border-t border-border pt-4"><p className="text-xs text-muted-foreground">Need personal help?</p><p className="mt-1 break-all text-sm font-semibold">yuvrajsinghsingh498@gmail.com</p><Button asChild variant="outline" size="sm" className="mt-3"><a href="mailto:yuvrajsinghsingh498@gmail.com?subject=Smart%20Saver%20Support"><Mail/>Open Email</a></Button></div>
  </section>;
}