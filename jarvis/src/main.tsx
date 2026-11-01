import { createRoot } from "react-dom/client";
import App from "./App.tsx";
// Letras guardadas en la laptop (antes se bajaban de internet en cada arranque y lo hacían más lento)
import "@fontsource/chakra-petch/400.css";
import "@fontsource/chakra-petch/500.css";
import "@fontsource/chakra-petch/600.css";
import "@fontsource/chakra-petch/700.css";
import "@fontsource/chakra-petch/400-italic.css";
import "@fontsource/jetbrains-mono/400.css";
import "@fontsource/jetbrains-mono/500.css";
import "@fontsource/jetbrains-mono/600.css";
import "@fontsource/jetbrains-mono/700.css";
import "katex/dist/katex.min.css";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
