import { Fragment, useState, type ReactNode } from "react";
import { cx } from "./ui";

/** **negrito** e `código` dentro de uma linha */
function inline(texto: string): ReactNode[] {
  const partes = texto.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  return partes.map((p, i) =>
    p.startsWith("**") && p.endsWith("**") ? (
      <b key={i} className="font-semibold text-ink">
        {p.slice(2, -2)}
      </b>
    ) : p.startsWith("`") && p.endsWith("`") ? (
      <code key={i} className="rounded bg-surface-2 px-1 font-mono text-[0.85em]">
        {p.slice(1, -1)}
      </code>
    ) : (
      <Fragment key={i}>{p}</Fragment>
    ),
  );
}

/**
 * Markdown simples do resumo da plataforma (títulos, listas, negrito), sem HTML cru.
 * Longo? Mostra recolhido com "Ver resumo completo".
 */
export function Markdown({ texto, recolherAcimaDe = 1800 }: { texto: string; recolherAcimaDe?: number }) {
  const [aberto, setAberto] = useState(false);
  const longo = texto.length > recolherAcimaDe;
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (!lista.length) return;
    blocos.push(
      <ul key={`ul${blocos.length}`} className="ml-4 grid list-disc gap-1 marker:text-muted">
        {lista.map((l, i) => (
          <li key={i}>{inline(l)}</li>
        ))}
      </ul>,
    );
    lista = [];
  };

  for (const linha of texto.split("\n")) {
    const t = linha.trim();
    const titulo = t.match(/^(#{1,4})\s+(.*)$/);
    if (/^[-*]\s+/.test(t)) {
      lista.push(t.replace(/^[-*]\s+/, ""));
      continue;
    }
    fecharLista();
    if (!t) continue;
    if (titulo) {
      const nivel = titulo[1]!.length;
      blocos.push(
        <p key={blocos.length} className={cx("font-semibold text-ink", nivel <= 1 ? "text-base" : "pt-1 text-sm")}>
          {inline(titulo[2]!)}
        </p>,
      );
    } else {
      blocos.push(<p key={blocos.length}>{inline(t)}</p>);
    }
  }
  fecharLista();

  return (
    <div className="grid gap-2">
      <div className={cx("relative grid gap-2 text-sm leading-relaxed text-ink-2", longo && !aberto && "max-h-80 overflow-hidden")}>
        {blocos}
        {longo && !aberto && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-surface to-transparent" />}
      </div>
      {longo && (
        <button type="button" onClick={() => setAberto(!aberto)} className="w-fit text-sm font-medium text-accent-ink hover:underline cursor-pointer">
          {aberto ? "Recolher" : "Ver resumo completo"}
        </button>
      )}
    </div>
  );
}
