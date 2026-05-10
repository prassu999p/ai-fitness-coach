import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        'surface': '#131313',
        'surface-dim': '#131313',
        'surface-bright': '#393939',
        'surface-container-lowest': '#0e0e0e',
        'surface-container-low': '#1c1b1b',
        'surface-container': '#201f1f',
        'surface-container-high': '#2a2a2a',
        'surface-container-highest': '#353534',
        'on-surface': '#e5e2e1',
        'on-surface-variant': '#c4c9ac',
        'primary-container': '#c3f400',
        'primary-fixed-dim': '#abd600',
        'on-primary-container': '#556d00',
        'on-primary': '#283500',
        'secondary-container': '#00e0ff',
        'on-secondary-container': '#005f6d',
        'on-secondary': '#00363f',
        'outline': '#8e9379',
        'outline-variant': '#444933',
        'error': '#ffb4ab',
        'error-container': '#93000a',
        'surface-variant': '#353534',
        'surface-tint': '#abd600',
        'inverse-surface': '#e5e2e1',
        'inverse-on-surface': '#313030',
        'background': '#131313',
        'on-background': '#e5e2e1',
      },
      fontFamily: {
        'display': ['Anton', 'sans-serif'],
        'body': ['Lexend', 'sans-serif'],
        'mono': ['JetBrains Mono', 'monospace'],
        sans: ['Lexend', 'sans-serif'],
      },
      borderRadius: {
        'DEFAULT': '0.5rem',
        'sm': '0.25rem',
        'md': '0.75rem',
        'lg': '1rem',
        'xl': '1.5rem',
        'full': '9999px',
      },
    },
  },
  plugins: [],
}
export default config
