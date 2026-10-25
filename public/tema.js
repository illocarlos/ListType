// Modo día / noche. Se carga antes de pintar la app (sin esperar al resto) para que no haya un destello del modo contrario.
// Una sola copia de la lógica: la app (src/helpers/theme.ts) solo llama a window.mercaTema.
//
// Modos (se guardan en este móvil, en localStorage «theme:v1»):
//   hora   (por defecto) claro de día, oscuro de noche, según la hora del dispositivo y la salida y puesta del sol
//   movil  igual que el ajuste claro/oscuro del móvil o del navegador
//   claro  siempre claro
//   oscuro siempre oscuro
//
// La salida y puesta del sol se calculan con la fórmula aproximada de la NOAA para el centro de la España peninsular
// (40° N, 3,7° O). Sirve a unos minutos de error para toda España; no usa ubicación ni red.
(function () {
    'use strict';
    var KEY = 'theme:v1';
    var MODES = ['hora', 'movil', 'claro', 'oscuro'];
    var LAT = 40.0;
    var LON = -3.7;
    var BAR = { light: '#1f4f31', dark: '#16261c' };
    var root = document.documentElement;
    var mode = 'hora';

    function rad(deg) { return deg * Math.PI / 180; }

    // Minutos UTC (desde las 0:00 UTC del día de «date») de salida y puesta del sol
    function sun(date) {
        var start = Date.UTC(date.getUTCFullYear(), 0, 0);
        var day = Math.floor((Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()) - start) / 86400000);
        var g = 2 * Math.PI / 365 * (day - 1);
        var eqtime = 229.18 * (0.000075 + 0.001868 * Math.cos(g) - 0.032077 * Math.sin(g) - 0.014615 * Math.cos(2 * g) - 0.040849 * Math.sin(2 * g));
        var decl = 0.006918 - 0.399912 * Math.cos(g) + 0.070257 * Math.sin(g) - 0.006758 * Math.cos(2 * g) + 0.000907 * Math.sin(2 * g) - 0.002697 * Math.cos(3 * g) + 0.00148 * Math.sin(3 * g);
        var cosHa = Math.cos(rad(90.833)) / (Math.cos(rad(LAT)) * Math.cos(decl)) - Math.tan(rad(LAT)) * Math.tan(decl);
        var ha = Math.acos(Math.max(-1, Math.min(1, cosHa))) * 180 / Math.PI;
        return { rise: 720 - 4 * (LON + ha) - eqtime, set: 720 - 4 * (LON - ha) - eqtime };
    }

    function isDay(now) {
        var date = new Date(now);
        var s = sun(date);
        var minutes = date.getUTCHours() * 60 + date.getUTCMinutes() + date.getUTCSeconds() / 60;
        return minutes >= s.rise && minutes < s.set;
    }

    function systemDark() {
        return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches;
    }

    function resolve(chosen, now) {
        if (chosen === 'claro') return 'light';
        if (chosen === 'oscuro') return 'dark';
        if (chosen === 'movil') return systemDark() ? 'dark' : 'light';
        return isDay(now === undefined ? Date.now() : now) ? 'light' : 'dark';
    }

    function readMode() {
        try {
            var saved = localStorage.getItem(KEY);
            return MODES.indexOf(saved) >= 0 ? saved : 'hora';
        } catch (e) {
            return 'hora';
        }
    }

    function apply() {
        var theme = resolve(mode);
        var changed = root.getAttribute('data-theme') !== theme;
        root.setAttribute('data-theme', theme);
        var scheme = document.querySelector('meta[name="color-scheme"]');
        if (scheme) scheme.setAttribute('content', theme);
        var bars = document.querySelectorAll('meta[name="theme-color"]');
        for (var i = 0; i < bars.length; i++) {
            bars[i].removeAttribute('media');
            bars[i].setAttribute('content', BAR[theme]);
        }
        if (changed) window.dispatchEvent(new Event('merca-tema'));
    }

    function setMode(next) {
        if (MODES.indexOf(next) < 0) return;
        mode = next;
        try { localStorage.setItem(KEY, next); } catch (e) { /* sin almacenamiento: vale para esta visita */ }
        apply();
        window.dispatchEvent(new Event('merca-tema'));
    }

    mode = readMode();
    apply();
    // El modo del móvil puede cambiar en vivo; la hora, al pasar el tiempo o al volver a la app
    if (typeof matchMedia === 'function') {
        var query = matchMedia('(prefers-color-scheme: dark)');
        var onSystem = function () { if (mode === 'movil') apply(); };
        if (query.addEventListener) query.addEventListener('change', onSystem); else if (query.addListener) query.addListener(onSystem);
    }
    setInterval(function () { if (mode === 'hora') apply(); }, 30000);
    document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') apply(); });

    window.mercaTema = {
        modes: MODES,
        getMode: function () { return mode; },
        getTheme: function () { return root.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; },
        setMode: setMode,
        resolve: resolve,
        sun: sun,
        isDay: isDay,
    };
})();
