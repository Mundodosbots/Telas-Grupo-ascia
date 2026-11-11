import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound, Upload } from "lucide-react";
import { useState } from "react";
import { api, type Empresa } from "../api";
import { useAuth } from "../auth";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, BotaoCopiar, Cartao, Carregando, Modal, Ponto } from "../components/ui";
import { useEmpresas } from "../hooks";
import { dataHora } from "../lib/formato";

const EXEMPLO = {
  evento_id: "msg-123456",
  conversa_id: "conv-98765",
  cliente_nome: "João Silva",
  cliente_telefone: "+55 11 99999-0000",
  vendedor: "Carlos Souza",
  vendedor_id: "42",
  fonte: "RPA Grow",
  resumo: "Cliente viu o anúncio do Pulse no Instagram, quer dar um Argo 2019 na troca e perguntou sobre parcelas.",
  data_atribuicao: "2026-11-10T14:32:00-03:00",
};

export function PaginaEmpresas() {
  const { usuario } = useAuth();
  const empresas = useEmpresas();
  const [tokenNovo, setTokenNovo] = useState<{ empresa: Empresa; token: string } | null>(null);
  const [confirmar, setConfirmar] = useState<Empresa | null>(null);
  const [importando, setImportando] = useState<{ empresa: Empresa; tipo: "etiquetas" | "vendedores" } | null>(null);
  const qc = useQueryClient();
  const url = `${window.location.origin}/api/webhook/atribuicao`;
  const master = usuario?.papel === "master";

  const gerar = useMutation({
    mutationFn: (e: Empresa) => api<{ empresa: Empresa; token: string }>(`/empresas/${e.id}/token`, { method: "POST" }),
    onSuccess: (r) => {
      setConfirmar(null);
      setTokenNovo(r);
      qc.invalidateQueries({ queryKey: ["empresas"] });
    },
  });

  const curl = `curl -X POST ${url} \\
  -H "Authorization: Bearer SEU_TOKEN" \\
  -H "Content-Type: application/json" \\
  -d '${JSON.stringify(EXEMPLO)}'`;

  return (
    <>
      <Titulo titulo="Empresas e webhook" descricao="Cada empresa tem seu próprio token. É o token que diz ao painel de qual empresa veio o atendimento." />
      <div className="grid gap-4">
        <Cartao titulo="Empresas">
          {!empresas.data ? (
            <Carregando />
          ) : (
            <ul className="-mx-4 divide-y divide-line">
              {empresas.data.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <Ponto cor={e.cor} />
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{e.nome}</p>
                    <p className="text-xs text-muted">
                      {e.tokenPrefixo ? (
                        <>
                          Token <span className="font-mono">{e.tokenPrefixo}…</span> gerado em {dataHora(e.tokenGeradoEm)}
                        </>
                      ) : (
                        <span className="text-warn">Sem token: o webhook desta empresa ainda não funciona</span>
                      )}
                    </p>
                    <p className="text-xs text-muted">
                      {e.etiquetasPlataforma ? (
                        <>{e.etiquetasPlataforma} etiquetas da plataforma importadas</>
                      ) : (
                        <span className="text-warn">Etiquetas da plataforma não importadas: chegam só como números</span>
                      )}
                    </p>
                  </div>
                  <Botao onClick={() => setImportando({ empresa: e, tipo: "etiquetas" })}>
                    <Upload className="size-4" /> Importar etiquetas
                  </Botao>
                  <Botao onClick={() => setImportando({ empresa: e, tipo: "vendedores" })}>
                    <Upload className="size-4" /> Importar vendedores
                  </Botao>
                  {master && (
                    <Botao onClick={() => (e.tokenPrefixo ? setConfirmar(e) : gerar.mutate(e))} carregando={gerar.isPending && gerar.variables?.id === e.id}>
                      <KeyRound className="size-4" /> {e.tokenPrefixo ? "Trocar token" : "Gerar token"}
                    </Botao>
                  )}
                </li>
              ))}
            </ul>
          )}
          {!master && <p className="pt-2 text-xs text-muted">Somente o usuário master gera tokens.</p>}
        </Cartao>

        <Cartao titulo="Como o chatbot envia os dados">
          <div className="grid gap-3 text-sm">
            <p className="text-ink-2">
              Quando o bot atribuir uma conversa, ele faz um <b>POST</b> com JSON para o endereço abaixo, com o token da empresa no cabeçalho.
            </p>
            <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
              <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">{url}</code>
              <BotaoCopiar texto={url} rotulo="Copiar endereço" />
            </div>
            <div className="grid gap-1 text-ink-2">
              <p>
                <b>Obrigatórios:</b> <code className="font-mono text-xs">cliente_telefone</code> e <code className="font-mono text-xs">vendedor</code>.
              </p>
              <p>
                <b>Recomendados:</b> <code className="font-mono text-xs">resumo</code> (a IA lê daqui a origem), <code className="font-mono text-xs">cliente_nome</code>,{" "}
                <code className="font-mono text-xs">conversa_id</code> (liga reatribuições da mesma conversa), <code className="font-mono text-xs">evento_id</code>{" "}
                (evita duplicar se o bot reenviar), <code className="font-mono text-xs">fonte</code>, <code className="font-mono text-xs">data_atribuicao</code>.
              </p>
              <p>Qualquer outro campo é guardado junto, sem erro.</p>
            </div>
            <div className="grid gap-2 rounded-lg border border-line p-3">
              <p className="font-medium">Ainda definindo o formato? Use a URL de captura</p>
              <p className="text-ink-2">
                Ela aceita qualquer formato e só <b>guarda o que chegou</b>, sem criar atendimento. Veja o resultado em <b>Eventos recebidos → Capturas de teste</b>.
                O token pode ir na própria URL:
              </p>
              <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
                <code className="min-w-0 flex-1 truncate font-mono text-xs select-all">{`${window.location.origin}/api/webhook/teste?token=SEU_TOKEN`}</code>
                <BotaoCopiar texto={`${window.location.origin}/api/webhook/teste?token=SEU_TOKEN`} rotulo="Copiar" />
              </div>
            </div>
            <div className="grid gap-1">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-ink-2">Exemplo para testar (troque SEU_TOKEN)</span>
                <BotaoCopiar texto={curl} rotulo="Copiar exemplo" />
              </div>
              <pre className="overflow-x-auto rounded-lg bg-surface-2 p-3 font-mono text-[11px] leading-relaxed">{curl}</pre>
            </div>
          </div>
        </Cartao>
      </div>

      <Modal titulo={`Trocar token da ${confirmar?.nome}`} aberto={!!confirmar} onFechar={() => setConfirmar(null)}>
        <div className="grid gap-4">
          <Alerta tipo="aviso">O token atual para de funcionar na hora. O chatbot precisa ser atualizado com o novo token.</Alerta>
          <div className="flex justify-end gap-2">
            <Botao onClick={() => setConfirmar(null)}>Cancelar</Botao>
            <Botao variante="primario" onClick={() => confirmar && gerar.mutate(confirmar)} carregando={gerar.isPending}>
              Gerar novo token
            </Botao>
          </div>
        </div>
      </Modal>

      <Modal titulo={`Token da ${tokenNovo?.empresa.nome}`} aberto={!!tokenNovo} onFechar={() => setTokenNovo(null)}>
        <div className="grid gap-4">
          <Alerta tipo="aviso">Copie agora e guarde no chatbot. Por segurança ele não será mostrado de novo.</Alerta>
          <div className="flex items-center gap-2 rounded-lg bg-surface-2 px-3 py-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs select-all">{tokenNovo?.token}</code>
            {tokenNovo && <BotaoCopiar texto={tokenNovo.token} rotulo="Copiar token" />}
          </div>
          <div className="flex justify-end">
            <Botao variante="primario" onClick={() => setTokenNovo(null)}>
              Já copiei
            </Botao>
          </div>
        </div>
      </Modal>

      {importando && <ImportarLista empresa={importando.empresa} tipo={importando.tipo} onFechar={() => setImportando(null)} />}
    </>
  );
}

