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
      <input id="start-address" type="text" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="敷地の住所（例：浜松市中央区元城町103-2）" autoComplete="street-address" />
      <button type="submit" className="btn btn-scan">
        調べる<span aria-hidden>➤</span>
      </button>
    </form>
  );
}
