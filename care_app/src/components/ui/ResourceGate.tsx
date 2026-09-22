"use client";

import { useCallback, useEffect, useState } from "react";
import { isBrowserOffline } from "@/lib/utils";
import { PageState, type PageStateKind } from "./PageState";

interface AsyncState<T> {
  data: T | null;
  kind: PageStateKind | "ready";
  message?: string;
  reload: () => void;
}

/**
 * `pollMs`, when set, keeps this resource near-live: a background refetch on
 * that interval, plus an immediate one whenever the tab regains focus or the
 * device comes back online — so an alert raised from the patient's sync
 * shows up here without a manual reload. The backend is a plain REST API
 * with no push channel, so this is deliberately poll-based rather than a
 * WebSocket: it needs no new server capability, cannot regress the existing
 * request/response paths, and reads as live on a demo at any interval under
 * about 10s. A background tab does not poll — `document.hidden` skips the
 * tick — so it always shows fresh data the moment it is looked at again
 * regardless of how long it was away.
 */
export function useAsyncResource<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  pollMs?: number,
): AsyncState<T> {
  const [data, setData] = useState<T | null>(null);
  const [kind, setKind] = useState<PageStateKind | "ready">("loading");
  const [message, setMessage] = useState<string | undefined>();
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      if (isBrowserOffline()) {
        setKind("offline");
        setMessage(undefined);
        return;
      }
      setKind("loading");
      try {
        const result = await loader();
        if (cancelled) return;
        setData(result);
        setKind("ready");
        setMessage(undefined);
      } catch (err) {
        if (cancelled) return;
        const status = (err as { status?: number; code?: string }).status;
        const code = (err as { code?: string }).code;
        if (status === 403 || code === "FORBIDDEN") {
          setKind("denied");
        } else if (code === "NETWORK_ERROR" || isBrowserOffline()) {
          setKind("offline");
        } else {
          setKind("error");
          setMessage(err instanceof Error ? err.message : undefined);
        }
      }
    }
    void run();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional deps array from caller
  }, [tick, ...deps]);

  useEffect(() => {
    function onOffline() {
      setKind("offline");
    }
    function onOnline() {
      reload();
    }
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);
    return () => {
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
    };
  }, [reload]);

  useEffect(() => {
    if (!pollMs) return;

    const interval = setInterval(() => {
      if (!document.hidden) reload();
    }, pollMs);

    function onVisible() {
      if (!document.hidden) reload();
    }
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [pollMs, reload]);

  return { data, kind, message, reload };
}

export function ResourceGate<T>({
  state,
  emptyWhen,
  emptyMessage,
  children,
}: {
  state: AsyncState<T>;
  emptyWhen?: (data: T) => boolean;
  emptyMessage?: string;
  children: (data: T) => React.ReactNode;
}) {
  if (state.kind === "loading") return <PageState kind="loading" />;
  if (state.kind === "offline")
    return <PageState kind="offline" onRetry={state.reload} />;
  if (state.kind === "denied") return <PageState kind="denied" />;
  if (state.kind === "error")
    return (
      <PageState kind="error" message={state.message} onRetry={state.reload} />
    );
  if (!state.data || (emptyWhen && emptyWhen(state.data))) {
    return <PageState kind="empty" message={emptyMessage} />;
  }
  return <>{children(state.data)}</>;
}
