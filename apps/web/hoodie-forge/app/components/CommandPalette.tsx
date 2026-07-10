"use client";

import { Command } from "cmdk";
import { useEffect, useState } from "react";

type Item = { serial: string; url: string };

type Props = {
  gallery: Item[];
  hasForge: boolean;
  soundOn: boolean;
  onSelectSerial: (s: string) => void;
  onShare: () => void;
  onDownload: () => void;
  onToggleSound: () => void;
};

export function CommandPalette(props: Props) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const mono = "[font-family:'JetBrains_Mono',ui-monospace,monospace]";

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`${mono} text-[10px] text-[var(--mute-3)] tracking-widest border border-[var(--line)] px-2 h-6 hover:border-[#0052FF] hover:text-[var(--fg)] transition-colors`}
        aria-label="Open command palette"
      >
        ⌘K
      </button>
      {open && (
        <div
          className="fixed inset-0 z-[60] bg-black/70 backdrop-blur-sm flex items-start justify-center pt-24 px-4"
          onClick={() => setOpen(false)}
        >
          <Command
            className={`${mono} w-full max-w-md bg-[var(--panel)] border border-[var(--line)]`}
            onClick={(e) => e.stopPropagation()}
            label="Command palette"
          >
            <Command.Input
              placeholder="search serial · run command"
              className="w-full bg-transparent border-b border-[var(--line)] text-sm text-[var(--fg)] px-4 h-11 outline-none placeholder:text-[var(--mute-3)]"
            />
            <Command.List className="max-h-72 overflow-y-auto py-2">
              <Command.Empty className="px-4 py-6 text-[10px] text-[var(--mute-3)] tracking-widest text-center">
                NOTHING FOUND
              </Command.Empty>
              <Command.Group
                heading="ACTIONS"
                className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--mute-3)]"
              >
                {props.hasForge && (
                  <Command.Item
                    onSelect={() => {
                      props.onDownload();
                      setOpen(false);
                    }}
                    className="px-4 py-2 text-xs text-[var(--fg)] data-[selected=true]:bg-[#0052FF]/20 cursor-pointer"
                  >
                    Download last forge
                  </Command.Item>
                )}
                {props.hasForge && (
                  <Command.Item
                    onSelect={() => {
                      props.onShare();
                      setOpen(false);
                    }}
                    className="px-4 py-2 text-xs text-[var(--fg)] data-[selected=true]:bg-[#0052FF]/20 cursor-pointer"
                  >
                    Share on X
                  </Command.Item>
                )}
                <Command.Item
                  onSelect={() => {
                    props.onToggleSound();
                  }}
                  className="px-4 py-2 text-xs text-[var(--fg)] data-[selected=true]:bg-[#0052FF]/20 cursor-pointer flex justify-between"
                >
                  <span>Toggle sound</span>
                  <span className="text-[var(--mute-3)]">
                    {props.soundOn ? "ON" : "OFF"}
                  </span>
                </Command.Item>
              </Command.Group>
              {props.gallery.length > 0 && (
                <Command.Group
                  heading="GALLERY"
                  className="[&_[cmdk-group-heading]]:px-4 [&_[cmdk-group-heading]]:py-1 [&_[cmdk-group-heading]]:text-[9px] [&_[cmdk-group-heading]]:tracking-widest [&_[cmdk-group-heading]]:text-[var(--mute-3)]"
                >
                  {props.gallery.slice(0, 16).map((g) => (
                    <Command.Item
                      key={g.serial}
                      value={g.serial}
                      onSelect={() => {
                        props.onSelectSerial(g.serial);
                        setOpen(false);
                      }}
                      className="px-4 py-2 text-xs data-[selected=true]:bg-[#0052FF]/20 cursor-pointer"
                    >
                      <span className="text-[#0052FF]">{g.serial}</span>
                    </Command.Item>
                  ))}
                </Command.Group>
              )}
            </Command.List>
            <div className="px-4 py-2 border-t border-[var(--line)] text-[9px] text-[var(--mute-3)] tracking-widest flex justify-between">
              <span>↑↓ NAVIGATE</span>
              <span>↵ SELECT</span>
              <span>ESC CLOSE</span>
            </div>
          </Command>
        </div>
      )}
    </>
  );
}
