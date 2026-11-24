import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Search, Star, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { api, type EtiquetaPlataforma } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Cartao, Carregando, cx, Modal, Ponto, Selecao, Vazio } from "../components/ui";
import { useChatbots, useEtiquetasPlataforma } from "../hooks";
import { numero } from "../lib/formato";

/**
 * A plataforma manda só o número de cada etiqueta do contato (ex.: 583303).
 * Aqui a empresa dá nome aos números e escolhe quais aparecem em destaque na lista de atendimentos.
 */
export function PaginaEtiquetasPlataforma() {
  const q = useEtiquetasPlataforma();
  const { usuario } = useAuth();
  const pode = ehAdmin(usuario);
  const [importando, setImportando] = useState(false);
  const [busca, setBusca] = useState("");
  const termo = busca.trim().toLowerCase();
  const itens = (q.data ?? []).filter((e) => !termo || e.nome.toLowerCase().includes(termo) || e.idExterno.includes(termo));
  const porChatbot = [...new Set(itens.map((e) => e.chatbotId))].map((id) => itens.filter((e) => e.chatbotId === id));

  return (
    <>
      <Titulo
        titulo="Etiquetas da plataforma"
        descricao="As etiquetas que o contato tem na plataforma (Grow, cidade, atendente…). O envio traz só o número de cada uma: importe a lista de etiquetas da plataforma para o painel saber o nome de cada número, e marque em destaque as que quer ver na lista de atendimentos."
        acoes={
          pode && (
            <Botao variante="primario" onClick={() => setImportando(true)}>
              <Upload className="size-4" /> Importar etiquetas
            </Botao>
          )
        }
      />
      {(q.data ?? []).length > 0 && (
        <label className="relative block max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted" />
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar etiqueta pelo nome ou número"
            className="w-full rounded-lg border border-line bg-surface py-2 pr-3 pl-9 text-sm text-ink outline-none focus:border-accent"
          />
        </label>
      )}
      <div className="mt-4 grid gap-4">
        {q.isLoading ? (
          <Cartao>
            <Carregando />
          </Cartao>
        ) : !itens.length ? (
          <Cartao>
            <Vazio titulo={termo ? "Nenhuma etiqueta com esse nome" : "Nenhuma etiqueta ainda"}>
              {!termo && "Clique em Importar etiquetas e escolha o arquivo .json com a lista de etiquetas exportada da plataforma."}
            </Vazio>
          </Cartao>
        ) : (
          porChatbot.map((lista) => (
            <Cartao
              key={lista[0]!.chatbotId}
              titulo={
                <span className="inline-flex items-center gap-2">
                  <Ponto cor={lista[0]!.chatbotCor} /> {lista[0]!.chatbotNome}
                </span>
              }
              acao={lista.some((e) => !e.nome.trim()) ? <span className="text-xs text-warn">{lista.filter((e) => !e.nome.trim()).length} sem nome</span> : undefined}
            >
              <div className="-mx-4 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead>
                    <tr className="border-b border-line text-left text-xs text-muted">
                      <th className="px-4 py-2 font-medium">Número</th>
                      <th className="px-3 py-2 font-medium">Nome</th>
                      <th className="px-3 py-2 font-medium" title="Aparece como selo ao lado do nome do cliente na lista de atendimentos">
                        Destaque
                      </th>
                      <th className="px-3 py-2 text-right font-medium">Contatos</th>
                      <th className="px-3 py-2 font-medium">Exemplos</th>
                      <th className="w-8" />
                    </tr>
                  </thead>
                  <tbody>
                    {lista.map((e) => (
                      <Linha key={`${e.id}:${e.nome}`} e={e} pode={pode} />
                    ))}
                  </tbody>
                </table>
              </div>
            </Cartao>
          ))
        )}
      </div>
      {importando && <ImportarEtiquetas onFechar={() => setImportando(false)} />}
    </>
  );
}

