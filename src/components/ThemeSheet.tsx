import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { getTheme, getThemeMode, setThemeMode, subscribeTheme, type ThemeMode } from "../helpers/theme";

const OPTIONS: { mode: ThemeMode, title: string, detail: string }[] = [
    { mode: "hora", title: "Según la hora", detail: "Claro de día y oscuro de noche, con la hora de este móvil (salida y puesta del sol aproximadas para España)." },
    { mode: "movil", title: "Como mi móvil", detail: "Sigue el ajuste claro/oscuro del móvil o del navegador." },
    { mode: "claro", title: "Siempre claro", detail: "" },
    { mode: "oscuro", title: "Siempre oscuro", detail: "" },
];

// Elegir cómo se ve la app: se guarda solo en este móvil
const ThemeSheet = () => {
    const mode = useSyncExternalStore(subscribeTheme, getThemeMode, () => "hora" as const);
    const theme = useSyncExternalStore(subscribeTheme, getTheme, () => "light" as const);

    return (
        <div className="p-4">
            <p role="status" className="flex items-center gap-2 text-base font-semibold">
                {theme === "dark" ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
                Ahora se ve en modo {theme === "dark" ? "noche" : "día"}
            </p>
            <fieldset className="mt-3">
                <legend className="sr-only">Cómo se ve la app</legend>
                <div className="space-y-2">
                    {OPTIONS.map(option => (
                        <label
                            key={option.mode}
                            className={`flex items-start gap-3 rounded-md border-2 p-3 cursor-pointer ${mode === option.mode ? "border-accent bg-accent-soft text-on-accent-soft" : "border-border bg-surface hover:bg-surface-sunk"}`}
                        >
                            <input
                                type="radio"
                                name="apariencia"
                                value={option.mode}
                                checked={mode === option.mode}
                                onChange={() => setThemeMode(option.mode)}
                                className="mt-1 h-5 w-5 flex-none accent-accent"
                            />
                            <span className="min-w-0">
                                <span className="block text-base font-semibold">{option.title}</span>
                                {option.detail && <span className="mt-0.5 block text-sm">{option.detail}</span>}
                            </span>
                        </label>
                    ))}
                </div>
            </fieldset>
            <p className="mt-3 text-sm text-muted">Esto se guarda solo en este móvil.</p>
        </div>
    );
};

export default ThemeSheet;
