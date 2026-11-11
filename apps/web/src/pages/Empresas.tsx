import { useMutation, useQueryClient } from "@tanstack/react-query";
import { KeyRound } from "lucide-react";
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
                  </div>
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
    </>
  );
}
