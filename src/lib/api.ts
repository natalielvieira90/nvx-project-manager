/** Cliente HTTP mínimo para a API local. Erros do servidor viram `ErroApi` com mensagem em português. */
export class ErroApi extends Error {
  constructor(
    message: string,
    public status: number,
    public detalhes?: unknown,
  ) {
    super(message);
  }
}

export async function api<T>(caminho: string, opcoes: RequestInit = {}): Promise<T> {
  let resposta: Response;
  try {
    resposta = await fetch(`/api${caminho}`, {
      ...opcoes,
      headers: { 'Content-Type': 'application/json', ...opcoes.headers },
    });
  } catch {
    throw new ErroApi('Não foi possível conectar ao servidor. Verifique se o sistema está em execução.', 0);
  }
  const corpo = resposta.status === 204 ? null : await resposta.json().catch(() => null);
  if (!resposta.ok) {
    throw new ErroApi(corpo?.erro ?? `Erro ${resposta.status}`, resposta.status, corpo?.detalhes);
  }
  return corpo as T;
}
