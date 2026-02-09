"use client";

import { useState, useEffect, useCallback } from "react";

interface HealthStatus {
  ok: boolean;
  checks: {
    ankiConnect: boolean;
    ankiVersion: number | null;
    deck: string | null;
    modelExists: boolean;
  };
}

export function useAnkiConnection(pollInterval = 30000) {
  const [status, setStatus] = useState<HealthStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    try {
      const res = await fetch("/api/health");
      const data: HealthStatus = await res.json();
      setStatus(data);
    } catch {
      setStatus({
        ok: false,
        checks: {
          ankiConnect: false,
          ankiVersion: null,
          deck: null,
          modelExists: false,
        },
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    check();
    const interval = setInterval(check, pollInterval);
    return () => clearInterval(interval);
  }, [check, pollInterval]);

  return { status, loading, refresh: check };
}
