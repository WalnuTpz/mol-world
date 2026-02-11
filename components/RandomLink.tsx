"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";

import { useToast } from "./ToastProvider";

const STORAGE_KEY = "molworld_random_last_at";
const COOLDOWN_MS = 5000;

type RandomLinkProps = {
  href: string;
  className?: string;
  disabledClassName?: string;
  style?: CSSProperties;
  disabledStyle?: CSSProperties;
  children: React.ReactNode;
};

export default function RandomLink({
  href,
  className,
  disabledClassName,
  style,
  disabledStyle,
  children,
}: RandomLinkProps) {
  const toast = useToast();
  const timerRef = useRef<number | null>(null);
  const [coolingDown, setCoolingDown] = useState(false);

  const startCooldown = (until: number) => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const remaining = Math.max(0, until - Date.now());
    if (remaining <= 0) {
      setCoolingDown(false);
      return;
    }
    setCoolingDown(true);
    timerRef.current = window.setTimeout(() => {
      setCoolingDown(false);
      timerRef.current = null;
    }, remaining);
  };

  useEffect(() => {
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
      if (Number.isFinite(last) && last > 0) {
        startCooldown(last + COOLDOWN_MS);
      }
    } catch {
      // ignore
    }
    return () => {
      if (timerRef.current) {
        window.clearTimeout(timerRef.current);
      }
    };
  }, []);

  const handleClick = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const now = Date.now();
    try {
      const last = Number(localStorage.getItem(STORAGE_KEY) ?? "0");
      if (Number.isFinite(last) && now - last < COOLDOWN_MS) {
        event.preventDefault();
        startCooldown(last + COOLDOWN_MS);
        toast("操作过于频繁", "error", undefined, "请稍后再试");
        return;
      }
      localStorage.setItem(STORAGE_KEY, String(now));
      startCooldown(now + COOLDOWN_MS);
    } catch {
      // ignore
    }
  };

  const mergedClassName = [
    className,
    coolingDown && disabledClassName ? disabledClassName : "",
  ]
    .filter(Boolean)
    .join(" ");
  const mergedStyle = coolingDown
    ? { ...style, ...disabledStyle }
    : style;

  return (
    <Link
      href={href}
      className={mergedClassName}
      style={mergedStyle}
      aria-disabled={coolingDown}
      onClick={handleClick}
    >
      {children}
    </Link>
  );
}
