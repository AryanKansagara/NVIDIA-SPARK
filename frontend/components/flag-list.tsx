import { AlertTriangle, CircleCheckBig, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { MeridianReport } from "@/lib/report";

type FlagListProps = {
  flags: MeridianReport["flags"];
};

/* Render **bold** markdown inline */
function InlineMarkdown({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return (
    <>
      {parts.map((part, i) => {
        const m = part.match(/^\*\*([^*]+)\*\*$/);
        return m ? (
          <strong key={i} className="font-semibold">
            {m[1]}
          </strong>
        ) : (
          <span key={i}>{part}</span>
        );
      })}
    </>
  );
}

const GROUPS = [
  {
    key: "red" as const,
    title: "Risk flags",
    icon: ShieldAlert,
    wrapperClass: "border-[#EDB6A4] bg-gradient-to-br from-[#F9DDD4] to-[#F5D0C5]",
    headerClass: "text-[#9A381F]",
    itemClass: "border-[#E7B8A8]/60 bg-white/50 text-[#7A2C16]",
    dotClass: "bg-[#E16B47]",
    emptyClass: "text-[#C08070]/70",
  },
  {
    key: "yellow" as const,
    title: "Watch items",
    icon: AlertTriangle,
    wrapperClass: "border-[#E7CF84] bg-gradient-to-br from-[#F8EDC9] to-[#F3E4B5]",
    headerClass: "text-[#7B5F10]",
    itemClass: "border-[#DBC97A]/60 bg-white/50 text-[#6B4E08]",
    dotClass: "bg-[#B99239]",
    emptyClass: "text-[#B09060]/70",
  },
  {
    key: "green" as const,
    title: "Positive signals",
    icon: CircleCheckBig,
    wrapperClass: "border-[#A6CFB4] bg-gradient-to-br from-[#DDEEE3] to-[#CCE6D6]",
    headerClass: "text-[#1F5A47]",
    itemClass: "border-[#96C4A6]/60 bg-white/50 text-[#1B4D3D]",
    dotClass: "bg-[#2B6A57]",
    emptyClass: "text-[#5A9078]/70",
  },
] as const;

export function FlagList({ flags }: FlagListProps) {
  return (
    <Panel className="grid gap-4 lg:grid-cols-3">
      {GROUPS.map(({ key, title, icon: Icon, wrapperClass, headerClass, itemClass, dotClass, emptyClass }) => {
        const items = flags[key];
        return (
          <div
            key={key}
            className={`rounded-3xl border p-5 ${wrapperClass}`}
          >
            {/* Group header */}
            <div className={`flex items-center gap-2 ${headerClass}`}>
              <Icon className="h-4 w-4" />
              <p className="text-xs font-bold uppercase tracking-[0.2em]">{title}</p>
              {items.length > 0 && (
                <span className="ml-auto rounded-full bg-white/60 px-2 py-0.5 text-[10px] font-bold">
                  {items.length}
                </span>
              )}
            </div>

            {/* Flag items */}
            <div className="mt-3 space-y-2">
              {items.length === 0 ? (
                <p className={`text-xs italic ${emptyClass}`}>No flags in this category.</p>
              ) : (
                items.map((item, i) => (
                  <div
                    key={i}
                    className={`animate-slide-up flex gap-2.5 rounded-2xl border p-3 ${itemClass}`}
                    style={{ animationDelay: `${i * 60}ms` }}
                  >
                    <div className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
                    <p className="text-xs leading-[1.75]">
                      <InlineMarkdown text={item} />
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        );
      })}
    </Panel>
  );
}
