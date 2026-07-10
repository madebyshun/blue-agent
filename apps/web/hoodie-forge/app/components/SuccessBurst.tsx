"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";

// Minimal reveal: a soft blue border pulse + outer glow. Nothing else.

type Props = { serial: string; active: boolean };

export function SuccessBurst({ active }: Props) {
  const [show, setShow] = useState(false);

  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    if (!active) {
      setShow(false);
      return;
    }
    setShow(true);
    const t = setTimeout(() => setShow(false), 1600);
    return () => clearTimeout(t);
  }, [active]);

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-0"
          initial={{ opacity: 0 }}
          animate={{ opacity: [0, 1, 0.35] }}
          exit={{ opacity: 0 }}
          transition={{ duration: 1.4, times: [0, 0.25, 1] }}
          style={{
            boxShadow:
              "inset 0 0 0 1px rgba(0,82,255,0.9), 0 0 60px rgba(0,82,255,0.35)",
          }}
        />
      )}
    </AnimatePresence>
  );
}
