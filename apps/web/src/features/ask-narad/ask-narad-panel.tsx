"use client";

import { useState, useRef, useEffect, KeyboardEvent } from "react";
import { useShellStore } from "@/stores/shell-store";

export function AskNaradPanel() {
  const isAskNaradOpen = useShellStore((state) => state.isAskNaradOpen);
  const setAskNaradOpen = useShellStore((state) => state.setAskNaradOpen);
  const initialQuery = useShellStore((state) => state.commandQuery);
  const setCommandQuery = useShellStore((state) => state.setCommandQuery);

  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "model"; content: string }[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initialize and send the first message if triggered from Global Command Bar
  useEffect(() => {
    if (isAskNaradOpen && initialQuery && messages.length === 0) {
      setInput(initialQuery);
      setCommandQuery("");
      // Using a small timeout lets the UI paint before heavy API calls block the thread
      setTimeout(() => sendMessage(initialQuery), 100);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAskNaradOpen, initialQuery]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  if (!isAskNaradOpen) return null;

  async function sendMessage(text: string) {
    if (!text.trim()) return;
    
    const userMessage: { role: "user" | "model"; content: string } = { role: "user", content: text };
    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    try {
      const response = await fetch("/api/agents/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Passing the previous dialogue history
        body: JSON.stringify({ message: text, history: messages }),
      });

      if (response.ok) {
        const payload = await response.json();
        setMessages((prev) => [...prev, { role: "model", content: payload.reply }]);
      } else {
        setMessages((prev) => [...prev, { role: "model", content: "Error: Could not reach the Intelligence Orchestrator." }]);
      }
    } catch {
      setMessages((prev) => [...prev, { role: "model", content: "Error: Connection failed." }]);
    } finally {
      setIsLoading(false);
    }
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  return (
    <div className="ask-narad-overlay" onClick={() => setAskNaradOpen(false)}>
      <div 
        className="ask-narad-panel panel" 
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "fixed",
          top: "1rem",
          bottom: "1rem",
          right: "1rem",
          width: "450px",
          maxWidth: "calc(100vw - 2rem)",
          display: "flex",
          flexDirection: "column",
          boxShadow: "0 20px 40px rgba(0,0,0,0.5)",
          zIndex: 1000,
          background: "var(--color-bg)",
          border: "1px solid var(--color-border)",
        }}
      >
        <div className="panel-header" style={{ padding: "1.5rem", borderBottom: "1px solid var(--color-border)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            <h2 style={{ fontSize: "1.25rem", margin: 0 }}>Ask NARAD</h2>
            <p className="eyebrow" style={{ marginTop: "0.25rem" }}>Multi-Agent Orchestrator</p>
          </div>
          <button 
            type="button" 
            onClick={() => setAskNaradOpen(false)}
            className="workspace-link"
            style={{ width: "2.5rem", height: "2.5rem", padding: 0, display: "grid", placeItems: "center" }}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <div className="panel-body" style={{ flexGrow: 1, overflowY: "auto", padding: "1.5rem", display: "flex", flexDirection: "column", gap: "1rem" }}>
          {messages.length === 0 && (
            <div className="empty-surface" style={{ flexGrow: 1, display: "grid", placeItems: "center" }}>
              <p>Hello. I am the NARAD intelligence supervisor. Ask me anything about regulatory updates, entity structures, or investigations.</p>
            </div>
          )}
          
          {messages.map((msg, idx) => (
            <div 
              key={idx} 
              style={{
                alignSelf: msg.role === "user" ? "flex-end" : "flex-start",
                background: msg.role === "user" ? "var(--color-accent-blue)" : "var(--color-surface)",
                padding: "1rem",
                borderRadius: "0.5rem",
                maxWidth: "90%",
                wordBreak: "break-word",
              }}
            >
              <strong>{msg.role === "user" ? "You" : "Supervisor"}</strong>
              <div style={{ marginTop: "0.5rem", whiteSpace: "pre-wrap", fontSize: "0.95rem" }}>{msg.content}</div>
            </div>
          ))}
          {isLoading && (
            <div style={{
              alignSelf: "flex-start",
              background: "var(--color-surface)",
              padding: "1rem",
              borderRadius: "0.5rem",
              opacity: 0.7,
            }}>
              Orchestrating agents...
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        <div className="panel-footer" style={{ padding: "1.5rem", borderTop: "1px solid var(--color-border)" }}>
          <div className="search-input" style={{ width: "100%", display: "flex", gap: "0.5rem" }}>
            <input 
              type="text" 
              placeholder="Query the sovereign index..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={isLoading}
              style={{ flexGrow: 1, padding: "0.75rem", background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: "0.25rem", color: "var(--color-text)" }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
