import { useMutation } from "@tanstack/react-query";
import { useState } from "react";
import { api } from "../api";
import { Titulo } from "../components/Layout";
import { Alerta, Botao, Campo, Cartao } from "../components/ui";

export function PaginaConta() {
  const [atual, setAtual] = useState("");
  const [nova, setNova] = useState("");
  const [confirma, setConfirma] = useState("");
  const [msg, setMsg] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null);
  const trocar = useMutation({
    mutationFn: () => api("/auth/senha", { method: "POST", body: { senha_atual: atual, nova_senha: nova } }),
    onSuccess: () => {
      setMsg({ tipo: "ok", texto: "Senha alterada." });
      setAtual("");
      setNova("");
      setConfirma("");
    },
    onError: (e) => setMsg({ tipo: "erro", texto: (e as Error).message }),
  });
  return (
    <>
      <Titulo titulo="Minha senha" />
      <Cartao className="max-w-md">
        <form
          className="grid gap-4 pt-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (nova !== confirma) return setMsg({ tipo: "erro", texto: "A confirmação não bate com a nova senha." });
            trocar.mutate();
          }}
        >
          {msg && <Alerta tipo={msg.tipo}>{msg.texto}</Alerta>}
          <Campo id="senha-atual" rotulo="Senha atual" type="password" autoComplete="current-password" required value={atual} onChange={(e) => setAtual(e.target.value)} />
          <Campo id="senha-nova" rotulo="Nova senha" type="password" autoComplete="new-password" minLength={8} required value={nova} onChange={(e) => setNova(e.target.value)} />
          <Campo id="senha-conf" rotulo="Repita a nova senha" type="password" autoComplete="new-password" required value={confirma} onChange={(e) => setConfirma(e.target.value)} />
          <Botao type="submit" variante="primario" carregando={trocar.isPending}>
            Alterar senha
          </Botao>
        </form>
      </Cartao>
    </>
  );
}
