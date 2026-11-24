import { Link } from 'react-router-dom';
import { Compass } from 'lucide-react';
import { Cartao, EstadoVazio } from '../components/ui.tsx';

export function NaoEncontrada() {
  return (
    <Cartao>
      <EstadoVazio
        icone={Compass}
        titulo="Página não encontrada"
        descricao="O endereço acessado não existe."
        acao={
          <Link to="/" className="text-sm font-medium text-destaque-700 hover:underline">
            Voltar ao dashboard
          </Link>
        }
      />
    </Cartao>
  );
}
