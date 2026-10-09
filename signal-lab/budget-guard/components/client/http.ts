"use client";

import { useEffect, useState } from "react";

// Tiny client helpers for the static pages that load their data from /api/* routes.

export type ApiResult<T> = { status: number; data: T };

export async function api<T = Record<string, unknown>>(url: string, init?: { method?: string; body?: unknown }): Promise<ApiResult<T>> {
  const res = await fetch(url, {
    method: init?.method ?? (init?.body !== undefined ? "POST" : "GET"),
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
    credentials: "same-origin",
    cache: "no-store",
  });
  const data = (await res.json().catch(() => ({}))) as T;
  return { status: res.status, data };
}

/** Query-string value read after mount (static pages have no searchParams at build time). undefined = not read yet. */
export function useQueryParam(name: string): string | null | undefined {
  const [value, setValue] = useState<string | null | undefined>(undefined);
  useEffect(() => {
    setValue(new URLSearchParams(window.location.search).get(name));
  }, [name]);
  return value;
}

/** Send signed-out visitors of an /app page to the sign-in page. */
export function toSignIn(): void {
  window.location.replace("/access");
}
