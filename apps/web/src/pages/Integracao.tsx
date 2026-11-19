import { CheckCircle2, CircleAlert, CircleDashed } from "lucide-react";
import { useState, type ReactNode } from "react";
import { Link } from "react-router";
import { Titulo } from "../components/Layout";
import { Alerta, BotaoCopiar, Cartao, cx, Ponto } from "../components/ui";
import { useChatbots } from "../hooks";

type CampoPlataforma = { nome: string; valor: string; para: string };

const ESSENCIAIS: CampoPlataforma[] = [
  { nome: "Historico Conversa", valor: "{{chat_history_details_large}}", para: "Últimas 200 mensagens com remetente e horário. É a base de todos os tempos." },
  { nome: "Historico 50", valor: "{{chat_history_details}}", para: "Últimas 50 mensagens. Garante o atendimento atual quando o de 200 é cortado." },
  { nome: "Atendente", valor: "{{assigned_admin_name}}", para: "Atendente atribuído à conversa." },
  { nome: "Atendente ID", valor: "{{assigned_admin_id}}", para: "Identifica o atendente mesmo se o nome mudar." },
  { nome: "Etiquetas Nomes", valor: "{{user_tags}}", para: "Nomes das etiquetas do contato (ex.: Grow). Usado nas regras de origem." },
  { nome: "Fonte do contato", valor: "{{user_source}}", para: "Como o contato chegou: anúncio, comentário, mensagem recebida, API…" },
  { nome: "Canal da Conversa", valor: "{{user_channel}}", para: "WhatsApp, Instagram, Messenger, Webchat." },
];

const ANUNCIO: CampoPlataforma[] = [
  { nome: "ADS Titulo", valor: "{{last_ad_headline}}", para: "Título do anúncio clicado." },
  { nome: "ADS Texto", valor: "{{last_ad_body}}", para: "Texto do anúncio." },
  { nome: "ADS CTWA", valor: "{{last_ctwa}}", para: "Clique para WhatsApp que abriu a conversa." },
  { nome: "ADS Link", valor: "{{last_ad_source_url}}", para: "Link do anúncio." },
  { nome: "ADS Plataforma", valor: "{{last_ad_source_platform}}", para: "Facebook ou Instagram: separa o tráfego pago por rede." },
  { nome: "ADS Campanha", valor: "{{last_campaign_name}}", para: "Nome da campanha." },
  { nome: "ADS Nome", valor: "{{last_ad_name}}", para: "Nome do anúncio." },
  { nome: "Formulario Lead", valor: "{{last_form_name}}", para: "Formulário do Lead Ads." },
];

const UTEIS: CampoPlataforma[] = [
  { nome: "Link Conversa", valor: "{{inbox_link}}", para: "Botão “Abrir na plataforma” no atendimento." },
  { nome: "Data Criacao Contato", valor: "{{subscribed_date}}", para: "Separa lead novo de cliente que voltou." },
  { nome: "Ref Entrada", valor: "{{last_ref}}", para: "Link, QR code ou botão do site que iniciou a conversa." },
  { nome: "Cidade Contato", valor: "{{user_city}}", para: "Cidade, quando a plataforma souber (a IA também tenta achar na conversa)." },
  { nome: "Momento Envio", valor: "{{current_timestamp}}", para: "Hora exata do disparo." },
];

const EXEMPLO = `{
  "id": 123456789,
  "full_name": "Maria Souza",
  "phone": "+5565999999999",
  "tags": [{ "id": 101 }],
  "custom_fields": [
    { "name": "Historico Conversa", "value": "Usuário (2026-11-19 9:02am): Oi, vi o anúncio...\\nBot (2026-11-19 9:02am): Já vou te transferir...\\nRudison (2026-11-19 9:10am): Bom dia, Maria!" },
    { "name": "Atendente", "value": "Rudison Lima" },
    { "name": "Etiquetas Nomes", "value": "Fiat, Grow" },
    { "name": "Fonte do contato", "value": "Ads" }
  ]
}`;

