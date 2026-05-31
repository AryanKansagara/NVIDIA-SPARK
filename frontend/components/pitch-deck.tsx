"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

const SLIDES = [
  { n: 1, label: "Cover" },
  { n: 2, label: "The Stakes" },
  { n: 3, label: "Scale of GDP" },
  { n: 4, label: "Renewal Bomb" },
  { n: 5, label: "The Cascade" },
  { n: 6, label: "Root Cause" },
  { n: 7, label: "The Wrong Question" },
  { n: 8, label: "What Meridian Does" },
  { n: 9, label: "4-Agent Pipeline" },
  { n: 10, label: "NVIDIA Stack" },
  { n: 11, label: "The Data" },
  { n: 12, label: "Live Demo" },
  { n: 13, label: "Roadmap" },
  { n: 14, label: "The Ask" },
];

export function PitchDeck() {
  const [cur, setCur] = useState(1);
  const stageRef = useRef<HTMLDivElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  const total = SLIDES.length;
  const navigate = useCallback(
    (d: number) => setCur((c) => (c + d < 1 ? total : c + d > total ? 1 : c + d)),
    [total],
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (["ArrowRight", "ArrowDown", " "].includes(e.key)) {
        e.preventDefault();
        navigate(1);
      } else if (["ArrowLeft", "ArrowUp"].includes(e.key)) {
        e.preventDefault();
        navigate(-1);
      } else if (e.key === "Home") setCur(1);
      else if (e.key === "End") setCur(total);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, total]);

  useEffect(() => {
    function scale() {
      const wrap = wrapRef.current;
      const stage = stageRef.current;
      if (!wrap || !stage) return;
      const sc = Math.min(wrap.clientWidth / 1920, wrap.clientHeight / 1080);
      stage.style.transform = `scale(${sc})`;
      stage.style.left = `${(wrap.clientWidth - 1920 * sc) / 2}px`;
      stage.style.top = `${(wrap.clientHeight - 1080 * sc) / 2}px`;
    }
    scale();
    window.addEventListener("resize", scale);
    return () => window.removeEventListener("resize", scale);
  }, []);

  return (
    <div className="deck">
      <aside className="sidebar">
        {SLIDES.map((s) => (
          <button
            key={s.n}
            className={`thumb ${cur === s.n ? "active" : ""}`}
            onClick={() => setCur(s.n)}
          >
            <span className="thumb-num">{s.n}</span>
            <span className="thumb-label">{s.label}</span>
          </button>
        ))}
        <a
          href="/meridian-pitch.pdf"
          target="_blank"
          rel="noopener"
          className="thumb back"
        >
          ↓ Download PDF
        </a>
        <Link href="/" className="thumb back">
          ← Back to Meridian
        </Link>
      </aside>

      <div className="stage-wrap" ref={wrapRef}>
        <div className="stage" ref={stageRef}>
          {SLIDES.map((s) => (
            <section key={s.n} className={`frame ${cur === s.n ? "active" : ""}`}>
              <Slide n={s.n} />
            </section>
          ))}
        </div>
      </div>

      <div className="controls">
        <button className="ctrl" onClick={() => navigate(-1)}>←</button>
        <span className="counter">{cur} / {total}</span>
        <button className="ctrl" onClick={() => navigate(1)}>→</button>
      </div>

      <DeckStyles />
    </div>
  );
}

function Kicker({ children }: { children: React.ReactNode }) {
  return <div className="kicker">{children}</div>;
}

