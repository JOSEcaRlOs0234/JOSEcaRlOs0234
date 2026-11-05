import React from "react";
import katex from "katex";

/**
 * Fórmulas bonitas: Gemini escribe las fórmulas en LaTeX (por ejemplo $E = mc^2$ o $$\frac{a}{b}$$)
 * y aquí se dibujan como en un libro (con KaTeX), en lugar de verse como código.
 * KaTeX genera su propio HTML seguro (no permite comandos peligrosos).
 */

// $$...$$, \[...\], $...$ y \(...\)
const PATRON = /(\$\$[\s\S]+?\$\$|\\\[[\s\S]+?\\\]|\$[^$\n]+?\$|\\\([\s\S]+?\\\))/g;

function dibujar(latex: string, enBloque: boolean): string | null {
  try {
    return katex.renderToString(latex, { displayMode: enBloque, throwOnError: true, strict: "ignore", trust: false });
  } catch {
    return null;
  }
}

/** ¿Este pedazo parece una fórmula? En línea no puede empezar ni terminar con espacio (así "$50 y $80" no cuenta). */
function pareceFormula(dentro: string, enBloque: boolean): boolean {
  return dentro.trim().length > 0 && (enBloque || !/^\s|\s$/.test(dentro));
}

/**
 * Parte un texto en pedazos normales y fórmulas. `normal` decide cómo se dibuja el texto que no es fórmula
 * (por ejemplo con **negritas**).
 */
export function conFormulas(texto: string, normal: (t: string, clave: string) => React.ReactNode): React.ReactNode[] {
  const partes = texto.split(PATRON);
  return partes.map((parte, i) => {
    if (i % 2 === 1) {
      const enBloque = parte.startsWith("$$") || parte.startsWith("\\[");
      const dentro = enBloque ? parte.slice(2, -2) : parte.slice(parte.startsWith("$") ? 1 : 2, parte.startsWith("$") ? -1 : -2);
      const html = pareceFormula(dentro, enBloque) ? dibujar(dentro.trim(), enBloque) : null;
      if (html) {
        return enBloque ? (
          <span key={i} className="formula-bloque block my-2 overflow-x-auto" dangerouslySetInnerHTML={{ __html: html }} />
        ) : (
          <span key={i} className="formula" dangerouslySetInnerHTML={{ __html: html }} />
        );
      }
    }
    return <React.Fragment key={i}>{normal(parte, String(i))}</React.Fragment>;
  });
}

/** Texto con fórmulas (para el chat y las notas). */
export const TextoConFormulas: React.FC<{ texto: string }> = ({ texto }) => <>{conFormulas(texto, (t) => t)}</>;

/**
 * Convierte fórmulas a palabras para decirlas en voz alta (la voz no puede leer "\frac{a}{b}").
 * Es aproximado: lo importante es que no lea símbolos de código.
 */
export function formulasEnPalabras(texto: string): string {
  return texto
    .replace(/\$\$?|\\\[|\\\]|\\\(|\\\)/g, "")
    .replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, "$1 entre $2")
    .replace(/\\sqrt\{([^{}]+)\}/g, "raíz de $1")
    .replace(/\^\{?2\}?/g, " al cuadrado")
    .replace(/\^\{?3\}?/g, " al cubo")
    .replace(/\^\{([^{}]+)\}|\^(\w)/g, " a la $1$2")
    .replace(/_\{([^{}]+)\}|_(\w)/g, " sub $1$2")
    .replace(/\\(cdot|times)/g, " por ")
    .replace(/\\div/g, " entre ")
    .replace(/\\pm/g, " más menos ")
    .replace(/\\(leq|le)\b/g, " menor o igual que ")
    .replace(/\\(geq|ge)\b/g, " mayor o igual que ")
    .replace(/\\neq/g, " diferente de ")
    .replace(/\\approx/g, " aproximadamente ")
    .replace(/\\(rightarrow|to)\b/g, " produce ")
    .replace(/\\Delta/g, " delta ")
    .replace(/\\pi/g, " pi ")
    .replace(/\\(alpha|beta|gamma|theta|lambda|mu|sigma|omega)/g, " $1 ")
    .replace(/\\text\{([^{}]*)\}|\\mathrm\{([^{}]*)\}/g, "$1$2")
    .replace(/\\[a-zA-Z]+/g, " ")
    .replace(/[{}]/g, "")
    .replace(/\s{2,}/g, " ");
}
