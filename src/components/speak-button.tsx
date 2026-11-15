"use client";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Plays `text` in Jarvis's voice. `getToken` returns the signed-in user's Supabase access token.
 * Pressing it again while it plays stops the audio.
 */
export function SpeakButton({ text, getToken, disabled }: { text: string; getToken: () => Promise<string | null>; disabled?: boolean }) {
  const [state, setState] = useState<"idle" | "loading" | "playing" | "error">("idle");
  const audio = useRef<HTMLAudioElement | null>(null);
  const url = useRef<string | null>(null);

  const stop = () => {
    audio.current?.pause();
    audio.current = null;
    if (url.current) URL.revokeObjectURL(url.current);
    url.current = null;
  };
  useEffect(() => stop, []);

  async function toggle() {
    if (state === "playing") { stop(); setState("idle"); return; }
    setState("loading");
    try {
      const token = await getToken();
      const response = await fetch("/api/speech", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token ?? ""}` },
        body: JSON.stringify({ text }),
      });
      if (!response.ok) throw new Error(String(response.status));
      stop();
      url.current = URL.createObjectURL(await response.blob());
      const player = new Audio(url.current);
      audio.current = player;
      player.onended = () => setState("idle");
      player.onerror = () => setState("error");
      await player.play();
      setState("playing");
    } catch {
      stop();
      setState("error");
    }
  }

  const label = state === "loading" ? "Loading…" : state === "playing" ? "Stop" : state === "error" ? "Couldn’t play" : "Listen";
  return (
    <Button type="button" variant="ghost" disabled={disabled || state === "loading"} onClick={() => void toggle()} aria-label={`${label}: ${text}`}>
      {label}
    </Button>
  );
}
