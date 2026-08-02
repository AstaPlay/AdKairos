import type { Metadata } from "next";

import { WhatsAppClient } from "./_components/whatsapp-client";

export const metadata: Metadata = {
  title: "Órion · WhatsApp",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h2 className="text-3xl tracking-tight">WhatsApp</h2>
        <p className="text-muted-foreground text-sm">
          Números conectados ao Órion — conecte um novo via QR Code ou código de pareamento.
        </p>
      </div>
      <WhatsAppClient />
    </div>
  );
}
