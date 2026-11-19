import {
  BarChart3,
  Bot,
  Building2,
  FileText,
  GitBranch,
  KeyRound,
  Layers,
  ListChecks,
  LogOut,
  Menu,
  Radio,
  Tags,
  Users,
  UserSquare2,
  Waypoints,
} from "lucide-react";
import { useState, type ReactNode } from "react";
import { NavLink, Outlet } from "react-router";
import { ehAdmin, useAuth } from "../auth";
import { useAtualizacaoAutomatica, useStatus } from "../hooks";
import { Assistente } from "./Assistente";
import { cx } from "./ui";

type Item = { para: string; rotulo: string; Icone: typeof BarChart3; admin?: boolean };

const SECOES: { titulo?: string; itens: Item[] }[] = [
  {
    itens: [
      { para: "/", rotulo: "Painel", Icone: BarChart3 },
      { para: "/atendentes", rotulo: "Atendentes", Icone: UserSquare2 },
      { para: "/atendimentos", rotulo: "Atendimentos", Icone: ListChecks },
      { para: "/relatorios", rotulo: "Relatórios", Icone: FileText },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { para: "/chatbots", rotulo: "Chatbots", Icone: Bot },
      { para: "/departamentos", rotulo: "Departamentos", Icone: Layers },
      { para: "/origens", rotulo: "Origens", Icone: Waypoints },
      { para: "/regras", rotulo: "Regras de origem", Icone: GitBranch },
      { para: "/etiquetas", rotulo: "Etiquetas", Icone: Tags },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { para: "/eventos", rotulo: "Envios recebidos", Icone: Radio },
      { para: "/usuarios", rotulo: "Usuários", Icone: Users, admin: true },
      { para: "/conta", rotulo: "Minha senha", Icone: KeyRound },
    ],
  },
];

export function Layout() {
  const { usuario, empresa, empresas, trocarEmpresa, sair } = useAuth();
  const status = useStatus();
  useAtualizacaoAutomatica();
  const [menuAberto, setMenuAberto] = useState(false);
  const superadmin = usuario?.papel === "superadmin";
  const fechar = () => setMenuAberto(false);

  const nav = (
    <nav className="grid gap-5">
      {superadmin && (
        <div className="grid gap-1.5 px-1">
          <label htmlFor="empresa-ativa" className="px-2 text-[11px] font-semibold uppercase tracking-wider text-muted">
            Empresa
          </label>
          <select
            id="empresa-ativa"
            value={empresa?.id ?? ""}
            onChange={(e) => trocarEmpresa(e.target.value || null)}
            className="h-9 rounded-lg border border-line bg-surface px-2 text-sm text-ink"
          >
            <option value="">Escolha…</option>
            {empresas.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nome}
                {!e.ativo ? " (desativada)" : ""}
              </option>
            ))}
          </select>
          <ItemNav it={{ para: "/empresas", rotulo: "Empresas", Icone: Building2 }} fechar={fechar} />
        </div>
      )}
      {empresa &&
        SECOES.map((s, i) => (
          <div key={i} className="grid gap-0.5">
            {s.titulo && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{s.titulo}</p>}
            {s.itens
              .filter((it) => !it.admin || ehAdmin(usuario))
              .map((it) => (
                <ItemNav key={it.para} it={it} fechar={fechar} />
              ))}
          </div>
        ))}
    </nav>
  );

  const rodape = (
    <div className="grid gap-2 border-t border-line pt-3">
      <div className="px-3 text-xs">
        <p className="font-medium text-ink truncate">{usuario?.nome}</p>
        <p className="text-muted truncate">
          {superadmin ? "Superadmin" : usuario?.papel === "admin" ? "Administrador" : "Gerente"} · {usuario?.email}
        </p>
      </div>
      <button onClick={() => sair()} className="flex items-center gap-2.5 rounded-lg px-3 h-9 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer">
        <LogOut className="size-4" /> Sair
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full">
      <aside className="hidden lg:flex print:hidden w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-4 sticky top-0 h-screen">
        <Marca empresa={empresa?.nome} />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {rodape}
      </aside>

      {menuAberto && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={fechar}>
          <aside className="flex h-full w-72 flex-col gap-6 bg-surface px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <Marca empresa={empresa?.nome} />
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {rodape}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="lg:hidden print:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 h-14">
          <button onClick={() => setMenuAberto(true)} className="rounded-lg p-1.5 hover:bg-surface-2 cursor-pointer" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <Marca empresa={empresa?.nome} />
        </header>
        {status.data && !status.data.agenteAtivo && (
          <div className="print:hidden border-b border-line bg-warn-soft px-4 lg:px-8 py-2 text-sm text-warn">
            A IA está desligada (falta a chave da OpenAI). Os envios entram e os tempos são calculados, mas sem origem, departamento e resumo pela IA.
          </div>
        )}
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7 print:p-0">
          <Outlet />
        </main>
      </div>
      {empresa && <Assistente />}
    </div>
  );
}

function ItemNav({ it, fechar }: { it: Item; fechar: () => void }) {
  return (
    <NavLink
      to={it.para}
      end={it.para === "/"}
      onClick={fechar}
      className={({ isActive }) =>
        cx(
          "flex items-center gap-2.5 rounded-lg px-3 h-9 text-sm transition-colors",
          isActive ? "bg-accent-soft text-accent-ink font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
        )
      }
    >
      <it.Icone className="size-4 shrink-0" />
      <span className="flex-1 truncate">{it.rotulo}</span>
    </NavLink>
  );
}

function Marca({ empresa }: { empresa?: string }) {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
        <BarChart3 className="size-4.5" />
      </span>
      <div className="leading-tight min-w-0">
        <p className="text-sm font-semibold">Atendly</p>
        <p className="text-[11px] text-muted truncate">{empresa ?? "Mundo dos Bots"}</p>
      </div>
    </div>
  );
}

export function Titulo({ titulo, descricao, acoes }: { titulo: string; descricao?: string; acoes?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-xl font-semibold tracking-tight text-balance">{titulo}</h1>
        {descricao && <p className="mt-0.5 max-w-2xl text-sm text-muted">{descricao}</p>}
      </div>
      {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
    </div>
  );
}
