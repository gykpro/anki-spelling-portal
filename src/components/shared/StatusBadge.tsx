"use client";

import { cn } from "@/lib/utils";

interface StatusBadgeProps {
  status: "connected" | "disconnected" | "warning" | "loading";
  label: string;
}

export function StatusBadge({ status, label }: StatusBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium",
        status === "connected" && "bg-green-100 text-green-800",
        status === "disconnected" && "bg-red-100 text-red-800",
        status === "warning" && "bg-yellow-100 text-yellow-800",
        status === "loading" && "bg-gray-100 text-gray-600"
      )}
    >
      <span
        className={cn(
          "h-1.5 w-1.5 rounded-full",
          status === "connected" && "bg-green-500",
          status === "disconnected" && "bg-red-500",
          status === "warning" && "bg-yellow-500",
          status === "loading" && "bg-gray-400 animate-pulse"
        )}
      />
      {label}
    </span>
  );
}
