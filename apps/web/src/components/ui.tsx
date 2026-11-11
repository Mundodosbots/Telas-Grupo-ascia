import { AlertTriangle, CheckCircle2, CircleDashed, Hand, Loader2, X, XCircle } from "lucide-react";
import { useEffect, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from "react";
import type { StatusClassificacao } from "../api";

export function cx(...c: (string | false | null | undefined)[]) {
  return c.filter(Boolean).join(" ");
}

type Variante = "primario" | "secundario" | "fantasma" | "perigo";
export function Botao({
  variante = "secundario",
  carregando,
  className,
  children,
  ...p
}: ButtonHTMLAttributes<HTMLButtonElement> & { variante?: Variante; carregando?: boolean }) {
  return (
    <button
      {...p}
      disabled={p.disabled || carregando}
      className={cx(
        "inline-flex items-center justify-center gap-1.5 rounded-lg px-3 h-9 text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer whitespace-nowrap",
        variante === "primario" && "bg-accent text-white hover:brightness-110",
        variante === "secundario" && "border border-line bg-surface text-ink hover:bg-surface-2",
        variante === "fantasma" && "text-ink-2 hover:bg-surface-2 hover:text-ink",
        variante === "perigo" && "border border-line bg-surface text-bad hover:bg-bad-soft",
        className,
      )}
    >
      {carregando && <Loader2 className="size-4 animate-spin" />}
      {children}
    </button>
  );
}

export function Cartao({ titulo, acao, children, className }: { titulo?: ReactNode; acao?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cx("rounded-xl border border-line bg-surface min-w-0", className)}>
      {(titulo || acao) && (
        <header className="flex items-center justify-between gap-3 px-4 pt-3.5 pb-2">
          <h2 className="text-[13px] font-semibold text-ink">{titulo}</h2>
          {acao}
        </header>
      )}
      <div className="px-4 pb-4 pt-1">{children}</div>
    </section>
  );
}

const campoBase =
  "w-full rounded-lg border border-line bg-surface px-3 text-sm text-ink placeholder:text-muted focus:border-accent focus:outline-none";

export function Campo({ rotulo, ajuda, className, ...p }: InputHTMLAttributes<HTMLInputElement> & { rotulo?: string; ajuda?: string }) {
  return (
    <label className={cx("grid gap-1", className)}>
      {rotulo && <span className="text-xs font-medium text-ink-2">{rotulo}</span>}
      <input {...p} className={cx(campoBase, "h-9")} />
      {ajuda && <span className="text-xs text-muted">{ajuda}</span>}
    </label>
  );
}

export function AreaTexto({ rotulo, ajuda, className, ...p }: TextareaHTMLAttributes<HTMLTextAreaElement> & { rotulo?: string; ajuda?: string }) {
  return (
    <label className={cx("grid gap-1", className)}>
      {rotulo && <span className="text-xs font-medium text-ink-2">{rotulo}</span>}
      <textarea {...p} className={cx(campoBase, "py-2 min-h-20")} />
      {ajuda && <span className="text-xs text-muted">{ajuda}</span>}
    </label>
  );
}

