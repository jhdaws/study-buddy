/**
 * The full-screen sign-in scene (Claude Design spec, pages 9-17): a dim
 * library wall of book spines, one pendant lamp, and a single frosted glass
 * card in its pool of warm light. Used by /login and /login/name.
 *
 * Pure CSS and inline SVG -- no image files. The spines are generated
 * divs; the lamp's glow is the only warm colour in the app.
 */

import Logo from "@/components/ui/Logo";

// Book spines: widths, heights and tones from a small fixed-seed generator,
// so every render (server and client) draws the same shelves and none of
// them looks tiled.
const TONES = ["#173563", "#0f2748", "#1e4378", "#0b1e3a", "#16335f", "#21497f", "#12305e", "#1b3f6e"];

function spinesFor(shelf: number) {
  let seed = 9301 * (shelf + 1);
  const next = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 70 }, () => ({
    width: 9 + Math.round(next() * 12),
    height: 68 + Math.round(next() * 30),
    tone: TONES[Math.floor(next() * TONES.length)],
    gap: next() < 0.12 ? 6 : 1,
  }));
}

const SHELVES = [0, 1, 2, 3].map(spinesFor);

export default function AuthScene({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative isolate flex min-h-dvh flex-col items-center overflow-hidden bg-navy-950 px-4 pb-10">
      {/* The bookshelf wall, faded into the dark at the edges and bottom. */}
      <div aria-hidden className="absolute inset-x-0 top-0 -z-10 h-[78%]">
        <div className="mx-auto flex h-full max-w-5xl flex-col gap-3 pt-6 opacity-90">
          {SHELVES.map((spines, i) => (
            <div key={i} className="relative flex-1">
              <div className="absolute inset-x-0 top-[10%] bottom-2 flex items-end justify-center overflow-hidden">
                {spines.map((spine, j) => (
                  <span
                    key={j}
                    className="shrink-0 rounded-t-[2px]"
                    style={{
                      width: spine.width,
                      height: `${spine.height}%`,
                      marginRight: spine.gap,
                      background: `linear-gradient(90deg, ${spine.tone}, ${spine.tone} 70%, rgba(255,255,255,0.06) 72%, ${spine.tone} 76%)`,
                    }}
                  />
                ))}
              </div>
              <div className="absolute inset-x-0 bottom-0 h-2 bg-[#081630]" />
            </div>
          ))}
        </div>
        <div className="absolute inset-0 bg-[radial-gradient(60%_75%_at_50%_30%,transparent_0%,rgba(5,14,32,0.55)_55%,#050e20_92%)]" />
        <div className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-b from-transparent to-navy-950" />
      </div>

      {/* The lamp and its pool of warm light. */}
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 flex justify-center">
        {/* Warm light: a cone down from the shade, and a pool where it lands. */}
        <div
          className="absolute -top-8 h-[38rem] w-[48rem] max-w-[170vw] motion-safe:animate-[sb-glow_6s_ease-in-out_infinite]"
          style={{
            background:
              "radial-gradient(42% 40% at 50% 30%, rgba(255,214,150,0.5), rgba(246,193,119,0.2) 45%, transparent 100%)",
          }}
        />
        <div
          className="absolute top-24 h-72 w-[26rem] max-w-[110vw]"
          style={{
            background:
              "conic-gradient(from 180deg at 50% 0%, transparent 152deg, rgba(246,193,119,0.16) 165deg, rgba(255,226,180,0.22) 180deg, rgba(246,193,119,0.16) 195deg, transparent 208deg)",
            maskImage: "linear-gradient(to bottom, transparent, black 15%, black 35%, transparent)",
            WebkitMaskImage: "linear-gradient(to bottom, transparent, black 15%, black 35%, transparent)",
          }}
        />
        <svg viewBox="0 0 120 120" className="relative h-28 w-28 md:h-32 md:w-32">
          <line x1="60" y1="0" x2="60" y2="48" stroke="#2a4d80" strokeWidth="2" />
          <path d="M34 82 L46 50 H74 L86 82 Z" fill="#1d4f8f" />
          <path d="M46 50 H74 L76 56 H44 Z" fill="#2f74c8" />
          <ellipse cx="60" cy="82" rx="26" ry="4" fill="#f6c177" />
          <ellipse cx="60" cy="82" rx="20" ry="2.5" fill="#fff4dc" />
        </svg>
      </div>

      <div className="mt-[7.5rem] w-full max-w-[420px] md:mt-36">
        <div className="glass-dark rounded-hero px-5 pt-6 pb-6 text-white shadow-[0_40px_80px_-30px_rgba(0,0,0,0.8),0_-20px_60px_-30px_rgba(246,193,119,0.35)] sm:px-7">
          <div className="mb-5 flex justify-center">
            <Logo tone="light" />
          </div>
          {children}
        </div>
      </div>

      <style>{`@keyframes sb-glow{0%,100%{opacity:1}50%{opacity:.85}}`}</style>
    </div>
  );
}
