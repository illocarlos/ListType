import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import {
    accountErrorText, cancelPendingLogin, claimLogin, deleteAccountData, fetchAccountConfig, finishLogin, getSyncState, hasPendingLogin,
    hasPendingRemote, isAccountKey, loadAccount, onSyncState, resetSyncState, signOut, startGoogleLogin, syncNow, takeGoogleResult,
    takeReturnInvite, type AccountConfig, type AccountState,
} from "../helpers/account";
import { needsInstallFirst } from "../helpers/install";
import { isOldHost } from "../helpers/move";

// Cuenta opcional con Google. Cuándo se sincroniza (sin sondeos: cada comprobación cuesta una operación en la base de datos):
// - al abrir la app y al volver a ella: sube lo cambiado y aplica lo que llegó de otros móviles (recarga si hay cambios);
// - unos segundos después de cambiar algo: solo sube (no toca lo que la persona tiene en pantalla);
// - si hay cosas de otros móviles sin aplicar y llevas medio minuto sin tocar nada: las aplica.
// Entrar: si Google se abre en otra ventana (iPhone con la app en la pantalla de inicio), la app espera con un sondeo corto
// (cada 5 s, solo mientras está a la vista y como mucho 10 minutos) a que se termine allí.
const PUSH_DELAY_MS = 4000;
const PUSH_MAX_WAIT_MS = 30_000;
const IDLE_APPLY_MS = 30_000;
const CLAIM_EVERY_MS = 5000;
const CONFIG_KEY = "account:config";

type ConfigHint = { required: boolean, clientId: string | null };

// Lo último que dijo el servidor sobre si la cuenta es obligatoria: así, al abrir sin conexión (o antes de que conteste)
// no se enseña la app un instante para luego taparla
function readHint(): ConfigHint | null {
    try {
        const raw = JSON.parse(localStorage.getItem(CONFIG_KEY) || "null") as Partial<ConfigHint> | null;
        if (raw && typeof raw === "object") return { required: raw.required === true, clientId: typeof raw.clientId === "string" ? raw.clientId : null };
    } catch {
        // sin pista guardada
    }
    return null;
}

function saveHint(config: AccountConfig) {
    try {
        if (config.configured) localStorage.setItem(CONFIG_KEY, JSON.stringify({ required: config.required, clientId: config.clientId }));
        else localStorage.removeItem(CONFIG_KEY);
    } catch {
        // sin sitio
    }
}

export default function useAccount() {
    const [config, setConfig] = useState<AccountConfig | null>(null);
    const [hint] = useState<ConfigHint | null>(readHint);
    const [account, setAccount] = useState<AccountState | null>(loadAccount);
    const syncState = useSyncExternalStore(onSyncState, getSyncState);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    // Se empezó a entrar y falta que se termine en la ventana de Google
    const [waiting, setWaiting] = useState<boolean>(hasPendingLogin);
    // Esta página es la ventana a la que Google devolvió, pero la sesión la recoge la app desde la que se empezó
    const [returned, setReturned] = useState<boolean>(false);
    const accountRef = useRef(account);
    accountRef.current = account;
    const claiming = useRef<boolean>(false);

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

    // Ya con la sesión recogida: primera sincronización (recarga si cambia lo que se ve) y, si se entró para abrir una invitación, se retoma
    const completeLogin = useCallback(async (wiped: boolean) => {
        refreshAccount();
        const reload = await syncNow("apply");
        setAccount(loadAccount());
        if (reload || wiped) {
            window.location.reload();
            return;
        }
        const invite = takeReturnInvite();
        if (invite) window.location.hash = invite;
    }, [refreshAccount]);

    // Al abrir: ¿está activada la cuenta? ¿venimos de Google? ¿hay que sincronizar?
    useEffect(() => {
        if (isOldHost()) return;
        let cancelled = false;
        fetchAccountConfig().then(result => {
            if (cancelled) return;
            setConfig(result);
            if (!result.failed) saveHint(result);
        });
        const result = takeGoogleResult();
        if (result && "credential" in result) {
            // Esta página recoge la sesión por sí misma: el sondeo de espera no debe competir (el recado se recoge una sola vez)
            claiming.current = true;
            setWaiting(false);
            setBusy(true);
            finishLogin(result.credential, result.state)
                .then(async outcome => {
                    if (outcome.where === "elsewhere") {
                        setReturned(true);
                        return;
                    }
                    setWaiting(false);
                    await completeLogin(outcome.wiped);
                })
                .catch(failure => setError(accountErrorText(failure)))
                .finally(() => {
                    claiming.current = false;
                    setBusy(false);
                });
        } else if (result) {
            setError(result.error === "access_denied" ? "Has cancelado la entrada con Google." : "Google no ha dejado entrar. Inténtalo otra vez.");
        } else if (loadAccount()) {
            // La invitación con la que se abrió la app antes de entrar se retoma tras entrar (y recargar)
            const invite = takeReturnInvite();
            if (invite) window.location.hash = invite;
            void run("apply");
        }
        return () => {
            cancelled = true;
        };
    }, [run, completeLogin]);

    // Esperando a que se termine de entrar en la ventana de Google: se intenta recoger la sesión al volver a la app y cada pocos segundos
    useEffect(() => {
        if (!waiting || account) return;
        const attempt = async () => {
            if (claiming.current || document.visibilityState !== "visible") return;
            if (!hasPendingLogin()) {
                setWaiting(false);
                return;
            }
            claiming.current = true;
            try {
                const outcome = await claimLogin();
                if (outcome === "waiting") {
                    if (!hasPendingLogin()) setWaiting(false);
                    return;
                }
                setWaiting(false);
                await completeLogin(outcome === "wiped");
            } catch (failure) {
                setWaiting(false);
                setError(accountErrorText(failure));
            } finally {
                claiming.current = false;
            }
        };
        void attempt();
        const timer = window.setInterval(() => void attempt(), CLAIM_EVERY_MS);
        document.addEventListener("visibilitychange", attempt);
        return () => {
            window.clearInterval(timer);
            document.removeEventListener("visibilitychange", attempt);
        };
    }, [waiting, account, completeLogin]);

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

    // Con el servidor sin contestar se usa lo último que dijo
    const known: ConfigHint | null = config && !config.failed ? config : hint;
    const clientId = known?.clientId ?? null;

    const signIn = useCallback((keepInvite?: boolean) => {
        setError("");
        if (!clientId) return;
        // En un móvil solo se entra desde la app instalada (la pantalla ya no ofrece el botón; esto cubre cualquier otro camino)
        if (needsInstallFirst()) {
            setError("Para entrar, instala primero la app en tu móvil y ábrela desde su icono.");
            return;
        }
        startGoogleLogin(clientId, keepInvite === true)
            .then(() => setWaiting(true))
            .catch(failure => setError(accountErrorText(failure)));
    }, [clientId]);

    const cancelLogin = useCallback(() => {
        cancelPendingLogin();
        setWaiting(false);
    }, []);

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

    const old = isOldHost();
    return {
        // El botón de la cabecera: con cuenta, siempre (aunque no haya conexión para preguntar al servidor)
        available: !old && (account !== null || config?.configured === true),
        // Sin cuenta y con la entrada obligatoria: la app se tapa con la pantalla de entrada
        gate: !old && account === null && !returned && known?.required === true && clientId !== null,
        returned,
        waiting,
        account,
        syncState,
        busy,
        error,
        clearError: () => setError(""),
        signIn,
        cancelLogin,
        leave,
        deleteAll,
        syncNow: () => run("apply"),
    };
}