const PROBLEMAS: { sintoma: string; solucao: ReactNode }[] = [
  {
    sintoma: "Resposta 401 “Token inválido”",
    solucao: (
      <>
        O cabeçalho <code>Authorization</code> está errado ou o token foi trocado. O valor tem que ser <code>Bearer whk_…</code>, com a palavra Bearer, um espaço e o token inteiro. Se perdeu o token, gere outro em{" "}
        <b>Chatbots</b>.
      </>
    ),
  },
  { sintoma: "Resposta 401 “Envie o token no cabeçalho”", solucao: <>Faltou o cabeçalho <code>Authorization</code> no External Request (aba Cabeçalhos).</> },
  { sintoma: "Resposta 400 “JSON inválido”", solucao: <>O corpo não é um JSON válido. Envie os dados completos do contato, sem montar o JSON à mão.</> },
  { sintoma: "Resposta 422 “Faltou o id do contato”", solucao: <>O corpo não é o contato da plataforma. Mande o contato completo, com <code>id</code> e <code>custom_fields</code>.</> },
  { sintoma: "Chegou, mas sem tempos nem conversa", solucao: <>Os campos <b>Historico Conversa</b> e <b>Historico 50</b> estão vazios. Confira se o fluxo preenche os dois antes do External Request.</> },
  { sintoma: "Sem atendente ou sem origem", solucao: <>Faltam os campos <b>Atendente</b>, <b>Fonte do contato</b> ou <b>Etiquetas Nomes</b>. Sem eles a IA decide pela conversa e pode errar mais.</> },
  { sintoma: "Nada aparece em Envios recebidos", solucao: <>O fluxo não chegou no External Request. Confira se ele está publicado e se roda no fim do atendimento.</> },
];