/** Lista exportada da plataforma: [{ "id": "706325", "name": "Grow" }, …], por arquivo ou colada */
function ImportarEtiquetas({ onFechar }: { onFechar: () => void }) {
  const qc = useQueryClient();
  const chatbots = useChatbots();
  const [chatbotId, setChatbotId] = useState("");
  const [texto, setTexto] = useState("");
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);
  const importar = useMutation({
    mutationFn: (itens: unknown[]) =>
      api<{ importadas: number; chatbots: number; novas: number; atualizadas: number }>("/etiquetas-plataforma/importar", {
        method: "POST",
        body: { ...(chatbotId && { chatbotId }), itens },
      }),
    onSuccess: (r) => {
      setOk(
        `${r.importadas} etiquetas importadas${r.chatbots > 1 ? ` em ${r.chatbots} chatbots` : ""}: ${r.novas} novas e ${r.atualizadas} já existentes com o nome atualizado. ` +
          `Para os atendimentos antigos usarem os nomes nas regras de origem, reprocesse os envios em Empresas.`,
      );
      for (const k of ["etiquetas-plataforma", "atendimentos"]) qc.invalidateQueries({ queryKey: [k] });
    },
    onError: (e) => setErro((e as Error).message),
  });

  function enviar() {
    setErro(null);
    setOk(null);
    let dados: unknown;
    try {
      dados = JSON.parse(texto);
    } catch {
      return setErro("O conteúdo não é um JSON válido. Use o arquivo exatamente como a plataforma exportou.");
    }
    const lista = Array.isArray(dados) ? dados : Array.isArray((dados as { data?: unknown })?.data) ? (dados as { data: unknown[] }).data : null;
    if (!lista?.length) return setErro('Não encontrei uma lista. O formato esperado é [{ "id": "706325", "name": "Grow" }, …]');
    importar.mutate(lista);
  }

  return (
    <Modal titulo="Importar etiquetas da plataforma" aberto onFechar={onFechar} largura="max-w-2xl">
      <div className="grid gap-3">
        <p className="text-sm text-ink-2">
          Escolha o arquivo .json com a lista de etiquetas exportada da plataforma (ou cole o conteúdo). Pode importar de novo sempre que criar etiquetas
          novas: as existentes só têm o nome atualizado, e o destaque que você escolheu continua. A etiqueta “Grow” já entra em destaque.
        </p>
        {erro && <Alerta>{erro}</Alerta>}
        {ok && <Alerta tipo="ok">{ok}</Alerta>}
        {(chatbots.data?.length ?? 0) > 1 && (
          <Selecao rotulo="Vale para" value={chatbotId} onChange={(e) => setChatbotId(e.target.value)}>
            <option value="">Todos os chatbots</option>
            {chatbots.data!.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nome}
              </option>
            ))}
          </Selecao>
        )}
        <input
          type="file"
          accept=".json,application/json"
          aria-label="Arquivo de etiquetas"
          className="text-sm text-ink-2 file:mr-3 file:cursor-pointer file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (!f) return;
            setTexto(await f.text());
            setArquivo(f.name);
            setOk(null);
            setErro(null);
          }}
        />
        <textarea
          value={texto}
          onChange={(e) => {
            setTexto(e.target.value);
            setArquivo(null);
          }}
          placeholder={'[\n  { "id": "706325", "name": "Grow" },\n  { "id": "717893", "name": "Sinop" }\n]'}
          aria-label="Conteúdo do arquivo"
          className="min-h-40 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
        />
        {arquivo && <p className="text-xs text-muted">Arquivo: {arquivo}</p>}
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar}>
            {ok ? "Fechar" : "Cancelar"}
          </Botao>
          {!ok && (
            <Botao variante="primario" onClick={enviar} carregando={importar.isPending} disabled={!texto.trim()}>
              Importar
            </Botao>
          )}
        </div>
      </div>
    </Modal>
  );
}

function Linha({ e, pode }: { e: EtiquetaPlataforma; pode: boolean }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(e.nome);
  const salvar = useMutation({
    mutationFn: (dados: Partial<Pick<EtiquetaPlataforma, "nome" | "cor" | "destaque">>) => api(`/etiquetas-plataforma/${e.id}`, { method: "PATCH", body: dados }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["etiquetas-plataforma"] });
      qc.invalidateQueries({ queryKey: ["atendimentos"] });
    },
  });
  const salvarNome = () => nome.trim() !== e.nome && salvar.mutate({ nome: nome.trim() });

  return (
    <tr className="border-b border-line/60 last:border-0">
      <td className="px-4 py-2 tabular text-muted">#{e.idExterno}</td>
      <td className="px-3 py-2">
        {pode ? (
          <input
            value={nome}
            onChange={(ev) => setNome(ev.target.value)}
            onBlur={salvarNome}
            onKeyDown={(ev) => ev.key === "Enter" && (ev.target as HTMLInputElement).blur()}
            placeholder="Dar nome (ex.: Grow)"
            maxLength={80}
            className={cx(
              "w-48 rounded-md border bg-surface px-2 py-1 text-sm text-ink outline-none focus:border-accent",
              e.nome.trim() ? "border-line" : "border-warn/50",
            )}
            aria-label={`Nome da etiqueta ${e.idExterno}`}
          />
        ) : (
          e.nome || <span className="text-muted">sem nome</span>
        )}
        {salvar.error && <p className="mt-1 text-xs text-bad">{(salvar.error as Error).message}</p>}
      </td>
      <td className="px-3 py-2">
        <span className="inline-flex items-center gap-2">
          <button
            type="button"
            disabled={!pode || salvar.isPending}
            onClick={() => salvar.mutate({ destaque: !e.destaque })}
            className={cx(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs cursor-pointer disabled:cursor-default",
              e.destaque ? "border-accent bg-accent-soft text-accent-ink" : "border-line text-muted hover:text-ink",
            )}
            aria-pressed={e.destaque}
          >
            <Star className={cx("size-3", e.destaque && "fill-current")} /> {e.destaque ? "Em destaque" : "Destacar"}
          </button>
          {e.destaque && pode && (
            <CorDoSelo nome={e.nome || `#${e.idExterno}`} cor={e.cor} onSalvar={(cor) => salvar.mutateAsync({ cor })} />
          )}
        </span>
      </td>
      <td className="px-3 py-2 text-right tabular">
        {numero(e.contatos)}
        <span className="block text-[11px] text-muted">{numero(e.atendimentos)} atend.</span>
      </td>
      <td className="px-3 py-2 text-xs text-ink-2">{e.exemplos.join(", ") || <span className="text-muted">—</span>}</td>
      <td className="pr-3">
        {e.atendimentos > 0 && (
          <Link to={`/atendimentos?plataforma=${e.id}&periodo=tudo`} className="text-muted hover:text-ink" title="Ver os atendimentos com esta etiqueta">
            <ChevronRight className="size-4" />
          </Link>
        )}
      </td>
    </tr>
  );
}

