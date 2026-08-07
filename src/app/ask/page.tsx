import type { Metadata } from "next";
import { features } from "@/lib/config";
import { Card, DataState } from "@/components/ui";
import { AskConsole } from "@/components/ask-console";

export const metadata: Metadata = {
  title: "Ask",
  description:
    "Ask questions in plain English. Answers come from the same data the rest of the app shows.",
};

export default function AskPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <header className="mb-6">
        <h1 className="text-3xl tracking-[-0.03em] text-chalk">Ask</h1>
        <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-chalk-dim">
          Questions are answered by querying the same data sources the rest of
          the app uses. When the data does not exist, the assistant says so
          instead of estimating — it has no fallback that invents numbers.
        </p>
      </header>

      {features.assistant ? (
        <AskConsole />
      ) : (
        <Card>
          <DataState
            reason="missing-credentials"
            message="The assistant needs a Gemini API key. Add GEMINI_API_KEY to your environment to enable it. Everything else in the app works without it."
          />
        </Card>
      )}
    </div>
  );
}
