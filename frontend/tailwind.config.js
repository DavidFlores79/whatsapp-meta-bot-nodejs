/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{html,ts}",
  ],
  theme: {
    extend: {
      colors: {
        'whatsapp-green': '#00a884',
        'whatsapp-dark': '#111b21',
        'whatsapp-gray': '#202c33',
        'whatsapp-input': '#2a3942',
        'whatsapp-light': '#f0f2f5',
        'incoming-message': '#202c33',
        'outgoing-message': '#056162',
      }
    },
  },
  plugins: [],
}
