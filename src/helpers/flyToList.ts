// Animación de "se ha añadido a la lista": un círculo con "+1" sale del botón y vuela hasta la lista
// (el botón «Lista» de la barra de abajo en el móvil, o la columna de la lista en escritorio), que da un saltito.
// Con "reducir movimiento" activado no se mueve nada (el botón ya enseña un ✓).
export function flyToList(from: HTMLElement) {
    if (typeof window === "undefined" || !from.animate) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const target = [...document.querySelectorAll<HTMLElement>("[data-list-target]")]
        .find(element => element.getBoundingClientRect().width > 0);
    if (!target) return;
    const start = from.getBoundingClientRect();
    const end = target.getBoundingClientRect();
    const size = 32;
    const dot = document.createElement("div");
    dot.setAttribute("aria-hidden", "true");
    dot.textContent = "+1";
    dot.className = "pointer-events-none fixed z-[70] grid place-items-center rounded-full bg-accent text-on-accent text-sm font-extrabold shadow-pop";
    Object.assign(dot.style, {
        width: `${size}px`,
        height: `${size}px`,
        left: `${start.left + start.width / 2 - size / 2}px`,
        top: `${start.top + start.height / 2 - size / 2}px`,
    });
    document.body.appendChild(dot);
    const dx = end.left + end.width / 2 - (start.left + start.width / 2);
    const dy = end.top + Math.min(end.height, 48) / 2 - (start.top + start.height / 2);
    const flight = dot.animate([
        // Sin desvanecer: así el "+1" se lee bien (buen contraste) durante todo el vuelo
        { transform: "translate(0, 0) scale(1)" },
        { transform: `translate(${dx * 0.5}px, ${dy * 0.5 - 60}px) scale(1.1)`, offset: 0.45 },
        { transform: `translate(${dx}px, ${dy}px) scale(0.5)` },
    ], { duration: 650, easing: "cubic-bezier(.5,0,.75,1)" });
    flight.onfinish = flight.oncancel = () => {
        dot.remove();
        // La columna de escritorio es grande: un saltito apenas perceptible; el botón del móvil, más marcado
        const bump = end.height > 120 ? 1.015 : 1.12;
        target.animate([
            { transform: "scale(1)" },
            { transform: `scale(${bump})` },
            { transform: "scale(1)" },
        ], { duration: 320, easing: "ease-out" });
    };
}
