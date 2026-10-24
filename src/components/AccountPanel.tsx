import { useState } from "react";
import { Check, CloudOff, LogOut, RefreshCw, Trash2, UserRound } from "lucide-react";
import type { AccountState, SyncState } from "../helpers/account";

const STATE_TEXT: Record<SyncState, string> = {
    off: "",
    idle: "Pendiente de sincronizar",
    syncing: "Sincronizando…",
    ok: "Al día: tus datos están guardados en tu cuenta",
    offline: "Sin conexión: se sincronizará al volver",
    error: "No se ha podido sincronizar ahora; se reintentará",
    signedout: "La sesión ha caducado: vuelve a entrar para seguir sincronizando",
};

type Props = {
    account: AccountState | null,
    syncState: SyncState,
    busy: boolean,
    waiting: boolean,
    error: string,
    onSignIn: () => void,
    onCancelLogin: () => void,
    onSyncNow: () => void,
    onLeave: (wipe: boolean) => void,
    onDeleteAll: () => Promise<boolean>,
    onClose: () => void,
};

const primary = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-60";
const outline = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-60";
const quiet = "w-full h-12 rounded-md border border-border bg-surface text-base font-semibold hover:bg-surface-sunk disabled:opacity-60";

const WhatIsSaved = () => (
    <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
        <li>Se guarda en internet una copia de tus listas, favoritos y colecciones, tu nombre, tu código postal y el historial de precios, ligada a tu cuenta de Google.</li>
        <li>No se guarda tu correo ni tu nombre de Google: solo un identificador que Google da a esta app.</li>
        <li>Las listas compartidas siguen funcionando con su enlace; la cuenta solo recuerda cuáles son, para que entres en ellas desde otro móvil.</li>
        <li>Si no entras, la app sigue igual que siempre, solo en este móvil. Puedes borrarlo todo cuando quieras.</li>
    </ul>
);

