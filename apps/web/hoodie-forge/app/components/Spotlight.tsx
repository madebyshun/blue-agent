"use client";

import { useEffect, useState } from "react";

export function Spotlight() {
  const [pos, setPos] = useState({ x: 50, y: 30 });

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    const onMove = (e: MouseEvent) => {
      setPos({
        x: (e.clientX / window.innerWidth) * 100,
        y: (e.clientY / window.innerHeight) * 100,
      });
    };
    window.addEventListener("mousemove", onMove);
    return () => window.removeEventListener("mousemove", onMove);
  }, []);

  return (
    <div
      className="fixed inset-0 pointer-events-none z-0"
      style={{
        background: `radial-gradient(600px circle at ${pos.x}% ${pos.y}%, var(--spotlight), transparent 55%)`,
        transition: "background 120ms ease-out",
      }}
    />
  );
}
