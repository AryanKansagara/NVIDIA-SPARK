"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { MeridianReport } from "@/lib/report";

type FlagListProps = {
  flags: MeridianReport["flags"];
};

type SignalItem = {
  id: string;
  title: string;
  detail: string;
  confidence: "High confidence" | "Medium confidence" | "Low confidence";
  tone: "red" | "yellow";
};

const confidenceClasses = {
  "High confidence": "border-[#AEE7D2] bg-[#E3F8F0] text-[#1C7E60]",
  "Medium confidence": "border-[#F2D48A] bg-[#FFF4D8] text-[#A66B00]",
  "Low confidence": "border-[#F3B6B6] bg-[#FFE5E5] text-[#C64545]",
};

const markerClasses = {
  red: "bg-[#FF6A5E]",
  yellow: "bg-[#F2BE29]",
};

function toSignalTitle(
  text: string,
  index: number,
  group: "risk" | "composite",
) {
  if (group === "risk") {
    if (text.toLowerCase().includes("heritage")) {
      return "Heritage Risk Signal";
    }
    if (text.toLowerCase().includes("flood")) {
      return "Flood Exposure Signal";
    }
    if (text.toLowerCase().includes("insured")) {
      return "Insured Borrowing Signal";
    }
    return `Risk Signal ${index + 1}`;
  }

  if (text.toLowerCase().includes("transit")) {
    return "Transit Dividend Signal";
  }
  if (text.toLowerCase().includes("buyer benefits")) {
    return "Buyer Benefits Signal";
  }
  if (text.toLowerCase().includes("renewal")) {
    return "Renewal Sensitivity Signal";
  }
  return `Composite Signal ${index + 1}`;
}

function buildSignals(flags: MeridianReport["flags"]) {
  const riskSignals: SignalItem[] = [
    ...flags.red.map((text, index) => ({
      id: `risk-${index}`,
      title: toSignalTitle(text, index, "risk"),
      detail: text,
      confidence:
        text.toLowerCase().includes("downtown") ||
        text.toLowerCase().includes("heritage")
          ? "High confidence"
          : "Medium confidence",
      tone:
        text.toLowerCase().includes("downtown") ||
        text.toLowerCase().includes("heritage")
          ? "red"
          : "yellow",
    })),
  ];

  const compositeSignals: SignalItem[] = [
    ...flags.yellow.map((text, index) => ({
      id: `composite-yellow-${index}`,
      title: toSignalTitle(text, index, "composite"),
      detail: text,
      confidence: "Low confidence",
      tone: "yellow",
    })),
    ...flags.green.map((text, index) => ({
      id: `composite-green-${index}`,
      title: toSignalTitle(text, index + flags.yellow.length, "composite"),
      detail: text,
      confidence: "High confidence",
      tone: "yellow",
    })),
  ];

  return { riskSignals, compositeSignals };
}

function SectionHeader({ title }: { title: string }) {
  return (
    <div className="flex items-center gap-3">
      <p className="text-sm font-semibold uppercase tracking-[0.22em] text-slate">
        {title}
      </p>
      <div className="h-px flex-1 bg-[#D7E7E2]" />
    </div>
  );
}

function AccordionRow({ item }: { item: SignalItem }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <button
      type="button"
      onClick={() => setIsOpen((current) => !current)}
      className="w-full rounded-[1.75rem] border border-[#D7E7E2] bg-white px-5 py-5 text-left shadow-sm transition hover:border-[#BCD6CC]"
    >
      <div className="flex items-center gap-4">
        <div className={`h-10 w-1 rounded-full ${markerClasses[item.tone]}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[1.05rem] font-medium text-ink">{item.title}</p>
        </div>
        <div
          className={`hidden rounded-full border px-4 py-2 text-sm font-semibold md:inline-flex ${confidenceClasses[item.confidence]}`}
        >
          {item.confidence}
        </div>
        <ChevronDown
          className={`h-4 w-4 shrink-0 text-slate transition ${isOpen ? "rotate-180" : ""}`}
        />
      </div>
      <div className="mt-3 flex md:hidden">
        <div
          className={`rounded-full border px-4 py-2 text-sm font-semibold ${confidenceClasses[item.confidence]}`}
        >
          {item.confidence}
        </div>
      </div>
      {isOpen ? (
        <div className="ml-5 mt-4 border-t border-[#E7F0EC] pt-4 text-sm leading-7 text-slate">
          {item.detail}
        </div>
      ) : null}
    </button>
  );
}

export function FlagList({ flags }: FlagListProps) {
  const { riskSignals, compositeSignals } = useMemo(
    () => buildSignals(flags),
    [flags],
  );

  return (
    <div className="space-y-8">
      <section className="space-y-4">
        <SectionHeader title="Risk Flags" />
        <Panel className="space-y-3 border-transparent bg-transparent p-0 shadow-none backdrop-blur-0">
          {riskSignals.map((item) => (
            <AccordionRow key={item.id} item={item} />
          ))}
        </Panel>
      </section>

      <section className="space-y-4">
        <SectionHeader title="Composite Signals" />
        <Panel className="space-y-3 border-transparent bg-transparent p-0 shadow-none backdrop-blur-0">
          {compositeSignals.map((item) => (
            <AccordionRow key={item.id} item={item} />
          ))}
        </Panel>
      </section>
    </div>
  );
}
