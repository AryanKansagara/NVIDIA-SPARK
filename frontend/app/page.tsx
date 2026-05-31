import { ChatbotDock } from "@/components/chatbot-dock";
import { Header } from "@/components/header";
import { Hero } from "@/components/hero";
import { MapPreview } from "@/components/map-preview";
import { Workbench } from "@/components/workbench";

export default function Home() {
  return (
    <main className="mx-auto flex min-h-screen w-full max-w-7xl flex-col gap-6 px-4 py-6 md:px-6 md:py-8">
      <Header />
      <Hero />
      <Workbench />
      <MapPreview />
      <ChatbotDock />
    </main>
  );
}
