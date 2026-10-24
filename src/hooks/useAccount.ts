import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
    accountErrorText, deleteAccountData, fetchAccountConfig, finishLogin, getSyncState, hasPendingRemote, isAccountKey,
    loadAccount, onSyncState, resetSyncState, signOut, startGoogleLogin, syncNow, takeGoogleResult, type AccountState,
} from "../helpers/account";
import { isOldHost } from "../helpers/move";

// Cuenta opcional con Google. Cuándo se sincroniza (sin sondeos: cada comprobación cuesta una operación en la base de datos):
// - al abrir la app y al volver a ella: sube lo cambiado y aplica lo que llegó de otros móviles (recarga si hay cambios);
// - unos segundos después de cambiar algo: solo sube (no toca lo que la persona tiene en pantalla);
// - si hay cosas de otros móviles sin aplicar y llevas medio minuto sin tocar nada: las aplica.
const PUSH_DELAY_MS = 4000;
const PUSH_MAX_WAIT_MS = 30_000;
const IDLE_APPLY_MS = 30_000;

export default function useAccount() {
    const [config, setConfig] = useState<{ configured: boolean, clientId: string | null } | null>(null);
    const [account, setAccount] = useState<AccountState | null>(loadAccount);
    const syncState = useSyncExternalStore(onSyncState, getSyncState);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const accountRef = useRef(account);
    accountRef.current = account;

    const refreshAccount = useCallback(() => {
        setAccount(loadAccount());
        resetSyncState();
    }, []);

    const run = useCallback(async (mode: "apply" | "push") => {
        if (!loadAccount()) return;
        const reload = await syncNow(mode);
        setAccount(loadAccount());
        if (reload) window.location.reload();
    }, []);

    // Al abrir: ¿está activada la cuenta? ¿venimos de Google? ¿hay que sincronizar?
    useEffect(() => {
        if (isOldHost()) return;
        let cancelled = false;
        fetchAccountConfig().then(result => {
            if (!cancelled) setConfig(result);
        });
        const result = takeGoogleResult();
        if (result && "credential" in result) {
            setBusy(true);
            finishLogin(result.credential)
                .then(async wiped => {
                    refreshAccount();
                    const reload = await syncNow("apply");
                    setAccount(loadAccount());
                    if (reload || wiped) window.location.reload();
                })
                .catch(failure => setError(accountErrorText(failure)))
                .finally(() => setBusy(false));
        } else if (result) {
            setError(result.error === "access_denied" ? "Has cancelado la entrada con Google." : "Google no ha dejado entrar. Inténtalo otra vez.");
        } else {
            void run("apply");
        }
        return () => {
            cancelled = true;
        };
    }, [run, refreshAccount]);

    // Al volver a la app, o al recuperar la conexión
    useEffect(() => {
        const back = () => {
            if (document.visibilityState === "visible" && accountRef.current) void run("apply");
        };
        const online = () => {
            if (accountRef.current) void run("apply");
        };
        document.addEventListener("visibilitychange", back);
        window.addEventListener("online", online);
        return () => {
            document.removeEventListener("visibilitychange", back);
            window.removeEventListener("online", online);
        };
    }, [run]);

    // Cambios hechos aquí: se suben unos segundos después (agrupando los cambios seguidos)
    useEffect(() => {
        let timer: number | undefined;
        let firstAt = 0;
        const schedule = (event: Event) => {
            const key = (event as CustomEvent<string>).detail;
            if (!accountRef.current || typeof key !== "string" || !isAccountKey(key)) return;
            const now = Date.now();
            if (!timer) firstAt = now;
            window.clearTimeout(timer);
            timer = window.setTimeout(() => {
                timer = undefined;
                void run("push");
            }, Math.min(PUSH_DELAY_MS, Math.max(0, firstAt + PUSH_MAX_WAIT_MS - now)));
        };
        window.addEventListener("mercalista:data", schedule);
        return () => {
            window.removeEventListener("mercalista:data", schedule);
            window.clearTimeout(timer);
        };
    }, [run]);

    // Cosas de otros móviles por aplicar: se aplican cuando llevas un rato sin tocar nada
    useEffect(() => {
        let lastTouch = Date.now();
        const touch = () => { lastTouch = Date.now(); };
        const events = ["pointerdown", "keydown", "touchstart"] as const;
        for (const name of events) window.addEventListener(name, touch, { passive: true });
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible" && accountRef.current && hasPendingRemote() && Date.now() - lastTouch > IDLE_APPLY_MS) void run("apply");
        }, 10_000);
        return () => {
            for (const name of events) window.removeEventListener(name, touch);
            window.clearInterval(timer);
        };
    }, [run]);

    const signIn = useCallback(() => {
        setError("");
        if (!config?.clientId) return;
        try {
            startGoogleLogin(config.clientId);
        } catch (failure) {
            setError(accountErrorText(failure));
        }
    }, [config]);

    const leave = useCallback(async (wipe: boolean) => {
        setBusy(true);
        setError("");
        await signOut(wipe);
        refreshAccount();
        setBusy(false);
        if (wipe) window.location.reload();
    }, [refreshAccount]);

    const deleteAll = useCallback(async () => {
        setBusy(true);
        setError("");
        try {
            await deleteAccountData();
            refreshAccount();
            return true;
        } catch (failure) {
            setError(accountErrorText(failure));
            return false;
        } finally {
            setBusy(false);
        }
    }, [refreshAccount]);

    return {
        available: !isOldHost() && config?.configured === true,
        account,
        syncState,
        busy,
        error,
        clearError: () => setError(""),
        signIn,
        leave,
        deleteAll,
        syncNow: () => run("apply"),
    };
}
