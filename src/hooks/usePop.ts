import { useLayoutEffect, useRef } from "react"

// Un «saltito» (crece y vuelve) en el elemento cuando cambia el valor. No se anima la primera vez (al abrir la app)
// ni con «reducir movimiento». Solo transform, 320 ms.
export default function usePop<T extends HTMLElement>(value: unknown) {
    const ref = useRef<T>(null)
    const previous = useRef<unknown>(value)
    useLayoutEffect(() => {
        if (Object.is(previous.current, value)) return
        previous.current = value
        if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
        ref.current?.animate?.(
            [{ transform: "scale(1)" }, { transform: "scale(1.45)", offset: 0.35 }, { transform: "scale(1)" }],
            { duration: 320, easing: "cubic-bezier(.2,.8,.2,1)" },
        )
    }, [value])
    return ref
}
