"use client";

import { useState } from "react";
import { House, KeyRound, Plus, Wifi, ArrowRight, Lightbulb, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

function AppleMark() {
  return <svg viewBox="0 0 24 24" width="20" height="24" fill="currentColor" aria-hidden="true"><path d="M17.1 12.5c0-2 1.6-3 1.7-3.1-1-1.5-2.6-1.7-3.2-1.7-1.4-.2-2.7.8-3.4.8-.7 0-1.8-.8-2.9-.8-1.5 0-3 .9-3.8 2.3-1.6 2.8-.4 7 1.2 9.3.8 1.1 1.6 2.2 2.7 2.1 1.1 0 1.5-.7 2.9-.7 1.3 0 1.7.7 2.9.7 1.2 0 1.9-1.1 2.6-2.1.9-1.3 1.3-2.6 1.3-2.7-.1 0-2-.8-2-4.1ZM14.8 6.2c.6-.8 1.1-1.9 1-3-.9 0-2.1.6-2.8 1.4-.6.7-1.2 1.8-1 2.9 1 .1 2.1-.5 2.8-1.3Z" /></svg>;
}

/** Presentation-only connection concepts. No account, network, or credential requests. */
export function HomeConnections() {
  const [method, setMethod] = useState<"key" | "wifi">("key");
  const [applePreview, setApplePreview] = useState(false);
  const [notice, setNotice] = useState("");
  return (
    <div className="home-connections">
      <section className="connection-card apple-home" aria-labelledby="apple-home-title">
        <div className="connection-top"><span className="connection-icon"><House size={24} /></span><span className="connection-badge">COMING SOON</span></div>
        <span className="eyebrow">YOUR HOME, TOGETHER</span>
        <h2 id="apple-home-title">Add Home</h2>
        <p>Bring the accessories from your iPhone’s Home app into one familiar place.</p>
        <div className="accessory-preview" aria-hidden="true"><span><Lightbulb size={18} /> Lights</span><span><ShieldCheck size={18} /> Security</span><span><House size={18} /> Rooms</span></div>
        <button type="button" className="apple-connect" onClick={() => setApplePreview(!applePreview)} aria-expanded={applePreview} aria-controls="apple-home-preview"><AppleMark /> Continue with Apple <ArrowRight size={17} /></button>
        <p className="connection-footnote">Apple Account connection · UI preview</p>
        {applePreview && <div id="apple-home-preview" className="connection-feedback" role="status"><strong>Your home starts here.</strong><p>This preview shows where you’ll connect your Apple Account and choose a home. Apple sign-in and accessory sync aren’t available yet.</p></div>}
      </section>

      <section className="connection-card" aria-labelledby="manual-accessory-title">
        <div className="connection-top"><span className="connection-icon"><Plus size={24} /></span><span className="connection-badge">UI PREVIEW</span></div>
        <span className="eyebrow">MAKE ROOM FOR MORE</span>
        <h2 id="manual-accessory-title">Add an accessory</h2>
        <p>Explore a direct connection with a device API key or your home Wi-Fi.</p>
        <div className="connection-method" role="group" aria-label="Connection method">
          <button type="button" aria-pressed={method === "key"} onClick={() => { setMethod("key"); setNotice(""); }}><KeyRound size={15} /> API key</button>
          <button type="button" aria-pressed={method === "wifi"} onClick={() => { setMethod("wifi"); setNotice(""); }}><Wifi size={15} /> Wi-Fi</button>
        </div>
        <form className="accessory-form" onSubmit={event => { event.preventDefault(); setNotice("Preview complete. No accessory was added or connected."); }}>
          <label>Accessory name<input required name="accessoryName" placeholder="e.g. Living room lamp" maxLength={80} autoComplete="off" /></label>
          {method === "key" ? <label>Device API key<input key="key" type="password" placeholder="Demo key — do not enter a real key" autoComplete="off" aria-describedby="connection-demo-note" /></label> : <label>Home Wi-Fi network<input key="wifi" placeholder="e.g. My home network" autoComplete="off" aria-describedby="connection-demo-note" /></label>}
          <p id="connection-demo-note" className="connection-footnote">Demo only. Nothing is sent or saved; no network scan runs.</p>
          <Button type="submit" variant="outline"><Plus size={16} /> Preview accessory</Button>
          {notice && <p className="connection-feedback" role="status">{notice}</p>}
        </form>
      </section>
    </div>
  );
}
