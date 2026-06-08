import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { APIS, type MarketplaceAPI } from "../_data";
import { providerSlug } from "../_helpers";
import APIDetail from "./APIDetail";

export async function generateStaticParams() {
  return APIS.filter(a => a.status === "live").map(a => ({ id: a.id }));
}

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const api = APIS.find(a => a.id === id);
  if (!api) return { title: "API not found · Blue Hub" };
  return {
    title:       `${api.name} · ${api.provider} · Blue Agent`,
    description: api.desc,
  };
}

export default async function ApiPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const api = APIS.find(a => a.id === id);
  if (!api || api.status !== "live") notFound();

  const related: MarketplaceAPI[] = APIS
    .filter(a => a.status === "live" && a.id !== api.id && a.category === api.category)
    .slice(0, 4);

  return <APIDetail api={api} related={related} />;
}