export function PaginaIntegracao() {
  const chatbots = useChatbots();
  const origem = window.location.origin;
  return (
    <>
      <Titulo titulo="Como configurar" descricao="Passo a passo para ligar um chatbot da plataforma ao painel. Leva uns 10 minutos por chatbot." />

      <div className="grid max-w-4xl gap-5">
        <Passo n={1} titulo="Gere o token do chatbot">
          <p>
            Em <Link to="/chatbots" className="font-medium text-accent hover:underline">Chatbots</Link>, cadastre um chatbot para cada conta da plataforma (ex.: Asia Fiat, Asia Leap) e
            clique em <b>Gerar token</b>. Copie na hora: por segurança, o token só aparece uma vez.
          </p>
          <p>
            O endereço é o mesmo para todos os chatbots. O que diferencia um do outro é o token, que vai no <b>cabeçalho</b> da requisição, nunca na URL.
          </p>
          <Codigo texto={`${origem}/api/webhook`} />
          {!!chatbots.data?.length && (
            <ul className="grid gap-1.5 rounded-lg border border-line p-3">
              {chatbots.data.map((c) => {
                const estado = !c.tokenPrefixo ? "sem-link" : c.ultimoEvento ? "ok" : "aguardando";
                return (
                  <li key={c.id} className="flex items-center gap-2 text-sm">
                    <Ponto cor={c.cor} />
                    <span className="flex-1 font-medium">{c.nome}</span>
                    {estado === "ok" ? (
                      <span className="flex items-center gap-1 text-good"><CheckCircle2 className="size-4" /> recebendo envios</span>
                    ) : estado === "aguardando" ? (
                      <span className="flex items-center gap-1 text-muted"><CircleDashed className="size-4" /> token gerado, aguardando o 1º envio</span>
                    ) : (
                      <span className="flex items-center gap-1 text-warn"><CircleAlert className="size-4" /> falta gerar o token</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </Passo>

        <Passo n={2} titulo="Crie os campos personalizados na plataforma">
          <p>
            Na conta do chatbot, crie estes campos personalizados do tipo <b>texto</b>, com o nome <b>exatamente</b> como está abaixo. No fluxo, cada um recebe a variável da coluna “Valor”.
            Maiúsculas e acentos no nome não fazem diferença.
          </p>
          <TabelaCampos titulo="Essenciais" campos={ESSENCIAIS} />
          <TabelaCampos titulo="Anúncio (tráfego pago)" campos={ANUNCIO} />
          <TabelaCampos titulo="Úteis" campos={UTEIS} />
          <Alerta tipo="info">
            Qualquer outro campo personalizado (pesquisa de satisfação, resumo, interesse…) também é guardado e lido pela IA. Não precisa apagar nada.
          </Alerta>
        </Passo>

        <Passo n={3} titulo="Monte o fluxo de fim de atendimento">
          <p>No fluxo que roda quando o atendimento é encerrado, coloque nesta ordem:</p>
          <ol className="grid list-decimal gap-1.5 pl-5">
            <li>
              <b>Definir campo</b> para cada campo do passo 2 (ex.: <code>Historico Conversa</code> = <code>{"{{chat_history_details_large}}"}</code>).
            </li>
            <li>
              <b>External Request</b> com:
              <dl className="mt-2 grid grid-cols-[minmax(0,140px)_minmax(0,1fr)] gap-x-3 gap-y-2 rounded-lg border border-line p-3">
                <dt className="text-muted">Request Type</dt>
                <dd><code>POST</code></dd>
                <dt className="text-muted">Request URL</dt>
                <dd className="break-all"><code>{origem}/api/webhook</code></dd>
                <dt className="text-muted">Cabeçalhos</dt>
                <dd className="grid gap-1">
                  <span><code>Authorization</code> = <code>Bearer whk_…</code> (o token do passo 1, com a palavra Bearer e um espaço antes)</span>
                  <span><code>Content-Type</code> = <code>application/json</code></span>
                </dd>
                <dt className="text-muted">Corpo</dt>
                <dd>os dados completos do contato (com os campos personalizados e as etiquetas)</dd>
              </dl>
            </li>
            <li>
              <b>Publique</b> o fluxo.
            </li>
          </ol>
          <Alerta tipo="aviso">
            Os campos precisam ser preenchidos <b>antes</b> do External Request; senão o envio sai com os valores do atendimento anterior.
          </Alerta>
        </Passo>

        <Passo n={4} titulo="Teste">
          <p>
            No External Request, clique em <b>Testar Agora</b>. A resposta certa começa com <code>"ok": true</code> e diz quantos atendimentos e mensagens foram lidos.
            Em seguida, abra <Link to="/eventos" className="font-medium text-accent hover:underline">Envios recebidos</Link>: o envio aparece lá como <b>processado</b>, e o atendimento em{" "}
            <Link to="/atendimentos" className="font-medium text-accent hover:underline">Atendimentos</Link>.
          </p>
          <p>Reenviar o mesmo contato não duplica nada: o painel só acrescenta o que for novo.</p>
          <details className="rounded-lg border border-line p-3">
            <summary className="cursor-pointer font-medium">Exemplo do que a plataforma envia</summary>
            <Codigo texto={EXEMPLO} />
          </details>
        </Passo>

        <Cartao titulo="Deu errado? Veja o que fazer">
          <ul className="-mx-4 divide-y divide-line">
            {PROBLEMAS.map((p) => (
              <li key={p.sintoma} className="grid gap-1 px-4 py-2.5 text-sm sm:grid-cols-[minmax(0,240px)_minmax(0,1fr)] sm:gap-4">
                <span className="font-medium">{p.sintoma}</span>
                <span className="text-ink-2">{p.solucao}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-sm text-ink-2">
            Todo envio fica registrado em <Link to="/eventos" className="font-medium text-accent hover:underline">Envios recebidos</Link>, inclusive os recusados, com o motivo e o JSON que chegou.
          </p>
        </Cartao>
      </div>
    </>
  );
}

function Passo({ n, titulo, children }: { n: number; titulo: string; children: ReactNode }) {
  return (
    <Cartao>
      <div className="flex gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent text-sm font-semibold text-white">{n}</span>
        <div className="grid min-w-0 flex-1 gap-3 text-sm text-ink-2">
          <h2 className="pt-0.5 text-base font-semibold text-ink">{titulo}</h2>
          {children}
        </div>
      </div>
    </Cartao>
  );
}

function Codigo({ texto, copiar = true }: { texto: string; copiar?: boolean }) {
  return (
    <div className="relative">
      <pre className={cx("overflow-x-auto whitespace-pre-wrap break-all rounded-lg bg-surface-2 p-3 text-xs text-ink", copiar && "pr-24")}>{texto}</pre>
      {copiar && (
        <div className="absolute right-2 top-2">
          <BotaoCopiar texto={texto} />
        </div>
      )}
    </div>
  );
}

function TabelaCampos({ titulo, campos }: { titulo: string; campos: CampoPlataforma[] }) {
  return (
    <div className="grid gap-1.5">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{titulo}</p>
      <div className="overflow-x-auto rounded-lg border border-line">
        <table className="w-full min-w-[560px] text-sm">
          <thead className="bg-surface-2 text-left text-xs text-muted">
            <tr>
              <th className="px-3 py-2 font-medium">Nome do campo</th>
              <th className="px-3 py-2 font-medium">Valor</th>
              <th className="px-3 py-2 font-medium">Para quê</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {campos.map((c) => (
              <tr key={c.nome} className="align-top">
                <td className="px-3 py-2">
                  <Copiavel texto={c.nome} forte />
                </td>
                <td className="px-3 py-2">
                  <Copiavel texto={c.valor} />
                </td>
                <td className="px-3 py-2 text-ink-2">{c.para}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Texto que copia ao clicar */
function Copiavel({ texto, forte }: { texto: string; forte?: boolean }) {
  const [copiado, setCopiado] = useState(false);
  return (
    <button
      type="button"
      title="Clique para copiar"
      onClick={() =>
        navigator.clipboard
          ?.writeText(texto)
          .then(() => {
            setCopiado(true);
            setTimeout(() => setCopiado(false), 1200);
          })
          .catch(() => {})
      }
      className={cx("whitespace-nowrap rounded px-1 text-left hover:bg-surface-2 cursor-copy", forte ? "font-medium text-ink" : "font-mono text-xs text-ink-2")}
    >
      {texto}
      {copiado && <span className="ml-1.5 font-sans text-[11px] font-normal text-good">copiado</span>}
    </button>
  );
}
