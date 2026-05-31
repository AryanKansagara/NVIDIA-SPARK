import { Hero } from "@/components/hero";
import { Workbench } from "@/components/workbench";

export default function Home() {
  return (
    <div className="flex flex-col gap-6">
      <Hero />
      <Workbench />
    </div>
  );
}
