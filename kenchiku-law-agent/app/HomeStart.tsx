"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** The address box on the home page: one field, straight into the check. */
export default function HomeStart() {
  const router = useRouter();
  const [address, setAddress] = useState("");
  const go = () => {
    const a = address.trim();
    router.push(a.length >= 3 ? `/consult?address=${encodeURIComponent(a)}&from=home` : "/consult");
  };
  return (
    <form
      className="start"
      onSubmit={(e) => {
        e.preventDefault();
        go();
      }}
    >
      <label htmlFor="start-address" className="sr-only">
        敷地の住所
      </label>
      <span className="start-pin" aria-hidden>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21z" />
          <circle cx="12" cy="9.5" r="2.5" />
        </svg>
      </span>
      <input id="start-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="敷地の住所（例：浜松市中央区元城町103-2）" autoComplete="street-address" />
      <button type="submit" className="btn btn-scan">
        <span>SCAN</span>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M5 12h14M13 6l6 6-6 6" />
        </svg>
      </button>
    </form>
  );
}
