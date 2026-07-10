export function GridBackground() {
  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-0 opacity-90"
        style={{
          backgroundImage:
            "linear-gradient(var(--grid-line) 1px, transparent 1px), linear-gradient(90deg, var(--grid-line) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
          maskImage:
            "radial-gradient(ellipse 80% 60% at 50% 40%, black 40%, transparent 100%)",
        }}
      />
      <div
        className="fixed inset-0 pointer-events-none z-0"
        style={{
          background:
            "radial-gradient(ellipse 100% 100% at 50% 100%, var(--hero-glow), transparent 60%)",
        }}
      />
      <div
        className="fixed inset-x-0 top-0 h-px pointer-events-none z-0"
        style={{
          background:
            "linear-gradient(to right, transparent, rgba(0,82,255,0.5), transparent)",
        }}
      />
    </>
  );
}
