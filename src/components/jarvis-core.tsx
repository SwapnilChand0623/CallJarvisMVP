import { AudioLines } from "lucide-react";

/** Decorative interface rings. Motion is CSS-only and respects reduced motion. */
export function JarvisCore() {
  return (
    <div className="jarvis-core" aria-hidden="true">
      <div className="core-ring core-ring-outer" />
      <div className="core-ring core-ring-ticks" />
      <div className="core-ring core-ring-middle" />
      <div className="core-ring core-ring-inner" />
      <div className="core-center">
        <AudioLines size={38} strokeWidth={1.3} />
        <span>J.A.R.V.I.S.</span>
      </div>
      <i className="core-marker marker-one" />
      <i className="core-marker marker-two" />
    </div>
  );
}
