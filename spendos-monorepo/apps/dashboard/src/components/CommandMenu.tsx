"use client";

import React, { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth";

export function CommandMenu() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { user } = useAuth();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <Command
        className="w-full max-w-lg bg-accent text-foreground rounded-lg overflow-hidden shadow-2xl border border-gray-800"
        onKeyDown={(e) => {
          if (e.key === "Escape") setOpen(false);
        }}
      >
        <Command.Input
          autoFocus
          placeholder="Type a command or search..."
          className="w-full p-4 bg-transparent border-b border-gray-800 text-lg outline-none placeholder:text-gray-500"
        />
        <Command.List className="max-h-[300px] overflow-y-auto p-2">
          <Command.Empty className="p-4 text-center text-gray-500">No results found.</Command.Empty>

          <Command.Group heading="Quick Actions" className="px-2 py-1 text-xs text-gray-400 font-semibold uppercase">
            <Command.Item
              onSelect={() => { setOpen(false); router.push("/submit"); }}
              className="px-4 py-3 rounded hover:bg-gray-800 cursor-pointer text-sm flex items-center gap-2 aria-selected:bg-gray-800 aria-selected:text-signal"
            >
              Submit Expense
            </Command.Item>
            {user?.role === 'ADMIN' || user?.role === 'PRINCIPAL' || user?.role === 'VIP' || user?.role === 'MANAGER' ? (
              <>
                <Command.Item
                  onSelect={() => { setOpen(false); router.push("/review-queue"); }}
                  className="px-4 py-3 rounded hover:bg-gray-800 cursor-pointer text-sm flex items-center gap-2 aria-selected:bg-gray-800 aria-selected:text-signal"
                >
                  Review Queue
                </Command.Item>
                <Command.Item
                  onSelect={() => { setOpen(false); router.push("/ledger"); }}
                  className="px-4 py-3 rounded hover:bg-gray-800 cursor-pointer text-sm flex items-center gap-2 aria-selected:bg-gray-800 aria-selected:text-signal"
                >
                  View Ledger
                </Command.Item>
              </>
            ) : null}
            {user?.role === 'PRINCIPAL' || user?.role === 'ADMIN' ? (
              <Command.Item
                onSelect={() => { setOpen(false); router.push("/settings"); }}
                className="px-4 py-3 rounded hover:bg-gray-800 cursor-pointer text-sm flex items-center gap-2 aria-selected:bg-gray-800 aria-selected:text-signal"
              >
                Settings
              </Command.Item>
            ) : null}
          </Command.Group>
        </Command.List>
      </Command>
    </div>
  );
}
