import {
  BarChart3,
  Building2,
  ClipboardCheck,
  KeyRound,
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
import { useAuth } from "../auth";
import { useStatus } from "../hooks";
import { cx } from "./ui";

type Item = { para: string; rotulo: string; Icone: typeof BarChart3; master?: boolean; contador?: "revisar" };

const SECOES: { titulo?: string; itens: Item[] }[] = [
  {
    itens: [
      { para: "/", rotulo: "Painel", Icone: BarChart3 },
      { para: "/atendimentos", rotulo: "Atendimentos", Icone: ListChecks },
      { para: "/revisar", rotulo: "A revisar", Icone: ClipboardCheck, contador: "revisar" },
    ],
  },
  {
    titulo: "Cadastros",
    itens: [
      { para: "/vendedores", rotulo: "Vendedores", Icone: UserSquare2 },
      { para: "/origens", rotulo: "Origens", Icone: Waypoints },
      { para: "/etiquetas", rotulo: "Etiquetas", Icone: Tags },
    ],
  },
  {
    titulo: "Sistema",
    itens: [
      { para: "/empresas", rotulo: "Empresas e webhook", Icone: Building2 },
      { para: "/eventos", rotulo: "Eventos recebidos", Icone: Radio },
      { para: "/usuarios", rotulo: "Usuários", Icone: Users, master: true },
      { para: "/conta", rotulo: "Minha senha", Icone: KeyRound },
    ],
  },
];

export function Layout() {
  const { usuario, sair } = useAuth();
  const status = useStatus();
  const [menuAberto, setMenuAberto] = useState(false);

  const nav = (
    <nav className="grid gap-5">
      {SECOES.map((s, i) => (
        <div key={i} className="grid gap-0.5">
          {s.titulo && <p className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-muted">{s.titulo}</p>}
          {s.itens
            .filter((it) => !it.master || usuario?.papel === "master")
            .map((it) => (
              <NavLink
                key={it.para}
                to={it.para}
                end={it.para === "/"}
                onClick={() => setMenuAberto(false)}
                className={({ isActive }) =>
                  cx(
                    "flex items-center gap-2.5 rounded-lg px-3 h-9 text-sm transition-colors",
                    isActive ? "bg-accent-soft text-accent-ink font-medium" : "text-ink-2 hover:bg-surface-2 hover:text-ink",
                  )
                }
              >
                <it.Icone className="size-4 shrink-0" />
                <span className="flex-1 truncate">{it.rotulo}</span>
                {it.contador === "revisar" && !!status.data?.aRevisar && (
                  <span className="rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn tabular">{status.data.aRevisar}</span>
                )}
              </NavLink>
            ))}
        </div>
      ))}
    </nav>
  );

  const rodape = (
    <div className="grid gap-2 border-t border-line pt-3">
      <div className="px-3 text-xs">
        <p className="font-medium text-ink truncate">{usuario?.nome}</p>
        <p className="text-muted truncate">{usuario?.papel === "master" ? "Master" : "Gerente"} · {usuario?.email}</p>
      </div>
      <button onClick={() => sair()} className="flex items-center gap-2.5 rounded-lg px-3 h-9 text-sm text-ink-2 hover:bg-surface-2 hover:text-ink cursor-pointer">
        <LogOut className="size-4" /> Sair
      </button>
    </div>
  );

  return (
    <div className="flex min-h-full">
      {/* Lateral fixa no desktop */}
      <aside className="hidden lg:flex w-60 shrink-0 flex-col gap-6 border-r border-line bg-surface px-3 py-4 sticky top-0 h-screen">
        <Marca />
        <div className="flex-1 overflow-y-auto">{nav}</div>
        {rodape}
      </aside>

      {/* Gaveta no celular */}
      {menuAberto && (
        <div className="lg:hidden fixed inset-0 z-40 bg-black/40" onClick={() => setMenuAberto(false)}>
          <aside className="flex h-full w-72 flex-col gap-6 bg-surface px-3 py-4" onClick={(e) => e.stopPropagation()}>
            <Marca />
            <div className="flex-1 overflow-y-auto">{nav}</div>
            {rodape}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="lg:hidden sticky top-0 z-30 flex items-center gap-3 border-b border-line bg-surface px-4 h-14">
          <button onClick={() => setMenuAberto(true)} className="rounded-lg p-1.5 hover:bg-surface-2 cursor-pointer" aria-label="Abrir menu">
            <Menu className="size-5" />
          </button>
          <Marca />
        </header>
        {status.data && !status.data.agenteAtivo && (
          <div className="border-b border-line bg-warn-soft px-4 lg:px-8 py-2 text-sm text-warn">
            A classificação automática por IA está desligada (falta a chave da OpenAI). Os atendimentos entram normalmente e podem ser classificados à mão.
          </div>
        )}
        <main className="flex-1 px-4 py-5 lg:px-8 lg:py-7">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

function Marca() {
  return (
    <div className="flex items-center gap-2.5 px-2">
      <span className="grid size-8 place-items-center rounded-lg bg-accent text-white">
        <BarChart3 className="size-4.5" />
      </span>
      <div className="leading-tight">
        <p className="text-sm font-semibold">Painel de Atribuições</p>
        <p className="text-[11px] text-muted">Grupo Asia</p>
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