/** Cor do selo: seletor RGB do navegador; a cor só vale depois de clicar em Salvar */
function CorDoSelo({ nome, cor, onSalvar }: { nome: string; cor: string; onSalvar: (c: string) => Promise<unknown> }) {
  const [aberto, setAberto] = useState(false);
  const [atual, setAtual] = useState(cor);
  const [estado, setEstado] = useState<"ocioso" | "salvando" | "salvo" | "erro">("ocioso");
  const caixa = useRef<HTMLSpanElement>(null);
  useEffect(() => setAtual(cor), [cor]);
  useEffect(() => {
    if (!aberto) return;
    const fora = (ev: MouseEvent) => !caixa.current?.contains(ev.target as Node) && fechar();
    const esc = (ev: KeyboardEvent) => ev.key === "Escape" && fechar();
    document.addEventListener("mousedown", fora);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", fora);
      document.removeEventListener("keydown", esc);
    };
  });
  function fechar() {
    setAberto(false);
    setAtual(cor);
    setEstado("ocioso");
  }
  async function salvar() {
    setEstado("salvando");
    try {
      await onSalvar(atual.toLowerCase());
      setEstado("salvo");
      setTimeout(() => setAberto(false), 700);
    } catch {
      setEstado("erro");
    }
  }
  const mudou = atual.toLowerCase() !== cor.toLowerCase();
  return (
    <span ref={caixa} className="relative inline-flex">
      <button
        type="button"
        onClick={() => (aberto ? fechar() : setAberto(true))}
        className="size-6 cursor-pointer rounded-md border border-line"
        style={{ backgroundColor: cor }}
        aria-label="Cor do selo"
        aria-expanded={aberto}
        title="Cor do selo na lista de atendimentos"
      />
      {aberto && (
        <span className="absolute top-8 right-0 z-20 grid w-60 gap-3 rounded-lg border border-line bg-surface p-3 shadow-lg">
          <span className="text-xs text-muted">Cor do selo</span>
          <span className="flex items-center gap-2">
            <input
              type="color"
              value={atual}
              onChange={(ev) => {
                setAtual(ev.target.value);
                setEstado("ocioso");
              }}
              className="h-9 w-14 cursor-pointer rounded border border-line bg-transparent p-0.5"
              aria-label="Escolher cor"
            />
            <span className="font-mono text-xs text-ink-2 uppercase">{atual}</span>
          </span>
          <span className="flex items-center gap-2 text-xs text-muted">
            Na lista:
            <span className="rounded-full px-1.5 text-[10px] font-semibold uppercase text-white" style={{ backgroundColor: atual }}>
              {nome}
            </span>
          </span>
          {estado === "erro" && <span className="text-xs text-bad">Não foi possível salvar. Tente de novo.</span>}
          <span className="flex justify-end gap-2">
            <Botao type="button" variante="fantasma" onClick={fechar}>
              Cancelar
            </Botao>
            <Botao type="button" variante="primario" onClick={salvar} carregando={estado === "salvando"} disabled={!mudou && estado !== "salvo"}>
              {estado === "salvo" ? "Salvo" : "Salvar"}
            </Botao>
          </span>
        </span>
      )}
    </span>
  );
}