export function Selecao({ rotulo, className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement> & { rotulo?: string }) {
  return (
    <label className={cx("grid gap-1 min-w-0", className)}>
      {rotulo && <span className="text-xs font-medium text-ink-2">{rotulo}</span>}
      <select {...p} className={cx(campoBase, "h-9 pr-8")}>
        {children}
      </select>
    </label>
  );
}

export function Ponto({ cor, className }: { cor: string | null | undefined; className?: string }) {
  return <span className={cx("inline-block size-2.5 shrink-0 rounded-full", className)} style={{ background: cor ?? "var(--muted)" }} />;
}

/** Chip com bolinha colorida: o texto fica na cor do tema, a cor carrega só a identidade */
export function Chip({ cor, children, onRemover }: { cor?: string | null; children: ReactNode; onRemover?: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface-2 px-2 py-0.5 text-xs text-ink-2 max-w-full">
      {cor !== undefined && <Ponto cor={cor} className="size-2" />}
      <span className="truncate">{children}</span>
      {onRemover && (
        <button type="button" onClick={onRemover} className="text-muted hover:text-ink cursor-pointer" aria-label="Remover">
          <X className="size-3" />
        </button>
      )}
    </span>
  );
}

const STATUS: Record<StatusClassificacao, { rotulo: string; classe: string; Icone: typeof CheckCircle2 }> = {
  pendente: { rotulo: "Na fila da IA", classe: "bg-surface-2 text-ink-2", Icone: CircleDashed },
  processando: { rotulo: "IA analisando", classe: "bg-accent-soft text-accent-ink", Icone: Loader2 },
  classificado: { rotulo: "Classificado pela IA", classe: "bg-good-soft text-good", Icone: CheckCircle2 },
  revisar: { rotulo: "A revisar", classe: "bg-warn-soft text-warn", Icone: AlertTriangle },
  erro: { rotulo: "Falha da IA", classe: "bg-bad-soft text-bad", Icone: XCircle },
  manual: { rotulo: "Conferido", classe: "bg-accent-soft text-accent-ink", Icone: Hand },
};

export function StatusBadge({ status, curto }: { status: StatusClassificacao; curto?: boolean }) {
  const s = STATUS[status];
  return (
    <span className={cx("inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", s.classe)}>
      <s.Icone className={cx("size-3.5", status === "processando" && "animate-spin")} />
      {!curto && s.rotulo}
    </span>
  );
}
export const rotuloStatus = (s: StatusClassificacao) => STATUS[s].rotulo;

export function Carregando({ texto = "Carregando…" }: { texto?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted">
      <Loader2 className="size-4 animate-spin" /> {texto}
    </div>
  );
}

export function Vazio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="grid justify-items-center gap-1 py-10 text-center">
      <p className="text-sm font-medium text-ink">{titulo}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
    </div>
  );
}

export function Alerta({ tipo = "erro", children }: { tipo?: "erro" | "aviso" | "ok" | "info"; children: ReactNode }) {
  return (
    <div
      className={cx(
        "rounded-lg px-3 py-2 text-sm",
        tipo === "erro" && "bg-bad-soft text-bad",
        tipo === "aviso" && "bg-warn-soft text-warn",
        tipo === "ok" && "bg-good-soft text-good",
        tipo === "info" && "bg-accent-soft text-accent-ink",
      )}
    >
      {children}
    </div>
  );
}

export function Modal({ titulo, aberto, onFechar, children, largura = "max-w-lg" }: { titulo: string; aberto: boolean; onFechar: () => void; children: ReactNode; largura?: string }) {
  useEffect(() => {
    if (!aberto) return;
    const esc = (e: KeyboardEvent) => e.key === "Escape" && onFechar();
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [aberto, onFechar]);
  if (!aberto) return null;
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onMouseDown={(e) => e.target === e.currentTarget && onFechar()}>
      <div role="dialog" aria-modal="true" aria-label={titulo} className={cx("w-full rounded-xl border border-line bg-surface shadow-xl max-h-[90vh] overflow-y-auto", largura)}>
        <header className="flex items-center justify-between border-b border-line px-5 py-3">
          <h2 className="font-semibold">{titulo}</h2>
          <button onClick={onFechar} className="rounded p-1 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Fechar">
            <X className="size-4" />
          </button>
        </header>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

export function SeletorCor({ valor, onChange, paleta }: { valor: string; onChange: (c: string) => void; paleta: string[] }) {
  return (
    <div className="grid gap-1">
      <span className="text-xs font-medium text-ink-2">Cor</span>
      <div className="flex flex-wrap gap-2">
        {paleta.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => onChange(c)}
            className={cx("size-7 rounded-full border-2 cursor-pointer", valor === c ? "border-ink" : "border-transparent")}
            style={{ background: c }}
            aria-label={`Cor ${c}`}
          />
        ))}
      </div>
    </div>
  );
}

export function Paginacao({ pagina, total, porPagina, onPagina }: { pagina: number; total: number; porPagina: number; onPagina: (p: number) => void }) {
  const paginas = Math.max(1, Math.ceil(total / porPagina));
  return (
    <div className="flex items-center justify-between gap-3 pt-3 text-sm text-muted">
      <span className="tabular">
        {total === 0 ? "Nenhum resultado" : `${(pagina - 1) * porPagina + 1}–${Math.min(pagina * porPagina, total)} de ${total}`}
      </span>
      <div className="flex gap-2">
        <Botao disabled={pagina <= 1} onClick={() => onPagina(pagina - 1)}>
          Anterior
        </Botao>
        <Botao disabled={pagina >= paginas} onClick={() => onPagina(pagina + 1)}>
          Próxima
        </Botao>
      </div>
    </div>
  );
}
