import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Merge, Pencil, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { api, type Atendente, type Time } from "../api";
import { ehAdmin, useAuth } from "../auth";
import { BarraFiltros } from "../components/Filtros";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao, Carregando, Modal, Ponto, Selecao, SeletorCor, Vazio } from "../components/ui";
import { useAtendentes, useFiltros, useTimes } from "../hooks";
import { dataHora, numero, PALETA } from "../lib/formato";
import { TabelaAtendentes, usePainel } from "./Dashboard";

export function PaginaAtendentes() {
  const { usuario } = useAuth();
  const painel = usePainel();
  const { params } = useFiltros();
  const atendentes = useAtendentes();
  const times = useTimes();
  const [editando, setEditando] = useState<Atendente | null>(null);
  const [mesclando, setMesclando] = useState<Atendente | null>(null);
  const [time, setTime] = useState<Time | "novo" | null>(null);
  const pode = ehAdmin(usuario);
  const link = (id: string) => {
    const p = new URLSearchParams(params);
    p.set("atendente", id);
    return `/atendimentos?${p}`;
  };

  return (
    <>
      <Titulo
        titulo="Atendentes"
        descricao="Quem atende mais, quem demora para responder e quem passa atendimentos adiante. Os atendentes entram sozinhos quando aparecem nos envios."
      />
      <BarraFiltros extras={["time", "departamento", "origem"]} />
      <Cartao titulo="Ranking do período" className="mb-5">
        {painel.isLoading || !painel.data ? (
          <Carregando />
        ) : (
          <TabelaAtendentes linhas={painel.data.porAtendente} link={link} transferencias={painel.data.transferencias} />
        )}
        <p className="mt-3 text-xs text-muted">
          Robô → humano: da transferência do robô até a 1ª resposta. Resposta média: tempo entre a mensagem do cliente e a resposta do atendente. Tempos contam só o
          horário de atendimento.
        </p>
      </Cartao>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <Cartao titulo="Cadastro de atendentes">
          {atendentes.isLoading ? (
            <Carregando />
          ) : !atendentes.data?.length ? (
            <Vazio titulo="Nenhum atendente ainda">Eles aparecem quando chegam os primeiros envios.</Vazio>
          ) : (
            <ul className="-mx-4 divide-y divide-line">
              {atendentes.data.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{a.nome}</p>
                    <p className="text-xs text-muted">
                      {a.timeNome ? (
                        <span className="inline-flex items-center gap-1">
                          <Ponto cor={a.timeCor} /> {a.timeNome}
                        </span>
                      ) : (
                        "Sem time"
                      )}
                      {" · "}
                      {numero(a.atendimentos)} atendimento(s){a.ultimoAtendimento && ` · último ${dataHora(a.ultimoAtendimento)}`}
                      {a.apelidos.length > 0 && ` · no histórico: ${a.apelidos.join(", ")}`}
                    </p>
                  </div>
                  {pode && (
                    <div className="flex gap-1">
                      <button onClick={() => setEditando(a)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Editar">
                        <Pencil className="size-4" />
                      </button>
                      <button onClick={() => setMesclando(a)} className="rounded-md p-1.5 text-muted hover:bg-surface-2 hover:text-ink cursor-pointer" aria-label="Mesclar com outro">
                        <Merge className="size-4" />
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>

        <Cartao
          titulo="Times"
          acao={
            pode && (
              <Botao onClick={() => setTime("novo")}>
                <Plus className="size-4" /> Novo time
              </Botao>
            )
          }
        >
          {!times.data?.length ? (
            <p className="text-sm text-muted">Agrupe atendentes em times (ex.: Vendas Sinop, Seminovos, CRM) para comparar no painel.</p>
          ) : (
            <ul className="grid gap-1">
              {times.data.map((t) => (
                <li key={t.id} className="flex items-center gap-2 rounded-md px-1 py-1.5">
                  <Ponto cor={t.cor} />
                  <span className="flex-1">{t.nome}</span>
                  <span className="text-xs text-muted">{t.atendentes} atendente(s)</span>
                  {pode && (
                    <button onClick={() => setTime(t)} className="rounded-md p-1 text-muted hover:bg-surface-2 cursor-pointer" aria-label="Editar time">
                      <Pencil className="size-3.5" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </Cartao>
      </div>

      {editando && <FormAtendente atendente={editando} times={times.data ?? []} onFechar={() => setEditando(null)} />}
      {mesclando && <FormMesclar origem={mesclando} lista={atendentes.data ?? []} onFechar={() => setMesclando(null)} />}
      {time && <FormTime time={time === "novo" ? null : time} onFechar={() => setTime(null)} />}
    </>
  );
}

function FormAtendente({ atendente, times, onFechar }: { atendente: Atendente; times: Time[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(atendente.nome);
  const [timeId, setTimeId] = useState(atendente.timeId ?? "");
  const [ativo, setAtivo] = useState(atendente.ativo);
  const salvar = useMutation({
    mutationFn: () => api(`/atendentes/${atendente.id}`, { method: "PATCH", body: { nome, time_id: timeId || null, ativo } }),
    onSuccess: () => {
      qc.invalidateQueries();
      onFechar();
    },
  });
  return (
    <Modal titulo="Editar atendente" aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} />
        <Selecao rotulo="Time" value={timeId} onChange={(e) => setTimeId(e.target.value)}>
          <option value="">Sem time</option>
          {times.map((t) => (
            <option key={t.id} value={t.id}>
              {t.nome}
            </option>
          ))}
        </Selecao>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={ativo} onChange={(e) => setAtivo(e.target.checked)} /> Ativo
        </label>
        <div className="flex justify-end gap-2">
          <Botao type="button" variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" carregando={salvar.isPending}>
            Salvar
          </Botao>
        </div>
      </form>
    </Modal>
  );
}

function FormMesclar({ origem, lista, onFechar }: { origem: Atendente; lista: Atendente[]; onFechar: () => void }) {
  const qc = useQueryClient();
  const [destino, setDestino] = useState("");
  const mesclar = useMutation({
    mutationFn: () => api(`/atendentes/${origem.id}/mesclar`, { method: "POST", body: { destino_id: destino } }),
    onSuccess: () => {
      qc.invalidateQueries();
      onFechar();
    },
  });
  return (
    <Modal titulo={`Mesclar "${origem.nome}"`} aberto onFechar={onFechar}>
      <div className="grid gap-3">
        <p className="text-sm text-muted">
          Use quando a mesma pessoa aparece com dois nomes (ex.: "OSVALDO" no histórico e "OSVALDO JUNIOR" no cadastro). Os atendimentos passam para o escolhido e
          o nome antigo vira apelido.
        </p>
        {mesclar.error && <Alerta>{(mesclar.error as Error).message}</Alerta>}
        <Selecao rotulo="Juntar em" value={destino} onChange={(e) => setDestino(e.target.value)}>
          <option value="">Escolha…</option>
          {lista
            .filter((a) => a.id !== origem.id)
            .map((a) => (
              <option key={a.id} value={a.id}>
                {a.nome}
              </option>
            ))}
        </Selecao>
        <div className="flex justify-end gap-2">
          <Botao variante="fantasma" onClick={onFechar}>
            Cancelar
          </Botao>
          <Botao variante="primario" disabled={!destino} carregando={mesclar.isPending} onClick={() => mesclar.mutate()}>
            <Merge className="size-4" /> Mesclar
          </Botao>
        </div>
      </div>
    </Modal>
  );
}

function FormTime({ time, onFechar }: { time: Time | null; onFechar: () => void }) {
  const qc = useQueryClient();
  const [nome, setNome] = useState(time?.nome ?? "");
  const [cor, setCor] = useState(time?.cor ?? PALETA[6]!);
  const salvar = useMutation({
    mutationFn: () => (time ? api(`/times/${time.id}`, { method: "PATCH", body: { nome, cor } }) : api("/times", { method: "POST", body: { nome, cor } })),
    onSuccess: () => {
      qc.invalidateQueries();
      onFechar();
    },
  });
  const excluir = useMutation({
    mutationFn: () => api(`/times/${time!.id}`, { method: "DELETE" }),
    onSuccess: () => {
      qc.invalidateQueries();
      onFechar();
    },
  });
  return (
    <Modal titulo={time ? "Editar time" : "Novo time"} aberto onFechar={onFechar}>
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          salvar.mutate();
        }}
      >
        {salvar.error && <Alerta>{(salvar.error as Error).message}</Alerta>}
        <Campo rotulo="Nome" required value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Vendas Sinop" />
        <SeletorCor valor={cor} onChange={setCor} paleta={PALETA} />
        <div className="flex justify-between gap-2">
          {time ? (
            <Botao type="button" variante="perigo" carregando={excluir.isPending} onClick={() => excluir.mutate()}>
              <Trash2 className="size-4" /> Excluir
            </Botao>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Botao type="button" variante="fantasma" onClick={onFechar}>
              Cancelar
            </Botao>
            <Botao variante="primario" carregando={salvar.isPending}>
              Salvar
            </Botao>
          </div>
        </div>
      </form>
    </Modal>
  );
}
