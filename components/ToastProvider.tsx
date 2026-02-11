"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";

import styles from "./Toast.module.css";

type ToastTone = "info" | "success" | "error";

type ToastItem = {
  id: string;
  message: string;
  tone: ToastTone;
  detail?: string;
};

type ToastFn = (
  message: string,
  tone?: ToastTone,
  durationMs?: number,
  detail?: string
) => void;

const ToastContext = createContext<ToastFn | null>(null);

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx;
}

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const show = useCallback<ToastFn>(
    (message, tone = "info", durationMs = 2200, detail) => {
    const id = createId();
    setToasts((prev) => [...prev, { id, message, tone, detail }].slice(-3));
    window.setTimeout(() => {
      setToasts((prev) => prev.filter((toast) => toast.id !== id));
    }, durationMs);
  }, []);

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.region} aria-live="polite" aria-atomic="true">
        {toasts.map((toast) => {
          const toneClass =
            toast.tone === "success"
              ? styles.toastSuccess
              : toast.tone === "error"
                ? styles.toastError
                : styles.toastInfo;
          return (
            <div key={toast.id} className={`${styles.toast} ${toneClass}`}>
              <div className={styles.toastMessage}>{toast.message}</div>
              {toast.detail && (
                <div className={styles.toastDetail}>{toast.detail}</div>
              )}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