function Slide({ n }: { n: number }) {
  switch (n) {
    case 1:
      return (
        <div className="cover">
          <div className="cover-kicker">The True Cost of Ownership Agent</div>
          <div className="cover-title">Meridian</div>
          <div className="cover-tagline">The price tag is the least honest number in the room.</div>
          <div className="cover-footer">
            Buyer&apos;s advocate intelligence, run locally · <span className="mono">May 31, 2026</span>
          </div>
        </div>
      );
    case 2:
      return (
        <div className="pad">
          <Kicker>The Stakes</Kicker>
          <div className="stat-row">
            <div>
              <div className="stat-fig amber">+45%</div>
              <div className="stat-cap">Toronto mortgage arrears, year over year. Behind every figure is a family that bought on the list price.</div>
            </div>
            <div>
              <div className="stat-fig white">1.15M</div>
              <div className="stat-cap">Canadian mortgages renewing in 2026 — at rates well above what borrowers originally signed.</div>
            </div>
          </div>
          <div className="footer">The default cascade starts at step one: a buyer signs based on a number that was never the real cost.</div>
        </div>
      );
    case 3:
      return (
        <div className="pad">
          <Kicker>The Scale of Exposure</Kicker>
          <div className="headline">Canada&apos;s largest single sector. And it&apos;s under stress.</div>
          <div className="cards-3">
            {[
              { l: "Real estate, rental & leasing — StatCan", num: "13.3%", tone: "green", d: "of Canada's GDP. The single largest sector — bigger than manufacturing, oil & gas, construction, and healthcare." },
              { l: "Total residential mortgage debt", num: "$2.4T", tone: "amber", d: "Outstanding as of January 2026, up 4.8% YoY. Equivalent to 73% of Canada's entire GDP." },
              { l: "Household debt-to-disposable income", num: "$1.73", tone: "white", d: "Owed for every $1.00 earned. Canadian households are the most indebted in the G7." },
            ].map((c) => (
              <div className="scard" key={c.num}>
                <div className="scard-label">{c.l}</div>
                <div className={`scard-num ${c.tone}`}>{c.num}</div>
                <div className="scard-desc">{c.d}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case 4:
      return (
        <div className="pad">
          <Kicker>The Renewal Wave</Kicker>
          <div className="headline">1.15 million mortgages are repricing right now.</div>
          <div className="renewal">
            <div className="rcard then">
              <div className="rera">Then — 2020–2021</div>
              <div className="rrate">1.3–1.9%</div>
              <div className="rsub">Rate when signed</div>
              <div className="rdetail">Pandemic-era buyers locked in historically low rates. Payment on a $550K mortgage: roughly $2,400.</div>
            </div>
            <div className="rcard now">
              <div className="rera now-era">Now — 2026 renewal</div>
              <div className="rrate now-rate">4–5%+</div>
              <div className="rsub">Rate at renewal</div>
              <div className="rdetail">Same mortgage, same house. The payment is now $3,000–$3,200/month.</div>
              <div className="rshock">+$600–$800/mo</div>
            </div>
          </div>
        </div>
      );
    case 5:
      return (
        <div className="pad">
          <Kicker>What a Single Default Triggers</Kicker>
          <div className="headline">One bad purchase decision ripples outward.</div>
          <div className="cascade">
            {[
              { tag: "Nation", num: "13.3%", c: "white", t: "Systemic exposure" },
              { tag: "Economy", num: "$24B", c: "amber", t: "Stressed loans per 1% rise" },
              { tag: "Neighbourhood", num: "−0.9%", c: "amber", t: "Value per nearby foreclosure" },
              { tag: "Family", num: "4×", c: "red", t: "Toronto arrears since 2022" },
              { tag: "Individual", num: "0", c: "red", t: "Warning before signing" },
            ].map((x, i) => (
              <div className="cas-col" key={x.tag}>
                <div className="cas-tag">{x.tag}</div>
                <div className={`cas-num ${x.c}`}>{x.num}</div>
                <div className="cas-title">{x.t}</div>
                {i < 4 && <div className="cas-arrow">→</div>}
              </div>
            ))}
          </div>
        </div>
      );
    case 6:
      return (
        <div className="pad">
          <Kicker>Why This Keeps Happening</Kicker>
          <div className="headline">The buyer is always the last to know.</div>
          <div className="rc-layout">
            <div>
              <div className="rc-head seller">● What the seller knows</div>
              {["Heritage designation — value ceiling lower than the ask", "Active permits within 500m — density & character change", "Flood-zone intersection — insurance + resale impact", "10-year tax trajectory — +$8,400/yr by year 10"].map((t) => (
                <div className="rc-fact" key={t}>{t}</div>
              ))}
              <div className="rc-fact green-fact">True 10-year cost: <span className="mono red-text">$1,847,230</span></div>
            </div>
            <div className="rc-divider" />
            <div>
              <div className="rc-head buyer">○ What the buyer sees</div>
              <div className="rc-fact">List price: <span className="mono">$1,150,000</span></div>
              <div className="rc-fact">Estimated monthly: <span className="mono">~$4,800</span></div>
              <div className="rc-fact">Stress test: passed ✓</div>
              <div className="rc-fact hidden-fact">Heritage, flood, permits, tax… <span className="amber-text">Not disclosed.</span></div>
              <div className="rc-fact hidden-fact">True 10-year cost: <span className="red-text mono">????</span></div>
            </div>
          </div>
          <div className="footer">This isn&apos;t a rates problem or a prices problem. <b>It&apos;s an information problem — and it&apos;s structural.</b></div>
        </div>
      );
    case 7:
      return (
        <div className="pad">
          <Kicker>The Wrong Question</Kicker>
          <div className="q-table">
            <div className="q-row">
              <div className="q-label muted">Every Tool Asks</div>
              <div className="q-text">&ldquo;Can you afford the monthly payment?&rdquo;</div>
            </div>
            <div className="q-row highlight">
              <div className="q-label accent">Meridian Asks</div>
              <div className="q-text strong">&ldquo;Can you survive owning this for ten years — through rate shocks, hidden assessments and disruption — without defaulting?&rdquo;</div>
            </div>
          </div>
          <div className="footer">The list price hides a decade of cost. Meridian makes that decade visible before the offer goes in.</div>
        </div>
      );
    case 8:
      return (
        <div className="pad">
          <Kicker>What Meridian Does</Kicker>
          <div className="headline">From an address to the true cost of ownership.</div>
          <div className="io">
            <div className="io-col">
              <div className="io-label">You Enter</div>
              <div className="io-row">Toronto address <span className="mono">401 Richmond St W</span></div>
              <div className="io-row">List price <span className="mono">$1,150,000</span></div>
              <div className="io-row">Buyer profile <span className="mono">First-time</span></div>
            </div>
            <div className="io-divider"><span>4 agents · 29 datasets</span></div>
            <div className="io-col">
              <div className="io-label">Meridian Returns</div>
              <div className="io-out"><div className="io-out-l">True 10-Year Cost</div><div className="io-out-v mono">$1,847,230</div></div>
              <div className="io-out"><div className="io-out-l">Hidden Risk Flags, with Confidence</div><div className="io-out-v">3 material risks surfaced</div></div>
              <div className="io-out"><div className="io-out-l">Negotiation Leverage, in Dollars</div><div className="io-out-v mono green-text">$55,000–$75,000</div></div>
            </div>
          </div>
        </div>
      );
    case 9:
      return (
        <div className="pad">
          <Kicker>How It Works</Kicker>
          <div className="headline">A four-agent reasoning pipeline.</div>
          <div className="agents">
            {[
              { n: "Agent 01", t: "Intake & Planning", d: "Geocodes the address, classifies the property, decides which sources to query.", b: "LLAMA 3.1 8B", llm: true },
              { n: "Agent 02", t: "Retrieval", d: "Parallel async fan-out to city data. Point-in-polygon spatial joins.", b: "DETERMINISTIC", llm: false },
              { n: "Agent 03", t: "Analysis & Cost", d: "All dollar math: LTT, tax projection, mortgage scenarios. Never touches money.", b: "DETERMINISTIC", llm: false },
              { n: "Agent 04", t: "Synthesis", d: "Plain-English report and a negotiation script for every elevated flag.", b: "LLAMA 3.1 8B", llm: true },
            ].map((a) => (
              <div className="acard" key={a.n}>
                <div className="anum">{a.n}</div>
                <div className="atitle">{a.t}</div>
                <div className="adesc">{a.d}</div>
                <div className={`abadge ${a.llm ? "llm" : "det"}`}>{a.b}</div>
              </div>
            ))}
          </div>
          <div className="footer">Clean JSON contracts at every boundary — each agent upgrades independently.</div>
        </div>
      );
    case 10:
      return (
        <div className="pad">
          <Kicker>The NVIDIA Stack</Kicker>
          <div className="headline">It runs entirely on the DGX Spark.</div>
          <div className="nv">
            <div className="bullets">
              <div className="bullet"><b>Local inference via NVIDIA NIM.</b> Llama 3.1 8B on an OpenAI-compatible endpoint — no cloud round-trip.</div>
              <div className="bullet"><b>Private by design.</b> A buyer&apos;s address and finances never leave the device.</div>
              <div className="bullet"><b>Headroom to scale.</b> A config toggle swaps in a larger NIM model when needed.</div>
            </div>
            <div className="runtime">
              <div className="rt-label">Runtime</div>
              <div><div className="rt-title">ASUS GX10 · DGX Spark</div><div className="rt-sub">On-device compute — GB10</div></div>
              <div><div className="rt-title">NVIDIA NIM</div><div className="rt-sub">meta / llama-3.1-8b-instruct</div></div>
              <div><div className="rt-title">100% local</div><div className="rt-sub">Zero cloud calls at inference</div></div>
            </div>
          </div>
        </div>
      );
    case 11:
      return (
        <div className="pad">
          <Kicker>The Data Underneath</Kicker>
          <div className="data-stats">
            <div><div className="ds-num white">29</div><div className="ds-l">Toronto Open Data datasets</div></div>
            <div><div className="ds-num green">43</div><div className="ds-l">hidden cost parameters</div></div>
            <div><div className="ds-num white">3</div><div className="ds-l">signal layers, every signal tagged</div></div>
          </div>
          <div className="signals">
            {[
              { c: "green", t: "Observed", d: "Direct dataset matches — heritage designation, flood-zone intersection, active permits, LTT." },
              { c: "amber", t: "Inferred", d: "Computed from multiple observed signals — maintenance complexity, future tax pressure, intensification." },
              { c: "accent", t: "Simulated", d: "Projection scenarios — 10-year tax path, mortgage base/bear/bull, rate-shock stress." },
            ].map((s) => (
              <div className="sig" key={s.t}>
                <div className="sig-title"><span className={`sig-dot ${s.c}`} />{s.t}</div>
                <div className="sig-desc">{s.d}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case 12:
      return (
        <div className="pad">
          <div className="demo">
            <div>
              <div className="live-badge">Cut to live product</div>
              <div className="demo-label">Live Demo</div>
              <div className="demo-headline">One address.<br />The whole decade.</div>
              <div className="demo-body">We enter a real listing and watch Meridian surface the flags, the true cost, and the leverage — generated on the Spark, in front of you.</div>
            </div>
            <div className="result">
              <div className="result-head">
                <span className="result-addr">● 401 RICHMOND ST W · $1,150,000</span>
                <span className="result-pill">3 Material Risks</span>
              </div>
              <div className="lev-pre">You have negotiation leverage the seller doesn&apos;t know you know.</div>
              <div className="lev-hero">$55,000–$75,000</div>
              <div className="lev-sub">in documented price-reduction opportunity</div>
              <div className="cost-row">
                <div><div className="cc-l">True 10-Year Cost</div><div className="cc-v red-text">$1,847,230</div></div>
                <div><div className="cc-l">List Price</div><div className="cc-v">$1,150,000</div></div>
                <div><div className="cc-l">Hidden Premium</div><div className="cc-v red-text">+$697,230</div></div>
              </div>
            </div>
          </div>
        </div>
      );
    case 13:
      return (
        <div className="pad">
          <Kicker>Why It Matters &amp; Where It Goes</Kicker>
          <div className="big-quote">We break the default cascade at the one place it can still be stopped — before the offer.</div>
          <div className="timeline">
            {[
              { v: "V1 · Today", t: "Hackathon build", d: "10 core parameters, 2 composite signals, visible reasoning trace.", cur: true },
              { v: "V1.5", t: "Data expansion", d: "Transit dividend, fire inspections, tax-relief programs.", cur: false },
              { v: "V2", t: "Personal resilience", d: "Bank-verified income, emergency runway, rate-renewal stress test.", cur: false },
              { v: "V3", t: "Decision engine", d: "Full buy-vs-rent and neighbourhood recommendation.", cur: false },
            ].map((x) => (
              <div className="tl-item" key={x.v}>
                <div className={`tl-dot ${x.cur ? "active" : ""}`} />
                <div className={`tl-v ${x.cur ? "cur" : ""}`}>{x.v}</div>
                <div className="tl-t">{x.t}</div>
                <div className="tl-d">{x.d}</div>
              </div>
            ))}
          </div>
        </div>
      );
    case 14:
      return (
        <div className="cover closing">
          <div className="closing-quote">
            A buyer should walk into the room feeling like they hired a lawyer —{" "}
            <span className="green-text">not like they ran a calculator.</span>
          </div>
          <div className="ask">
            <div className="ask-label">The Ask</div>
            <div className="ask-buttons">
              <Link href="/analyze" className="btn-p">Try Meridian on your listing</Link>
              <span className="btn-g">Pilot partners — brokers &amp; first-time buyers</span>
            </div>
          </div>
        </div>
      );
    default:
      return null;
  }
}

function DeckStyles() {
  return (
    <style jsx global>{`
      .deck {
        --d-bg: #171721; --d-surface: #1E1E2A; --d-raised: #272735;
        --d-border: rgba(175,178,206,0.36); --d-faint: rgba(175,178,206,0.14);
        --d-text: #EDEDE3; --d-text2: #C3C3CC; --d-muted: #70707D;
        --d-accent: #5266EB; --d-accent-l: #CDDDFF;
        --d-green: #34D399; --d-amber: #FBBF24; --d-red: #F87171;
        position: fixed; inset: 0; display: flex; background: #0D0D14;
        font-family: var(--font-dm-sans), sans-serif; z-index: 50; overflow: hidden;
      }
      .deck .mono { font-family: var(--font-geist-mono), monospace; font-variant-numeric: tabular-nums; }
      .deck .green-text { color: var(--d-green); }
      .deck .amber-text { color: var(--d-amber); }
      .deck .red-text { color: var(--d-red); }

      .deck .sidebar { width: 150px; flex-shrink: 0; background: #0E0E18; border-right: 1px solid rgba(175,178,206,0.08); display: flex; flex-direction: column; overflow-y: auto; padding: 16px 10px; gap: 6px; }
      .deck .thumb { position: relative; cursor: pointer; border-radius: 6px; border: 2px solid transparent; background: var(--d-bg); height: 64px; padding: 6px 8px; display: flex; flex-direction: column; justify-content: flex-end; text-align: left; }
      .deck .thumb.active { border-color: var(--d-accent); }
      .deck .thumb:hover:not(.active) { border-color: rgba(175,178,206,0.25); }
      .deck .thumb-num { position: absolute; top: 4px; left: 8px; font-size: 8px; color: var(--d-muted); font-family: var(--font-geist-mono), monospace; }
      .deck .thumb-label { font-size: 9px; color: var(--d-text2); font-weight: 500; }
      .deck .thumb.back { height: auto; padding: 10px 8px; margin-top: 8px; color: var(--d-muted); font-size: 11px; justify-content: center; align-items: center; }

      .deck .stage-wrap { flex: 1; position: relative; overflow: hidden; }
      .deck .stage { position: absolute; width: 1920px; height: 1080px; transform-origin: 0 0; }
      .deck .frame { position: absolute; inset: 0; width: 1920px; height: 1080px; background: var(--d-bg); color: var(--d-text); visibility: hidden; }
      .deck .frame.active { visibility: visible; }

      .deck .controls { position: fixed; bottom: 28px; right: 36px; display: flex; align-items: center; gap: 14px; z-index: 60; }
      .deck .ctrl { width: 38px; height: 38px; border-radius: 40px; border: 1px solid var(--d-border); background: var(--d-surface); color: var(--d-text2); cursor: pointer; font-size: 16px; }
      .deck .counter { font-size: 12px; color: var(--d-muted); font-family: var(--font-geist-mono), monospace; min-width: 52px; text-align: center; }

      .deck .pad { padding: 80px 120px; height: 100%; display: flex; flex-direction: column; }
      .deck .kicker { display: flex; align-items: center; gap: 14px; font-size: 12px; font-weight: 500; color: var(--d-muted); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 40px; }
      .deck .kicker::before { content: ''; width: 28px; height: 1px; background: var(--d-muted); }
      .deck .headline { font-size: 56px; font-weight: 500; line-height: 1.1; letter-spacing: -0.02em; }
      .deck .footer { margin-top: auto; font-size: 17px; color: var(--d-muted); padding-top: 28px; border-top: 1px solid var(--d-faint); }

      .deck .cover { display: flex; flex-direction: column; justify-content: center; height: 100%; padding: 0 120px; }
      .deck .cover-kicker { font-size: 13px; font-weight: 500; color: var(--d-muted); letter-spacing: 0.16em; text-transform: uppercase; margin-bottom: 24px; }
      .deck .cover-title { font-size: 128px; font-weight: 500; letter-spacing: -0.035em; line-height: 0.95; margin-bottom: 36px; }
      .deck .cover-tagline { font-size: 28px; font-style: italic; color: var(--d-text2); }
      .deck .cover-footer { position: absolute; bottom: 60px; left: 120px; font-size: 15px; color: var(--d-muted); }

      .deck .stat-row { display: grid; grid-template-columns: 1fr 1fr; gap: 100px; flex: 1; align-items: center; }
      .deck .stat-fig { font-family: var(--font-geist-mono), monospace; font-size: 128px; font-weight: 600; line-height: 1; margin-bottom: 24px; }
      .deck .stat-fig.amber { color: var(--d-amber); } .deck .stat-fig.white { color: var(--d-text); }
      .deck .stat-cap { font-size: 20px; color: var(--d-text2); line-height: 1.55; max-width: 480px; }

      .deck .cards-3 { display: grid; grid-template-columns: repeat(3,1fr); gap: 24px; flex: 1; align-items: stretch; margin-top: 44px; }
      .deck .scard { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 20px; padding: 44px 40px; display: flex; flex-direction: column; }
      .deck .scard-label { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--d-muted); margin-bottom: 20px; }
      .deck .scard-num { font-family: var(--font-geist-mono), monospace; font-size: 88px; font-weight: 600; line-height: 1; margin-bottom: 16px; }
      .deck .scard-num.green { color: var(--d-green); } .deck .scard-num.amber { color: var(--d-amber); } .deck .scard-num.white { color: var(--d-text); }
      .deck .scard-desc { font-size: 17px; color: var(--d-text2); line-height: 1.5; }

      .deck .renewal { display: grid; grid-template-columns: 1fr 1fr; gap: 28px; margin-top: 44px; flex: 1; }
      .deck .rcard { border-radius: 20px; padding: 48px 44px; display: flex; flex-direction: column; }
      .deck .rcard.then { background: var(--d-surface); border: 1px solid var(--d-border); }
      .deck .rcard.now { background: rgba(248,113,113,0.05); border: 1px solid rgba(248,113,113,0.22); }
      .deck .rera { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 24px; color: var(--d-muted); }
      .deck .rera.now-era { color: var(--d-red); }
      .deck .rrate { font-family: var(--font-geist-mono), monospace; font-size: 80px; font-weight: 600; line-height: 1; margin-bottom: 10px; }
      .deck .rrate.now-rate { color: var(--d-red); }
      .deck .rsub { font-size: 15px; color: var(--d-muted); margin-bottom: 24px; }
      .deck .rdetail { font-size: 18px; color: var(--d-text2); line-height: 1.55; }
      .deck .rshock { font-family: var(--font-geist-mono), monospace; font-size: 40px; font-weight: 600; color: var(--d-red); margin-top: 20px; }

      .deck .cascade { display: grid; grid-template-columns: repeat(5,1fr); flex: 1; align-items: start; margin-top: 40px; gap: 18px; }
      .deck .cas-col { position: relative; padding-right: 18px; }
      .deck .cas-tag { font-size: 10px; font-weight: 500; letter-spacing: 0.16em; text-transform: uppercase; color: var(--d-muted); margin-bottom: 12px; }
      .deck .cas-num { font-family: var(--font-geist-mono), monospace; font-size: 48px; font-weight: 600; line-height: 1; margin-bottom: 10px; }
      .deck .cas-num.white { color: var(--d-text); } .deck .cas-num.amber { color: var(--d-amber); } .deck .cas-num.red { color: var(--d-red); }
      .deck .cas-title { font-size: 17px; font-weight: 500; line-height: 1.25; }
      .deck .cas-arrow { position: absolute; top: 30px; right: -6px; color: var(--d-border); font-size: 18px; }

      .deck .rc-layout { display: grid; grid-template-columns: 1fr 1px 1fr; gap: 64px; flex: 1; align-items: start; margin-top: 40px; }
      .deck .rc-divider { background: var(--d-faint); align-self: stretch; }
      .deck .rc-head { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 20px; }
      .deck .rc-head.seller { color: var(--d-muted); } .deck .rc-head.buyer { color: var(--d-accent-l); }
      .deck .rc-fact { border-radius: 12px; padding: 14px 18px; margin-bottom: 8px; background: var(--d-surface); border: 1px solid var(--d-border); font-size: 15px; color: var(--d-text2); line-height: 1.4; }
      .deck .rc-fact.green-fact { background: rgba(52,211,153,0.06); border-color: rgba(52,211,153,0.2); }
      .deck .rc-fact.hidden-fact { background: rgba(248,113,113,0.05); border-color: rgba(248,113,113,0.18); }

      .deck .q-table { flex: 1; display: flex; flex-direction: column; justify-content: center; }
      .deck .q-row { display: grid; grid-template-columns: 240px 1fr; gap: 72px; align-items: start; padding: 52px 0; }
      .deck .q-row + .q-row { border-top: 1px solid var(--d-faint); }
      .deck .q-label { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; padding-top: 8px; }
      .deck .q-label.muted { color: var(--d-muted); } .deck .q-label.accent { color: var(--d-accent-l); }
      .deck .q-text { font-size: 34px; line-height: 1.3; color: var(--d-muted); }
      .deck .q-text.strong { color: var(--d-text); font-weight: 500; font-size: 36px; }

      .deck .io { display: grid; grid-template-columns: 1fr 88px 1fr; flex: 1; align-items: center; margin-top: 48px; }
      .deck .io-label { font-size: 11px; font-weight: 500; letter-spacing: 0.14em; text-transform: uppercase; color: var(--d-muted); margin-bottom: 18px; }
      .deck .io-row { display: flex; justify-content: space-between; align-items: center; background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 12px; padding: 18px 22px; margin-bottom: 8px; font-size: 17px; color: var(--d-text2); }
      .deck .io-divider { display: flex; align-items: center; justify-content: center; }
      .deck .io-divider span { writing-mode: vertical-rl; transform: rotate(180deg); font-size: 11px; color: var(--d-muted); }
      .deck .io-out { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 12px; padding: 20px 24px; margin-bottom: 8px; }
      .deck .io-out-l { font-size: 10px; font-weight: 500; color: var(--d-muted); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 8px; }
      .deck .io-out-v { font-size: 20px; font-weight: 500; }

      .deck .agents { display: grid; grid-template-columns: repeat(4,1fr); gap: 20px; flex: 1; align-items: stretch; margin-top: 48px; }
      .deck .acard { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 16px; padding: 32px 28px; display: flex; flex-direction: column; gap: 14px; }
      .deck .anum { font-family: var(--font-geist-mono), monospace; font-size: 13px; color: var(--d-muted); }
      .deck .atitle { font-size: 24px; font-weight: 500; }
      .deck .adesc { font-size: 15px; color: var(--d-text2); line-height: 1.6; flex: 1; }
      .deck .abadge { display: inline-block; padding: 7px 16px; border-radius: 40px; font-size: 12px; font-weight: 500; font-family: var(--font-geist-mono), monospace; align-self: flex-start; }
      .deck .abadge.llm { background: rgba(82,102,235,0.18); color: var(--d-accent-l); }
      .deck .abadge.det { background: var(--d-raised); color: var(--d-muted); }

      .deck .nv { display: grid; grid-template-columns: 1fr 1fr; gap: 80px; flex: 1; align-items: center; margin-top: 20px; }
      .deck .bullets { display: flex; flex-direction: column; gap: 32px; }
      .deck .bullet { font-size: 19px; color: var(--d-text2); line-height: 1.55; padding-left: 22px; position: relative; }
      .deck .bullet::before { content: ''; position: absolute; left: 0; top: 11px; width: 8px; height: 8px; border-radius: 50%; background: var(--d-green); }
      .deck .bullet b { color: var(--d-text); }
      .deck .runtime { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 16px; padding: 44px 40px; display: flex; flex-direction: column; gap: 28px; }
      .deck .rt-label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--d-muted); }
      .deck .rt-title { font-family: var(--font-geist-mono), monospace; font-size: 22px; font-weight: 600; }
      .deck .rt-sub { font-size: 14px; color: var(--d-muted); }

      .deck .data-stats { display: grid; grid-template-columns: repeat(3,1fr); gap: 60px; margin-top: 56px; margin-bottom: 64px; }
      .deck .ds-num { font-family: var(--font-geist-mono), monospace; font-size: 100px; font-weight: 600; line-height: 1; margin-bottom: 14px; }
      .deck .ds-num.white { color: var(--d-text); } .deck .ds-num.green { color: var(--d-green); }
      .deck .ds-l { font-size: 18px; color: var(--d-text2); }
      .deck .signals { display: grid; grid-template-columns: repeat(3,1fr); gap: 16px; }
      .deck .sig { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 16px; padding: 28px 26px; }
      .deck .sig-title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 500; margin-bottom: 14px; }
      .deck .sig-dot { width: 10px; height: 10px; border-radius: 50%; }
      .deck .sig-dot.green { background: var(--d-green); } .deck .sig-dot.amber { background: var(--d-amber); } .deck .sig-dot.accent { background: var(--d-accent); }
      .deck .sig-desc { font-size: 15px; color: var(--d-text2); line-height: 1.6; }

      .deck .demo { display: grid; grid-template-columns: 1fr 1.15fr; gap: 72px; height: 100%; align-items: center; padding: 80px 120px; }
      .deck .live-badge { display: inline-flex; align-items: center; gap: 8px; background: rgba(82,102,235,0.18); border: 1px solid rgba(82,102,235,0.35); color: var(--d-accent-l); font-size: 14px; padding: 8px 18px; border-radius: 40px; margin-bottom: 28px; }
      .deck .demo-label { font-size: 11px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--d-muted); margin-bottom: 16px; }
      .deck .demo-headline { font-size: 56px; font-weight: 500; line-height: 1.1; margin-bottom: 24px; }
      .deck .demo-body { font-size: 18px; color: var(--d-text2); line-height: 1.6; }
      .deck .result { background: var(--d-surface); border: 1px solid var(--d-border); border-radius: 20px; padding: 36px; }
      .deck .result-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 22px; }
      .deck .result-addr { font-size: 13px; color: var(--d-muted); }
      .deck .result-pill { background: rgba(248,113,113,0.12); border: 1px solid rgba(248,113,113,0.3); color: var(--d-red); font-size: 11px; font-weight: 500; padding: 5px 12px; border-radius: 40px; text-transform: uppercase; }
      .deck .lev-pre { font-size: 16px; color: var(--d-text2); margin-bottom: 14px; }
      .deck .lev-hero { font-family: var(--font-geist-mono), monospace; font-size: 76px; font-weight: 600; color: var(--d-green); line-height: 1; margin-bottom: 8px; }
      .deck .lev-sub { font-size: 15px; font-style: italic; color: var(--d-text2); margin-bottom: 28px; }
      .deck .cost-row { display: grid; grid-template-columns: repeat(3,1fr); gap: 20px; border-top: 1px solid var(--d-faint); padding-top: 22px; }
      .deck .cc-l { font-size: 10px; color: var(--d-muted); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 6px; }
      .deck .cc-v { font-family: var(--font-geist-mono), monospace; font-size: 19px; font-weight: 600; }

      .deck .big-quote { font-size: 58px; font-weight: 500; line-height: 1.15; max-width: 1480px; margin-bottom: auto; }
      .deck .timeline { display: grid; grid-template-columns: repeat(4,1fr); padding-top: 36px; }
      .deck .tl-item { position: relative; padding-right: 24px; }
      .deck .tl-dot { width: 18px; height: 18px; border-radius: 50%; border: 2px solid var(--d-border); background: var(--d-bg); margin-bottom: 18px; }
      .deck .tl-dot.active { background: var(--d-green); border-color: var(--d-green); box-shadow: 0 0 0 4px rgba(52,211,153,0.15); }
      .deck .tl-v { font-family: var(--font-geist-mono), monospace; font-size: 13px; font-weight: 500; color: var(--d-muted); margin-bottom: 6px; }
      .deck .tl-v.cur { color: var(--d-green); }
      .deck .tl-t { font-size: 22px; font-weight: 500; margin-bottom: 8px; }
      .deck .tl-d { font-size: 15px; color: var(--d-text2); line-height: 1.55; }

      .deck .closing { justify-content: center; }
      .deck .closing-quote { font-size: 68px; font-weight: 500; line-height: 1.18; letter-spacing: -0.025em; max-width: 1360px; }
      .deck .ask { position: absolute; bottom: 64px; left: 120px; }
      .deck .ask-label { font-size: 11px; font-weight: 500; color: var(--d-muted); letter-spacing: 0.14em; text-transform: uppercase; margin-bottom: 16px; }
      .deck .ask-buttons { display: flex; align-items: center; gap: 12px; }
      .deck .btn-p { background: var(--d-accent); color: #fff; font-size: 16px; padding: 14px 30px; border-radius: 40px; }
      .deck .btn-g { color: var(--d-text2); font-size: 16px; padding: 14px 30px; border-radius: 40px; border: 1px solid var(--d-border); }
    `}</style>
  );
}
