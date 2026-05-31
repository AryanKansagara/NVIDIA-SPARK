"use client";

import { useCallback, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EASE } from "@/lib/motion";
import { Nav } from "@/components/nav";
import { ChatFab } from "@/components/chat-fab";
import { Landing } from "@/components/screens/landing";
import { Analysis } from "@/components/screens/analysis";
import { Verdict } from "@/components/screens/verdict";
import { fetchReport } from "@/lib/api";
import {
  buildPreviewReport,
  defaultFormState,
  type MeridianFormState,
  type MeridianReport,
} from "@/lib/report";

export type Screen = "landing" | "analysis" | "verdict";

// Minimum time the analysis animation stays up so the full stepped sequence
// plays even when the report resolves instantly (matches analysis.tsx timeline).
const MIN_ANALYSIS_MS = 7900;

const screenTransition = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -8 },
  transition: { duration: 0.4, ease: EASE },
};

export function MeridianApp() {
  const [screen, setScreen] = useState<Screen>("landing");
  const [form, setForm] = useState<MeridianFormState>(defaultFormState);
  const [report, setReport] = useState<MeridianReport | null>(null);
  const [usedFallback, setUsedFallback] = useState(false);
  const runId = useRef(0);

  const runAnalysis = useCallback(async (inputs: MeridianFormState) => {
    const id = ++runId.current;
    setForm(inputs);
    setScreen("analysis");
    setUsedFallback(false);

    const started = Date.now();
    let nextReport: MeridianReport;
    let fallback = false;
    try {
      nextReport = await fetchReport(inputs);
    } catch {
      nextReport = buildPreviewReport(inputs);
      fallback = true;
    }

    // Keep the stepped animation visible for a beat.
    const elapsed = Date.now() - started;
    if (elapsed < MIN_ANALYSIS_MS) {
      await new Promise((r) => setTimeout(r, MIN_ANALYSIS_MS - elapsed));
    }

    // Ignore stale runs (user started another analysis meanwhile).
    if (id !== runId.current) return;
    setReport(nextReport);
    setUsedFallback(fallback);
    setScreen("verdict");
  }, []);

  const reanalyze = useCallback(
    (patch: Partial<MeridianFormState>) => {
      void runAnalysis({ ...form, ...patch });
    },
    [form, runAnalysis],
  );

  const newAnalysis = useCallback(() => {
    runId.current++;
    setScreen("landing");
  }, []);

  return (
    <>
      <Nav
        screen={screen}
        inputs={form}
        onReanalyze={reanalyze}
        onNewAnalysis={newAnalysis}
      />

      <AnimatePresence mode="wait">
        {screen === "landing" && (
          <motion.div key="landing" {...screenTransition}>
            <Landing onStart={(inputs) => runAnalysis(inputs)} defaults={form} />
          </motion.div>
        )}
        {screen === "analysis" && (
          <motion.div key="analysis" {...screenTransition}>
            <Analysis address={form.address} />
          </motion.div>
        )}
        {screen === "verdict" && report && (
          <motion.div key="verdict" {...screenTransition}>
            <Verdict report={report} usedFallback={usedFallback} />
          </motion.div>
        )}
      </AnimatePresence>

      {screen === "verdict" && report && <ChatFab report={report} />}
    </>
  );
}
