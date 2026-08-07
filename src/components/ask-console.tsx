"use client";

import { useRef, useState } from "react";
import { Card } from "@/components/ui";

interface Turn {
  id: string;
  question: string;
  answer: string | null;
  error: string | null;
  toolsUsed: string[];
}

const SUGGESTIONS = [
  "Who is top of the Premier League?",
  "What matches are live right now?",
  "How good is Arsenal's defence compared to the rest of the league?",
];

const MAX_LENGTH = 500;

export function AskConsole() {
  const [turns, setTurns] = useState<Turn[]>([]);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  // Monotonic counter rather than Date.now(): ids stay stable and unique even
  // if two questions are submitted within the same millisecond.
  const nextId = useRef(0);

  async function ask(question: string) {
    const trimmed = question.trim();
    if (!trimmed || pending) return;

    const id = `turn-${(nextId.current += 1)}`;
    setTurns((prev) => [
      ...prev,
      { id, question: trimmed, answer: null, error: null, toolsUsed: [] },
    ]);
    setInput("");
    setPending(true);

    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed }),
      });

      const payload = await response.json();

      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id
            ? {
                ...turn,
                answer: response.ok ? payload.answer : null,
                error: response.ok ? null : (payload.error ?? "Request failed."),
                toolsUsed: payload.toolsUsed ?? [],
              }
            : turn,
        ),
      );
    } catch {
      setTurns((prev) =>
        prev.map((turn) =>
          turn.id === id
            ? { ...turn, error: "Could not reach the server." }
            : turn,
        ),
      );
    } finally {
      setPending(false);
      inputRef.current?.focus();
    }
  }

  return (
    <div className="space-y-4">
      {turns.length === 0 ? (
        <Card className="px-5 py-5">
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-chalk-faint">
            Try
          </p>
          <ul className="mt-3 space-y-2">
            {SUGGESTIONS.map((suggestion) => (
              <li key={suggestion}>
                <button
                  type="button"
                  onClick={() => ask(suggestion)}
                  className="w-full rounded-md border border-pitch-line px-3 py-2 text-left text-[13px] text-chalk-dim transition-colors duration-150 hover:border-flood/40 hover:text-chalk"
                >
                  {suggestion}
                </button>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {turns.map((turn) => (
        <div key={turn.id} className="space-y-2">
          <p className="text-right text-[14px] text-chalk">
            <span className="inline-block rounded-lg rounded-br-sm bg-pitch-float px-3.5 py-2 text-left">
              {turn.question}
            </span>
          </p>

          <Card className="px-5 py-4">
            {turn.answer ? (
              <>
                <p className="whitespace-pre-wrap text-[14px] leading-relaxed text-chalk-dim">
                  {turn.answer}
                </p>
                {turn.toolsUsed.length > 0 ? (
                  <p className="mt-3 font-mono text-[10px] text-chalk-faint">
                    queried: {Array.from(new Set(turn.toolsUsed)).join(", ")}
                  </p>
                ) : null}
              </>
            ) : turn.error ? (
              <p className="text-[14px] leading-relaxed text-alert">{turn.error}</p>
            ) : (
              <p className="font-mono text-[12px] text-chalk-faint">
                <span className="live-pulse inline-block">Querying data…</span>
              </p>
            )}
          </Card>
        </div>
      ))}

      <form
        onSubmit={(event) => {
          event.preventDefault();
          ask(input);
        }}
        className="sticky bottom-4 flex gap-2"
      >
        <label htmlFor="ask-input" className="sr-only">
          Ask a football question
        </label>
        <input
          id="ask-input"
          ref={inputRef}
          value={input}
          onChange={(event) => setInput(event.target.value.slice(0, MAX_LENGTH))}
          maxLength={MAX_LENGTH}
          disabled={pending}
          placeholder="Ask about tables, live matches or scorers…"
          className="flex-1 rounded-lg border border-pitch-line bg-pitch-raised px-4 py-2.5 text-[14px] text-chalk placeholder:text-chalk-faint focus:border-flood/40 disabled:opacity-60"
        />
        <button
          type="submit"
          disabled={pending || input.trim().length === 0}
          className="rounded-lg bg-flood px-4 py-2.5 text-[13px] font-semibold text-pitch-base transition-transform duration-200 hover:-translate-y-0.5 active:translate-y-0 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:translate-y-0"
        >
          {pending ? "…" : "Ask"}
        </button>
      </form>
    </div>
  );
}