const AccountPanel = ({ account, syncState, busy, waiting, error, onSignIn, onCancelLogin, onSyncNow, onLeave, onDeleteAll, onClose }: Props) => {
    const [confirm, setConfirm] = useState<"leave" | "delete" | null>(null);
    const [deleted, setDeleted] = useState<boolean>(false);

    if (!account) {
        return (
            <div className="p-4">
                {deleted && <p role="status" className="mb-3 rounded-md bg-surface-sunk p-3 text-base font-semibold">Tu cuenta y tus datos se han borrado de internet. Lo de este móvil se queda.</p>}
                <p className="text-base">Entra con Google para tener tus listas y favoritos en todos tus móviles y no perderlos si cambias de teléfono.</p>
                <WhatIsSaved />
                <button type="button" onClick={onSignIn} disabled={busy || waiting} className={`mt-4 ${primary}`}>
                    <UserRound size={20} aria-hidden="true" />
                    {busy ? "Entrando…" : "Entrar con Google"}
                </button>
                {waiting && (
                    <div role="status" className="mt-3 rounded-md bg-surface-sunk p-3 text-base">
                        <p className="font-semibold">Esperando a que termines de entrar en Google…</p>
                        <p className="mt-1 text-sm text-muted">Cuando acabes, vuelve a esta app: se completa sola en unos segundos.</p>
                        <button type="button" onClick={onCancelLogin} className={`mt-3 ${quiet}`}>Cancelar</button>
                    </div>
                )}
                {error && <p role="alert" className="mt-3 text-base font-semibold text-danger">{error}</p>}
                <p className="mt-4 text-sm text-muted">
                    En un iPhone con la app en la pantalla de inicio, Google se abre en una ventana de Safari. Al terminar, vuelve a la app
                    (cierra esa ventana con «OK» o cambia a MercaLista): recoge la entrada sola.
                </p>
            </div>
        );
    }

    const signedOut = syncState === "signedout";
    return (
        <div className="p-4">
            <p className="flex items-center gap-2 text-base font-semibold">
                <UserRound size={20} aria-hidden="true" className="flex-none text-accent-strong" />
                <span className="min-w-0 break-words">{account.email || account.name || "Cuenta de Google"}</span>
            </p>
            <p role="status" className="mt-2 flex items-center gap-2 text-base">
                {syncState === "ok" ? <Check size={18} aria-hidden="true" className="flex-none text-accent-strong" />
                    : syncState === "syncing" ? <RefreshCw size={18} aria-hidden="true" className="flex-none text-accent-strong motion-safe:animate-spin" />
                        : <CloudOff size={18} aria-hidden="true" className="flex-none text-danger" />}
                {STATE_TEXT[syncState] || STATE_TEXT.idle}
            </p>
            <div className="mt-3 space-y-2">
                {signedOut
                    ? <button type="button" onClick={onSignIn} disabled={busy} className={primary}><UserRound size={20} aria-hidden="true" />Volver a entrar con Google</button>
                    : <button type="button" onClick={onSyncNow} disabled={busy || syncState === "syncing"} className={outline}><RefreshCw size={20} aria-hidden="true" />Sincronizar ahora</button>}
            </div>
            <WhatIsSaved />
            {error && <p role="alert" className="mt-3 text-base font-semibold text-danger">{error}</p>}

            <div className="mt-6 space-y-3 border-t border-border pt-4">
                {confirm === "leave" ? (
                    <div className="rounded-md bg-surface-sunk p-3">
                        <p className="text-base">¿Qué hago con los datos de este móvil?</p>
                        <p className="mt-1 text-sm text-muted">Tu cuenta no se toca: podrás volver a entrar. Si otra persona entra en este móvil con su cuenta, sus datos sustituirán a los de este.</p>
                        <div className="mt-3 space-y-2">
                            <button type="button" disabled={busy} onClick={() => { setConfirm(null); onLeave(false); onClose(); }} className={outline}>Salir y dejarlos en este móvil</button>
                            <button type="button" disabled={busy} onClick={() => { setConfirm(null); onLeave(true); }} className="w-full h-12 rounded-md bg-danger px-4 text-base font-semibold text-on-danger disabled:opacity-60">Salir y borrarlos de este móvil</button>
                            <button type="button" onClick={() => setConfirm(null)} className={quiet}>Cancelar</button>
                        </div>
                    </div>
                ) : confirm === "delete" ? (
                    <div className="rounded-md bg-surface-sunk p-3">
                        <p className="text-base">Se borran de internet tus datos y todas tus sesiones (también en tus otros móviles). Lo que tienes en este móvil se queda.</p>
                        <div className="mt-3 space-y-2">
                            <button
                                type="button"
                                disabled={busy}
                                onClick={async () => {
                                    if (await onDeleteAll()) {
                                        setConfirm(null);
                                        setDeleted(true);
                                    }
                                }}
                                className="w-full h-12 rounded-md bg-danger px-4 text-base font-semibold text-on-danger disabled:opacity-60"
                            >
                                Sí, borrar mi cuenta y mis datos
                            </button>
                            <button type="button" onClick={() => setConfirm(null)} className={quiet}>Cancelar</button>
                        </div>
                    </div>
                ) : (
                    <>
                        <button type="button" onClick={() => setConfirm("leave")} className="h-11 px-2 inline-flex items-center gap-2 rounded-md text-base font-semibold hover:bg-surface-sunk">
                            <LogOut size={20} aria-hidden="true" />
                            Salir de la cuenta en este móvil
                        </button>
                        <button type="button" onClick={() => setConfirm("delete")} className="h-11 px-2 flex items-center gap-2 rounded-md text-base font-semibold text-danger hover:bg-surface-sunk">
                            <Trash2 size={20} aria-hidden="true" />
                            Borrar mi cuenta y mis datos
                        </button>
                    </>
                )}
            </div>
        </div>
    );
};

export default AccountPanel;
