import { Route, Routes } from 'react-router-dom';
import { Layout } from './components/Layout.tsx';
import { Dashboard } from './pages/Dashboard.tsx';
import { ListaClientes } from './pages/clientes/ListaClientes.tsx';
import { DetalheCliente } from './pages/clientes/DetalheCliente.tsx';
import { ListaProjetos } from './pages/projetos/ListaProjetos.tsx';
import { DetalheProjeto } from './pages/projetos/DetalheProjeto.tsx';
import { ControleHoras } from './pages/horas/ControleHoras.tsx';
import { Suporte } from './pages/suporte/Suporte.tsx';
import { Financeiro } from './pages/financeiro/Financeiro.tsx';
import { Relatorios } from './pages/relatorios/Relatorios.tsx';
import { Backup } from './pages/backup/Backup.tsx';
import { NaoEncontrada } from './pages/NaoEncontrada.tsx';

export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Dashboard />} />
        <Route path="/clientes" element={<ListaClientes />} />
        <Route path="/clientes/:id" element={<DetalheCliente />} />
        <Route path="/projetos" element={<ListaProjetos />} />
        <Route path="/projetos/:id" element={<DetalheProjeto />} />
        <Route path="/horas" element={<ControleHoras />} />
        <Route path="/suporte" element={<Suporte />} />
        <Route path="/financeiro" element={<Financeiro />} />
        <Route path="/relatorios" element={<Relatorios />} />
        <Route path="/backup" element={<Backup />} />
        <Route path="*" element={<NaoEncontrada />} />
      </Route>
    </Routes>
  );
}
