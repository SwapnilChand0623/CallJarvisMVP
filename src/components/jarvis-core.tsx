/**
 * Jarvis's mark: a soft glowing core with a voice line through it, the same look as the avatar callers see on
 * FaceTime Video. Decorative only. Motion is CSS-only and respects reduced motion.
 */
export function JarvisCore() {
  return (
    <div className="jarvis-core" aria-hidden="true">
      <div className="core-halo" />
      <div className="core-glow" />
      <svg className="core-voice" viewBox="0 0 320 120" preserveAspectRatio="none">
        <path d="M0 60 C 28 60 44 59 62 60 S 92 34 112 60 S 140 94 160 60 S 188 20 208 60 S 238 82 258 60 S 296 60 320 60" />
      </svg>
    </div>
  );
}
