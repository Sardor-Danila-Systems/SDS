"use client";

import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Tour } from "@/components/ui/product-tour";
import { RELEASES, type Release } from "@/lib/admin-releases";

/*
  Shows the newest release the signed-in person has not seen yet, once, a moment
  after the admin opens. "Seen" is remembered per person in this browser
  (localStorage), so a new teammate or a new browser sees the tour too. The
  "Что нового" button replays the latest one on demand.
*/

const EVENT = "sds:tour";
const keyFor = (userId: string, releaseId: string) => `sds-admin-tour:${userId}:${releaseId}`;

export function AdminTour({ userId }: { userId: string }) {
  const [release, setRelease] = useState<Release | null>(null);
  const [open, setOpen] = useState(false);
  const [index, setIndex] = useState(0);

  const start = useCallback((r: Release) => {
    setRelease(r);
    setIndex(0);
    setOpen(true);
  }, []);

  // First open: the newest unseen release, after the page has settled.
  useEffect(() => {
    let timer: number | undefined;
    try {
      const unseen = RELEASES.find((r) => localStorage.getItem(keyFor(userId, r.id)) !== "1");
      if (unseen) timer = window.setTimeout(() => start(unseen), 900);
    } catch {
      /* storage blocked: skip the automatic tour, the button still works */
    }
    return () => window.clearTimeout(timer);
  }, [userId, start]);

  // The "Что нового" button.
  useEffect(() => {
    const on = () => RELEASES[0] && start(RELEASES[0]);
    window.addEventListener(EVENT, on);
    return () => window.removeEventListener(EVENT, on);
  }, [start]);

  const remember = useCallback(() => {
    if (!release) return;
    try {
      localStorage.setItem(keyFor(userId, release.id), "1");
    } catch {
      /* ignore */
    }
  }, [release, userId]);

  const steps = useMemo(() => release?.steps ?? [], [release]);
  if (!release) return null;

  return (
    <Tour
      steps={steps}
      open={open}
      onOpenChange={setOpen}
      index={index}
      onIndexChange={setIndex}
      // Closing early counts as seen too: nobody should be nagged on every visit.
      onFinish={remember}
      onSkip={remember}
    />
  );
}

export function TourButton() {
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(EVENT))}
      className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-border bg-card px-3 text-sm text-muted-foreground shadow-[var(--shadow-panel)] transition-colors hover:text-foreground"
    >
      <Sparkles className="size-3.5" />
      Что нового
    </button>
  );
}
