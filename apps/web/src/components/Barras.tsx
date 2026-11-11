import { useNavigate } from "react-router";
import { numero, pct } from "../lib/formato";
import { cx, Ponto } from "./ui";

export type LinhaBarra = {
  chave: string;
  rotulo: string;
  sub?: string;
  valor: number;
  /** cor da barra (identidade). Sem cor = cor de destaque única (magnitude) */
  cor?: string | null;
  /** bolinha antes do rótulo, quando a barra é de cor única */
  ponto?: string | null;
  link?: string;
};

/** Barras horizontais em HTML: rótulo à esquerda, valor à direita, clique leva à lista filtrada */
export function ListaBarras({ linhas, total, max = 12, vazio = "Sem dados no período" }: { linhas: LinhaBarra[]; total: number; max?: number; vazio?: string }) {
  const nav = useNavigate();
  if (!linhas.length) return <p className="py-6 text-center text-sm text-muted">{vazio}</p>;
  const visiveis = linhas.slice(0, max);
  const resto = linhas.slice(max).reduce((s, l) => s + l.valor, 0);
  const maior = Math.max(...visiveis.map((l) => l.valor), 1);
  return (
    <ul className="grid gap-1">
      {visiveis.map((l) => (
        <li key={l.chave}>
          <button
            type="button"
            disabled={!l.link}
            onClick={() => l.link && nav(l.link)}
            title={`${l.rotulo}: ${numero(l.valor)} (${pct(l.valor, total)})`}
            className={cx(
              "group grid w-full grid-cols-[minmax(0,11rem)_1fr_auto] items-center gap-3 rounded-md px-1.5 py-1 text-left",
              l.link && "hover:bg-surface-2 cursor-pointer",
            )}
          >
            <span className="flex min-w-0 items-center gap-2 text-[13px] text-ink">
              {l.ponto !== undefined && <Ponto cor={l.ponto} />}
              <span className="min-w-0">
                <span className="block truncate">{l.rotulo}</span>
                {l.sub && <span className="block truncate text-[11px] text-muted">{l.sub}</span>}
              </span>
            </span>
            <span className="h-3.5 rounded-r bg-transparent">
              <span
                className="block h-full rounded-r-[4px] transition-[width] duration-300"
                style={{ width: `${Math.max(2, (l.valor / maior) * 100)}%`, background: l.cor ?? "var(--accent)" }}
              />
            </span>
            <span className="w-16 text-right text-[13px] tabular">
              <span className="font-medium text-ink">{numero(l.valor)}</span>
              <span className="ml-1 text-[11px] text-muted">{pct(l.valor, total)}</span>
            </span>
          </button>
        </li>
      ))}
      {resto > 0 && (
        <li className="px-1.5 pt-1 text-xs text-muted">
          + {linhas.length - max} outros com {numero(resto)} atendimento(s)
        </li>
      )}
    </ul>
  );
}

/** Uma barra única dividida em partes (participação de cada empresa) */
export function BarraParticipacao({ partes }: { partes: { chave: string; rotulo: string; valor: number; cor: string }[] }) {
  const total = partes.reduce((s, p) => s + p.valor, 0);
  if (!total) return null;
  return (
    <div className="grid gap-2">
      <div className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]">
        {partes.map((p) => (
          <span key={p.chave} title={`${p.rotulo}: ${numero(p.valor)} (${pct(p.valor, total)})`} style={{ width: `${(p.valor / total) * 100}%`, background: p.cor }} />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-1">
        {partes.map((p) => (
          <span key={p.chave} className="flex items-center gap-1.5 text-xs text-ink-2">
            <Ponto cor={p.cor} />
            {p.rotulo}
            <span className="font-medium text-ink tabular">{numero(p.valor)}</span>
            <span className="text-muted tabular">{pct(p.valor, total)}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
