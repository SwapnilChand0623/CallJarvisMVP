"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, CameraOff, Car, Flame, House, Lightbulb, Plane, RotateCcw } from "lucide-react";
import { useAccount } from "@/components/account-provider";
import { Button } from "@/components/ui/button";
import { PROPS, type Prop, type PropKey } from "@/lib/home/props";
import "./simulator.css";

type Device = { id: string; name: string; kind: "light" | "stove"; on: boolean };
type HomeEvent = { id: string; type: string; severity: string; description: string; occurredAt: string; outreachEligible: boolean; acknowledgedAt: string | null };
type State = { mode: "home" | "away"; devices: Device[]; events: HomeEvent[]; props: Prop[]; cooldownSeconds: number };

const LOOK_EVERY_MS = 2000;
/** The picture sent into an alert call: small and slow enough to relay cheaply. */
const FEED_WIDTH = 320;
const FEED_FPS = 12;
/** A prop must be seen in this many looks in a row before it counts. */
const LOOKS_NEEDED = 2;

/** Mean brightness change between two small greyscale frames, 0 to 255. */
function difference(a: Uint8ClampedArray, b: Uint8ClampedArray) {
  let total = 0;
  for (let i = 0; i < a.length; i += 4) total += Math.abs(a[i] - b[i]);
  return total / (a.length / 4);
}

