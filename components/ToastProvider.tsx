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

type ConfirmFn = (
  message: string,
  detail?: string
) => Promise<boolean>;

type ToastAction = {
  label: string;
  variant?: "primary" | "ghost" | "danger";
  onClick: () => void;
};

type ToastContextValue = {
  toast: ToastFn;
  confirm: ConfirmFn;
};

type ToastRenderItem = ToastItem & {
  actions?: ToastAction[];
  persist?: boolean;
};

const ToastContext = createContext<ToastContextValue | null>(null);

const createId = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToast must be used within ToastProvider");
  }
  return ctx.toast;
}

export function useToastConfirm() {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error("useToastConfirm must be used within ToastProvider");
  }
  return ctx.confirm;
}

export default function ToastProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [toasts, setToasts] = useState<ToastRenderItem[]>([]);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const show = useCallback<ToastFn>(
    (message, tone = "info", durationMs = 2200, detail) => {
      const id = createId();
      setToasts((prev) => [...prev, { id, message, tone, detail }].slice(-3));
      if (durationMs > 0) {
        window.setTimeout(() => {
          removeToast(id);
        }, durationMs);
      }
    },
    [removeToast]
  );

  const confirm = useCallback<ConfirmFn>(
    (message, detail) =>
      new Promise<boolean>((resolve) => {
        const id = createId();
        const handle = (result: boolean) => {
          removeToast(id);
          resolve(result);
        };
        const item: ToastRenderItem = {
          id,
          message,
          tone: "info",
          detail,
          persist: true,
          actions: [
            { label: "取消", variant: "ghost", onClick: () => handle(false) },
            { label: "确认", variant: "primary", onClick: () => handle(true) },
          ],
        };
        setToasts((prev) => [...prev, item].slice(-3));
      }),
    [removeToast]
  );

  const value = useMemo(() => ({ toast: show, confirm }), [show, confirm]);

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
              {toast.actions && toast.actions.length > 0 ? (
                <div className={styles.toastActions}>
                  {toast.actions.map((action) => {
                    const actionClass =
                      action.variant === "primary"
                        ? styles.toastActionPrimary
                        : action.variant === "danger"
                          ? styles.toastActionDanger
                          : styles.toastActionGhost;
                    return (
                      <button
                        key={action.label}
                        type="button"
                        className={`${styles.toastAction} ${actionClass}`}
                        onClick={action.onClick}
                      >
                        {action.label}
                      </button>
                    );
                  })}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}
