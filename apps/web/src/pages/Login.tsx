import { BarChart3 } from "lucide-react";
import { useState, type FormEvent } from "react";
import { useAuth } from "../auth";
import { Alerta, Botao, Campo } from "../components/ui";

export function PaginaLogin() {
  const { entrar } = useAuth();
  const [email, setEmail] = useState("");
  const [senha, setSenha] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);

  async function enviar(e: FormEvent) {
    e.preventDefault();
    setErro(null);
    setEnviando(true);
    try {
      await entrar(email, senha);
    } catch (err) {
      setErro((err as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className="grid min-h-full place-items-center px-4 py-10">
      <form onSubmit={enviar} className="grid w-full max-w-sm gap-4 rounded-2xl border border-line bg-surface p-7">
        <div className="flex items-center gap-3">
          <span className="grid size-10 place-items-center rounded-xl bg-accent text-white">
            <BarChart3 className="size-5" />
          </span>
          <div>
            <h1 className="text-lg font-semibold">Painel de Atribuições</h1>
            <p className="text-xs text-muted">Grupo Asia · acesso restrito</p>
          </div>
        </div>
        {erro && <Alerta>{erro}</Alerta>}
        <Campo id="email" rotulo="E-mail" type="email" autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <Campo id="senha" rotulo="Senha" type="password" autoComplete="current-password" required value={senha} onChange={(e) => setSenha(e.target.value)} />
        <Botao type="submit" variante="primario" carregando={enviando} className="h-10">
          Entrar
        </Botao>
        <p className="text-center text-xs text-muted">Sem acesso? Peça ao administrador da Mundo dos Bots.</p>
      </form>
    </div>
  );
}