export default function Simulator() {
  const { client, user } = useAccount();
  const [state, setState] = useState<State | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");
  const [watching, setWatching] = useState(false);
  const [look, setLook] = useState("Camera is off.");
  const [onCall, setOnCall] = useState(false);
  const video = useRef<HTMLVideoElement>(null);
  const streaks = useRef<Record<string, number>>({});
  const lastThumb = useRef<Uint8ClampedArray | null>(null);
  const quietLooks = useRef(0);

  const call = useCallback(async (path: string, body?: unknown) => {
    const token = (await client?.auth.getSession())?.data.session?.access_token ?? "";
    const response = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      headers: { Authorization: `Bearer ${token}`, ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.error || `HTTP ${response.status}`);
    return payload;
  }, [client]);

  const refresh = useCallback(async () => {
    try {
      setState(await call("/api/home"));
      setError("");
    } catch (err) {
      setError(err instanceof Error && err.message === "store_unavailable" ? "The home simulator is not connected to the database." : "We couldn’t load the home. Retrying…");
    }
  }, [call]);

  // Jarvis changes devices during a call, so the page keeps itself current.
  useEffect(() => {
    if (!client || !user) return;
    const first = setTimeout(() => void refresh(), 0);
    const timer = setInterval(() => void refresh(), 2000);
    return () => { clearTimeout(first); clearInterval(timer); };
  }, [client, user, refresh]);

  const act = async (body: Record<string, unknown>, done?: (payload: { result?: { recorded: boolean; willCall?: boolean; reason?: string; retryInSeconds?: number } }) => string) => {
    setBusy(true);
    setNote("");
    try {
      const payload = await call("/api/home", body);
      if (payload.state) setState(payload.state);
      if (done) setNote(done(payload));
    } catch {
      setNote("That didn’t go through. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  const trigger = useCallback(async (prop: PropKey, label: string) => {
    try {
      const payload = await call("/api/home", { action: "trigger", prop });
      if (payload.state) setState(payload.state);
      const result = payload.result;
      setNote(result.recorded
        ? result.willCall ? `${label}: recorded. The home is Away, so Jarvis is calling.` : `${label}: recorded. The home is set to Home, so there is no call.`
        : `${label}: already reported. It can alert again in ${result.retryInSeconds} s.`);
    } catch {
      setNote("That didn’t go through. Please try again.");
    }
  }, [call]);

  // The camera: look every couple of seconds, and only spend a request when the picture has changed
  // or a prop is part-way to being confirmed.
  useEffect(() => {
    if (!watching) return;
    let alive = true;
    let stream: MediaStream | null = null;
    let timer: ReturnType<typeof setInterval> | undefined;
    let lookingNow = false;
    const frame = document.createElement("canvas");
    const thumb = document.createElement("canvas");
    thumb.width = 32; thumb.height = 18;

    const lookOnce = async () => {
      const element = video.current;
      if (!alive || lookingNow || !element || element.videoWidth === 0) return;
      const small = thumb.getContext("2d", { willReadFrequently: true });
      if (!small) return;
      small.drawImage(element, 0, 0, thumb.width, thumb.height);
      const pixels = small.getImageData(0, 0, thumb.width, thumb.height).data;
      const changed = !lastThumb.current || difference(pixels, lastThumb.current) > 5;
      const pending = Object.values(streaks.current).some((count) => count > 0 && count < LOOKS_NEEDED);
      quietLooks.current = changed || pending ? 0 : quietLooks.current + 1;
      if (!changed && !pending && quietLooks.current % 5 !== 0) return; // nothing new: check in only now and then
      lastThumb.current = pixels;

      frame.width = 512;
      frame.height = Math.round((512 * element.videoHeight) / element.videoWidth);
      frame.getContext("2d")?.drawImage(element, 0, 0, frame.width, frame.height);
      lookingNow = true;
      try {
        const { seen } = (await call("/api/home/vision", { image: frame.toDataURL("image/jpeg", 0.6) })) as { seen: PropKey[] };
        if (!alive) return;
        for (const prop of PROPS) {
          const count = seen.includes(prop.key) ? (streaks.current[prop.key] ?? 0) + 1 : 0;
          streaks.current[prop.key] = count;
          if (count === LOOKS_NEEDED) void trigger(prop.key, prop.label);
        }
        const names = PROPS.filter((prop) => seen.includes(prop.key)).map((prop) => prop.label);
        setLook(names.length ? `Sees: ${names.join(", ")}.` : "Watching. Nothing on the prop map in view.");
      } catch (err) {
        if (!alive) return;
        const code = err instanceof Error ? err.message : "";
        setLook(code === "vision_not_configured" ? "The camera can’t recognize props yet: GEMINI_API_KEY is not set on the server. Use the buttons below."
          : code === "too_many_requests" ? "Watching (pausing briefly)."
          : code === "vision_busy" ? "Watching. Gemini is busy right now; trying again."
          : code === "vision_slow" ? "Watching. Gemini took too long to answer; trying again."
          : "Watching. The last look failed; trying again.");
      } finally {
        lookingNow = false;
      }
    };

    // On an alert call, this camera is shown live on the FaceTime Video call. The page checks for a live call,
    // joins its room with a publish-only token and streams a small copy of the picture until the call ends.
    type CallRoom = { disconnect(): Promise<void> };
    let callRoom: CallRoom | null = null;
    let callRoomName = "";
    let syncing = false;
    let drawTimer: ReturnType<typeof setInterval> | undefined;
    let feedTrack: MediaStreamTrack | null = null;
    const leaveCall = async () => {
      clearInterval(drawTimer);
      feedTrack?.stop();
      feedTrack = null;
      const room = callRoom;
      callRoom = null;
      callRoomName = "";
      if (alive) setOnCall(false);
      await room?.disconnect().catch(() => {});
    };
    const syncCall = async () => {
      const element = video.current;
      if (!alive || syncing || !element || element.videoWidth === 0) return;
      syncing = true;
      try {
        const session = (await call("/api/home/camera", {})) as { live: boolean; url?: string; token?: string; room?: string };
        if (!alive) return;
        if (!session.live) { if (callRoom) await leaveCall(); return; }
        if (callRoomName === session.room) return;
        await leaveCall();
        const { Room, RoomEvent, Track } = await import("livekit-client");
        // A canvas copy keeps the feed small without touching the camera's own resolution, which the prop
        // recognition still needs.
        const canvas = document.createElement("canvas");
        canvas.width = FEED_WIDTH;
        canvas.height = Math.round((FEED_WIDTH * element.videoHeight) / element.videoWidth / 2) * 2;
        const pen = canvas.getContext("2d");
        const draw = () => pen?.drawImage(element, 0, 0, canvas.width, canvas.height);
        draw();
        drawTimer = setInterval(draw, 1000 / FEED_FPS);
        const track = canvas.captureStream(FEED_FPS).getVideoTracks()[0];
        const room = new Room({ adaptiveStream: false, dynacast: false });
        try {
          await room.connect(session.url!, session.token!, { autoSubscribe: false });
          await room.localParticipant.publishTrack(track, {
            source: Track.Source.Camera, simulcast: false, videoCodec: "vp8",
            videoEncoding: { maxBitrate: 200_000, maxFramerate: FEED_FPS },
          });
        } catch (error) {
          clearInterval(drawTimer);
          track.stop();
          await room.disconnect().catch(() => {});
          throw error;
        }
        if (!alive) { clearInterval(drawTimer); track.stop(); await room.disconnect().catch(() => {}); return; }
        feedTrack = track;
        callRoom = room;
        callRoomName = session.room!;
        setOnCall(true);
        // The room closes when the call ends.
        room.on(RoomEvent.Disconnected, () => { if (callRoom === room) void leaveCall(); });
      } catch {
        // Not reachable right now: the next check tries again.
      } finally {
        syncing = false;
      }
    };
    let callTimer: ReturnType<typeof setInterval> | undefined;

    void (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 } }, audio: false });
        if (!alive) { stream.getTracks().forEach((track) => track.stop()); return; }
        if (video.current) { video.current.srcObject = stream; await video.current.play().catch(() => {}); }
        setLook("Watching. Nothing on the prop map in view.");
        timer = setInterval(() => void lookOnce(), LOOK_EVERY_MS);
        callTimer = setInterval(() => void syncCall(), 2000);
      } catch {
        if (alive) { setLook("Camera access was blocked. Allow the camera for this site, or use the buttons below."); setWatching(false); }
      }
    })();
    // Keep the phone awake while it is acting as the camera.
    let wake: { release(): Promise<void> } | null = null;
    const wakeLock = (navigator as Navigator & { wakeLock?: { request(type: "screen"): Promise<{ release(): Promise<void> }> } }).wakeLock;
    void wakeLock?.request("screen").then((lock) => { if (alive) wake = lock; else void lock.release(); }).catch(() => {});

    return () => {
      alive = false;
      clearInterval(timer);
      clearInterval(callTimer);
      void leaveCall();
      setOnCall(false);
      stream?.getTracks().forEach((track) => track.stop());
      void wake?.release().catch(() => {});
      streaks.current = {};
      lastThumb.current = null;
    };
  }, [watching, call, trigger]);

  if (!state) {
    return <p className="quiet-empty" role="status">{error || "Opening the home simulator…"}</p>;
  }
  const away = state.mode === "away";
  const stove = state.devices.find((device) => device.kind === "stove");
  const porch = state.devices.find((device) => device.kind === "light");
  const car = state.events.find((event) => event.type === "vehicle_in_driveway" && !event.acknowledgedAt);

  return (
    <div className="sim">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DEMO · EVERYTHING HERE IS SIMULATED</span>
          <h1>Home simulator<span className="accent">.</span></h1>
          <p>Props stand in for sensors. While the home is Away, Jarvis calls about what it sees.</p>
        </div>
        <Button variant="outline" disabled={busy} onClick={() => void act({ action: "reset" }, () => "Reset: Home mode, everything off, alerts cleared.")}>
          <RotateCcw size={15} /> Reset
        </Button>
      </div>
      {error && <p className="flow-error" role="alert">{error}</p>}

      <section className="sim-card">
        <div className="sim-mode" role="group" aria-label="Home mode">
          <button className={away ? "" : "active"} disabled={busy} aria-pressed={!away} onClick={() => void act({ action: "setMode", mode: "home" })}>
            <House size={18} /> Home
          </button>
          <button className={away ? "active away" : ""} disabled={busy} aria-pressed={away} onClick={() => void act({ action: "setMode", mode: "away" })}>
            <Plane size={18} /> Away
          </button>
        </div>
        <p className="sim-hint">
          {away ? "Away: an event on the prop map is critical, and Jarvis calls you about it." : "Home: events are added to the feed only. Jarvis does not call."}
        </p>
      </section>

      <section className="sim-grid" aria-label="Virtual home">
        <button className={`sim-tile stove ${stove?.on ? "on" : ""}`} disabled={busy || !stove}
          onClick={() => stove && void act({ action: "setDevice", deviceId: stove.id, on: !stove.on })}>
          <Flame size={34} />
          <strong>{stove?.name ?? "Stove"}</strong>
          <span>{stove?.on ? "On" : "Off"}</span>
        </button>
        <button className={`sim-tile light ${porch?.on ? "on" : ""}`} disabled={busy || !porch}
          onClick={() => porch && void act({ action: "setDevice", deviceId: porch.id, on: !porch.on })}>
          <Lightbulb size={34} />
          <strong>{porch?.name ?? "Porch light"}</strong>
          <span>{porch?.on ? "On" : "Off"}</span>
        </button>
        <div className={`sim-tile drive ${car ? "on" : ""}`}>
          <Car size={34} />
          <strong>Driveway</strong>
          <span>{car ? "Car present" : "Empty"}</span>
        </div>
      </section>

      <section className="sim-card">
        <div className="sim-row">
          <h2>Camera</h2>
          <Button variant={watching ? "outline" : "default"} onClick={() => setWatching(!watching)}>
            {watching ? <><CameraOff size={15} /> Stop camera</> : <><Camera size={15} /> Start camera</>}
          </Button>
        </div>
        <video ref={video} className={watching ? "sim-video" : "sim-video off"} muted playsInline aria-label="Camera preview" />
        {watching && onCall && <p className="sim-live" role="status"><span aria-hidden />Live on the call: Jarvis is showing this camera on FaceTime.</p>}
        <p className="sim-hint" role="status">{look}</p>
        <p className="sim-small">Frames are sent to Gemini to check for the props below, and are not stored. A prop counts after two looks in a row.</p>
        <p className="sim-small">When Jarvis calls about a critical alert, it is a FaceTime Video call that shows this camera live while it is on. On a FaceTime Video call you place, ask Jarvis to show the camera. Run the camera on a different device from the phone that takes the call: a phone pauses its camera when FaceTime rings.</p>
      </section>

      <section className="sim-card">
        <h2>Prop map</h2>
        <div className="sim-props">
          {state.props.map((prop) => (
            <div className="sim-prop" key={prop.key}>
              <div>
                <strong>{prop.label}</strong>
                <span>stands for: {prop.standsFor}</span>
              </div>
              <Button variant="ghost" disabled={busy} onClick={() => { setBusy(true); void trigger(prop.key, prop.label).finally(() => setBusy(false)); }}>
                Trigger
              </Button>
            </div>
          ))}
        </div>
        {note && <p className="sim-hint" role="status">{note}</p>}
        <p className="sim-small">The same event can alert once every {Math.round(state.cooldownSeconds / 60)} minutes.</p>
      </section>

      <section className="sim-card">
        <h2>Event feed</h2>
        {state.events.length ? (
          <ul className="sim-feed">
            {state.events.map((event) => (
              <li key={event.id} className={event.severity === "critical" ? "critical" : ""}>
                <time dateTime={event.occurredAt}>{new Date(event.occurredAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time>
                <span>{event.description}</span>
                <em>{event.outreachEligible ? (event.acknowledgedAt ? "Called · acknowledged" : "Jarvis calls") : "Logged"}</em>
              </li>
            ))}
          </ul>
        ) : (
          <p className="sim-hint">Nothing yet. Hold a prop up to the camera, or press Trigger.</p>
        )}
      </section>
    </div>
  );
}
