"use client";

import { useQueryParam } from "./http";

/** Shows `text` when ?{param} is present (e.g. /pricing?canceled=1) without making the page dynamic. */
export function QueryNotice({ param, text }: { param: string; text: string }) {
  return useQueryParam(param) ? <p className="notice">{text}</p> : null;
}
