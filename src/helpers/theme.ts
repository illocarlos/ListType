// Modo día / noche. La lógica vive en public/tema.js (se ejecuta antes de pintar para que no haya destello);
// aquí solo se lee y se cambia desde la app.

export type ThemeMode = "hora" | "movil" | "claro" | "oscuro";

type MercaTema = {
    getMode: () => ThemeMode,
    getTheme: () => "light" | "dark",
    setMode: (mode: ThemeMode) => void,
};

const api = (): MercaTema | null => (typeof window !== "undefined" ? (window as unknown as { mercaTema?: MercaTema }).mercaTema ?? null : null);

export const themeAvailable = (): boolean => api() !== null;
export const getThemeMode = (): ThemeMode => api()?.getMode() ?? "hora";
export const getTheme = (): "light" | "dark" => api()?.getTheme() ?? "light";
export const setThemeMode = (mode: ThemeMode) => api()?.setMode(mode);

export function subscribeTheme(listener: () => void) {
    window.addEventListener("merca-tema", listener);
    return () => window.removeEventListener("merca-tema", listener);
}