const TEXTOS_IMPORTACAO = {
  etiquetas: {
    titulo: "Etiquetas da plataforma",
    explicacao:
      "A plataforma manda só o número de cada etiqueta. Cole aqui a lista de etiquetas exportada da plataforma (ou escolha o arquivo .json) para o painel saber o nome de cada uma. Pode importar de novo sempre que criar etiquetas novas: as existentes são atualizadas.",
    exemplo: '[\n  { "id": "706325", "name": "Grow" },\n  ...\n]',
    formato: '[{ "id": "...", "name": "..." }, ...]',
  },
  vendedores: {
    titulo: "Vendedores (administradores da plataforma)",
    explicacao:
      "Cole a lista de administradores/atendentes exportada da plataforma (ou escolha o arquivo .json). Cada um vira vendedor desta empresa, com nome, e-mail e ID da plataforma. Quem já existe só é completado. Quem não atende cliente pode ser desativado depois em Vendedores.",
    exemplo: '[\n  { "id": "1000859765", "full_name": "RUDISON MORETTI", "email": "..." },\n  ...\n]',
    formato: '[{ "id": "...", "full_name": "...", "email": "..." }, ...]',
  },
};

/** Importa listas exportadas da plataforma: etiquetas (id → nome) ou administradores (→ vendedores) */
function ImportarLista({ empresa, tipo, onFechar }: { empresa: Empresa; tipo: "etiquetas" | "vendedores"; onFechar: () => void }) {
  const qc = useQueryClient();
  const t = TEXTOS_IMPORTACAO[tipo];
  const [texto, setTexto] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const importar = useMutation({
    mutationFn: async (itens: unknown[]) => {
      if (tipo === "vendedores") {
        const r = await api<{ criados: number; atualizados: number }>("/vendedores/importar", { method: "POST", body: { empresa_id: empresa.id, itens } });
        return `${r.criados} vendedor(es) criado(s) e ${r.atualizados} já existente(s) completado(s).`;
      }
      const r = await api<{ importadas: number; alterados: number }>(`/empresas/${empresa.id}/etiquetas-plataforma`, { method: "POST", body: { itens } });
      return `${r.importadas} etiquetas importadas. ${r.alterados} atendimento(s) tiveram a origem atualizada pelas regras.`;
    },
    onSuccess: (mensagem) => {
      setOk(mensagem);
      for (const k of ["empresas", "dicionario", "vendedores", "atendimentos", "dashboard"]) qc.invalidateQueries({ queryKey: [k] });
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
      return setErro("O conteúdo não é um JSON válido. Cole a lista exatamente como a plataforma exportou.");
    }
    const lista = Array.isArray(dados) ? dados : Array.isArray((dados as any)?.data) ? (dados as any).data : null;
    if (!lista?.length) return setErro(`Não encontrei uma lista. O formato esperado é ${t.formato}`);
    importar.mutate(lista);
  }

  return (
    <Modal titulo={`${t.titulo} · ${empresa.nome}`} aberto onFechar={onFechar} largura="max-w-2xl">
      <div className="grid gap-3">
        <p className="text-sm text-ink-2">{t.explicacao}</p>
        {erro && <Alerta>{erro}</Alerta>}
        {ok && <Alerta tipo="ok">{ok}</Alerta>}
        <input
          id="importar-arquivo"
          type="file"
          accept=".json,application/json"
          className="text-sm text-ink-2 file:mr-3 file:rounded-lg file:border file:border-line file:bg-surface file:px-3 file:py-1.5 file:text-sm file:text-ink"
          onChange={async (e) => {
            const f = e.target.files?.[0];
            if (f) setTexto(await f.text());
          }}
        />
        <textarea
          id="importar-texto"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={t.exemplo}
          className="min-h-48 w-full rounded-lg border border-line bg-surface p-3 font-mono text-xs text-ink focus:border-accent focus:outline-none"
        />
        <div className="flex justify-end gap-2">
          <Botao onClick={onFechar}>{ok ? "Fechar" : "Cancelar"}</Botao>
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
