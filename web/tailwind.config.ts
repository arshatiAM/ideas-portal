import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#10211e",
        sand: "#f7f3ea",
        line: "#e3dccb",
        brand: { DEFAULT: "#0f6b61", dark: "#0a4a43", soft: "#e2f0ed" },
        accent: { DEFAULT: "#c8791a", soft: "#fbefdc" },
      },
    },
  },
  plugins: [],
};

export default config;
