import { Loader2 } from "lucide-react";
import ZoneCard from "./ZoneCard.tsx";
import type { Zone } from "../helpers/mercadona";

// Pantallas a pantalla completa justo después de entrar con la cuenta, cuando aún no hay zona de precios:
// - ZoneLoading: la cuenta se está sincronizando (puede traer la zona de otro móvil, y entonces no se pregunta).
// - ZoneScreen: dos botones (usar mi ubicación / escribir el código postal); «Ahora no» deja los precios generales.

const quiet = "w-full h-12 rounded-md border border-border bg-surface text-base font-semibold hover:bg-surface-sunk";

export const ZoneLoading = () => (
    <main aria-busy="true" className="min-h-screen grid place-items-center bg-bg px-4 py-10 safe-top safe-bottom">
        <p role="status" className="inline-flex items-center gap-2 text-base">
            <Loader2 size={20} aria-hidden="true" className="animate-spin" />
            Preparando tu cuenta…
        </p>
    </main>
);

type ZoneScreenProps = {
    zone: Zone | null,
    onChange: (postalCode: string) => Promise<string | null>,
    onSkip: () => void,
};

export const ZoneScreen = ({ zone, onChange, onSkip }: ZoneScreenProps) => (
    <main className="min-h-screen grid place-items-center bg-bg px-4 py-10 safe-top safe-bottom">
        <div className="w-full max-w-sm anim-fade-in">
            <h1 className="text-2xl font-bold">MercaLista</h1>
            <p className="mt-3 mb-4 text-base">Un último paso: elige tu zona para ver los precios de tu Mercadona.</p>
            <ZoneCard zone={zone} onChange={onChange} />
            <button type="button" onClick={onSkip} className={quiet}>Ahora no, ver precios generales</button>
        </div>
    </main>
);
