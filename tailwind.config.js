/** @type {import('tailwindcss').Config} */
const role = name => `rgb(var(--color-${name}) / <alpha-value>)`

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}"

  ],
  theme: {
    extend: {
      // Roles de color de replica/design/tokens.json
      colors: {
        bg: role('bg'),
        surface: role('surface'),
        'surface-sunk': role('surface-sunk'),
        border: role('border'),
        'border-input': role('border-input'),
        text: role('text'),
        muted: role('text-muted'),
        accent: role('accent'),
        'accent-strong': role('accent-strong'),
        'on-accent': role('on-accent'),
        'accent-soft': role('accent-soft'),
        'on-accent-soft': role('on-accent-soft'),
        highlight: role('highlight'),
        'on-highlight': role('on-highlight'),
        danger: role('danger'),
        'on-danger': role('on-danger'),
      },
      fontFamily: {
        sans: ['Onest', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'sans-serif'],
      },
      fontSize: {
        xs: ['12px', { lineHeight: '16px' }],
        sm: ['14px', { lineHeight: '20px' }],
        base: ['16px', { lineHeight: '24px' }],
        lg: ['18px', { lineHeight: '24px' }],
        xl: ['22px', { lineHeight: '28px' }],
        display: ['32px', { lineHeight: '36px' }],
      },
      borderRadius: {
        sm: '6px',
        md: '12px',
        lg: '20px',
        pill: '999px',
      },
      boxShadow: {
        bar: 'var(--shadow-bar)',
        pop: 'var(--shadow-pop)',
      },
      maxWidth: {
        content: '1120px',
      },
      width: {
        panel: '380px',
      },
      transitionTimingFunction: {
        brand: 'var(--ease)',
      },
    },
  },
  plugins: [],
}
