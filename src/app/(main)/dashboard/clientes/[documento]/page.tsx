import type { Metadata } from "next";

import { ClienteDetailClient } from "./_components/cliente-detail-client";

export const metadata: Metadata = {
  title: "Cliente",
};

export default async function Page({ params }: { params: Promise<{ documento: string }> }) {
  const { documento } = await params;
  return <ClienteDetailClient documento={documento} />;
}
