import { Suspense } from "react";

import type { Metadata } from "next";

import { Skeleton } from "@/components/ui/skeleton";

import { InstagramClient } from "./_components/instagram-client";

export const metadata: Metadata = {
  title: "Órion · Instagram",
};

export default function Page() {
  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <div className="space-y-1">
        <h1 className="font-semibold text-2xl tracking-tight">Instagram</h1>
        <p className="text-muted-foreground text-sm">
          Conexão da conta Instagram Business usada pelo Órion para atendimento automático de DMs e comentários.
        </p>
      </div>

      <Suspense fallback={<Skeleton className="h-56 w-full rounded-xl" />}>
        <InstagramClient />
      </Suspense>
    </div>
  );
}
