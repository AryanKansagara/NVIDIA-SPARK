import { AlertTriangle, CircleCheckBig, ShieldAlert } from "lucide-react";
import { Panel } from "@/components/ui/panel";
import type { MeridianReport } from "@/lib/report";

type FlagListProps = {
  flags: MeridianReport["flags"];
};

export function FlagList({ flags }: FlagListProps) {
  const groups = [
    {
      title: "Red flags",
      items: flags.red,
      icon: ShieldAlert,
      accent: "text-[#9A381F] bg-[#F9DDD4] border-[#EDB6A4]",
    },
    {
      title: "Yellow flags",
      items: flags.yellow,
      icon: AlertTriangle,
      accent: "text-[#7B5F10] bg-[#F8EDC9] border-[#E7CF84]",
    },
    {
      title: "Green signals",
      items: flags.green,
      icon: CircleCheckBig,
      accent: "text-[#1F5A47] bg-[#DDEEE3] border-[#A6CFB4]",
    },
  ];

  return (
    <Panel className="grid gap-4 lg:grid-cols-3">
      {groups.map(({ title, items, icon: Icon, accent }) => (
        <div key={title} className={`rounded-3xl border p-5 ${accent}`}>
          <div className="flex items-center gap-2">
            <Icon className="h-4 w-4" />
            <p className="text-sm font-semibold uppercase tracking-[0.18em]">
              {title}
            </p>
          </div>
          <div className="mt-4 space-y-3">
            {items.map((item) => (
              <p key={item} className="text-sm leading-6">
                {item}
              </p>
            ))}
          </div>
        </div>
      ))}
    </Panel>
  );
}
