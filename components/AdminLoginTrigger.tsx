"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { useRouter } from "next/navigation";

import baseStyles from "@/app/page.module.css";
import modalStyles from "@/components/AdminLoginModal.module.css";

type Props = {
  authed?: boolean;
  className?: string;
  iconClassName?: string;
};

export default function AdminLoginTrigger({
  authed,
  className,
  iconClassName,
}: Props) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [user, setUser] = useState("");
  const [pass, setPass] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [isAuthed, setIsAuthed] = useState<boolean | null>(
    typeof authed === "boolean" ? authed : null
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (typeof authed === "boolean") return;
    fetch("/api/admin/session")
      .then((res) => res.json())
      .then((data) => setIsAuthed(Boolean(data.authed)))
      .catch(() => setIsAuthed(false));
  }, [authed]);

  const openLogin = () => {
    if (isAuthed) {
      router.push("/admin");
      return;
    }
    setOpen(true);
  };

  const closeLogin = () => {
    if (loading) return;
    setOpen(false);
    setError("");
  };

  const submit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!user.trim() || !pass.trim()) {
      setError("请输入账号和密码");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user: user.trim(), pass }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as
          | { error?: string }
          | null;
        setError(data?.error || "账号或密码错误");
        return;
      }
      setOpen(false);
      setIsAuthed(true);
      router.push("/admin");
      router.refresh();
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <button
        type="button"
        className={className ?? baseStyles.brandIconLink}
        onClick={openLogin}
        aria-label="管理控制台"
      >
        <Image
          className={iconClassName ?? baseStyles.brandIcon}
          src="/brand-icon.png"
          alt="MolWorld"
          width={36}
          height={36}
        />
      </button>

      {open && mounted
        ? createPortal(
            <div
              className={modalStyles.overlay}
              role="dialog"
              aria-modal="true"
              onClick={(event) => {
                if (event.target === event.currentTarget) closeLogin();
              }}
            >
              <div className={modalStyles.modal}>
                <div className={modalStyles.title}>管理员登录</div>
                <div className={modalStyles.subtitle}>请输入账号和密码</div>
                <form className={modalStyles.form} onSubmit={submit}>
                  <label className={modalStyles.field}>
                    <span className={modalStyles.label}>账号</span>
                    <input
                      className={modalStyles.input}
                      value={user}
                      onChange={(event) => setUser(event.target.value)}
                      autoComplete="username"
                      placeholder="输入账号"
                      disabled={loading}
                    />
                  </label>
                  <label className={modalStyles.field}>
                    <span className={modalStyles.label}>密码</span>
                    <input
                      className={modalStyles.input}
                      type="password"
                      value={pass}
                      onChange={(event) => setPass(event.target.value)}
                      autoComplete="current-password"
                      placeholder="输入密码"
                      disabled={loading}
                    />
                  </label>
                  {error ? (
                    <div className={modalStyles.error}>{error}</div>
                  ) : null}
                  <div className={modalStyles.actions}>
                    <button
                      type="button"
                      className={modalStyles.cancel}
                      onClick={closeLogin}
                      disabled={loading}
                    >
                      取消
                    </button>
                    <button
                      type="submit"
                      className={modalStyles.submit}
                      disabled={loading}
                    >
                      {loading ? "登录中..." : "登录"}
                    </button>
                  </div>
                </form>
              </div>
            </div>,
            document.body
          )
        : null}
    </>
  );
}
