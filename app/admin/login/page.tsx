"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ThemeToggle } from "@/components/admin/theme-toggle";
import { ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * Sign-in. Same light system as the rest of the site — no separate dark tool
 * aesthetic. The submit logic is unchanged.
 */
export default function AdminLoginPage() {
    const router = useRouter();
    const [login, setLogin] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);

    async function handleSubmit(e: React.FormEvent) {
        e.preventDefault();
        setError(null);
        setLoading(true);

        const res = await fetch("/api/admin/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ login, password }),
        });

        setLoading(false);

        if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            setError(data.error ?? "Ошибка входа");
            return;
        }

        router.push("/admin");
        router.refresh();
    }

    return (
        <div className="flex min-h-dvh items-center justify-center px-4 py-10">
            <div className="w-full max-w-sm">
                <div className="mb-8 flex flex-col items-center text-center">
                    <span className="flex size-12 items-center justify-center rounded-xl bg-primary text-lg font-semibold text-primary-foreground shadow-[var(--shadow-pop)]">
                        S
                    </span>
                    <h1 className="mt-5 text-2xl font-semibold tracking-[-0.03em]">Вход в SDS</h1>
                    <p className="mt-1.5 text-sm text-muted-foreground">CRM и управление сайтом</p>
                </div>

                <form onSubmit={handleSubmit} className="admin-panel space-y-4 p-6">
                    <div className="space-y-1.5">
                        <Label htmlFor="login">Логин</Label>
                        <Input
                            id="login"
                            className="h-10 rounded-lg bg-card text-sm"
                            value={login}
                            onChange={(e) => setLogin(e.target.value)}
                            autoComplete="username"
                            required
                        />
                    </div>

                    <div className="space-y-1.5">
                        <Label htmlFor="password">Пароль</Label>
                        <Input
                            id="password"
                            type="password"
                            className="h-10 rounded-lg bg-card text-sm"
                            value={password}
                            onChange={(e) => setPassword(e.target.value)}
                            autoComplete="current-password"
                            required
                        />
                    </div>

                    {error ? (
                        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                            {error}
                        </p>
                    ) : null}

                    <button
                        type="submit"
                        disabled={loading}
                        className="group inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground shadow-[var(--shadow-panel)] transition-colors hover:bg-primary-hover disabled:opacity-60"
                    >
                        {loading ? "Входим…" : "Войти"}
                        <ArrowRight className="size-4 transition-transform duration-200 group-hover:translate-x-0.5" />
                    </button>
                </form>

                <div className="mt-6 flex justify-center">
                    <ThemeToggle />
                </div>
            </div>
        </div>
    );
}
