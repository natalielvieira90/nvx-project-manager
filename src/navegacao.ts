import {
  Briefcase,
  DatabaseBackup,
  FileText,
  LayoutDashboard,
  LifeBuoy,
  Timer,
  Users,
  Wallet,
  type LucideIcon,
} from 'lucide-react';

export interface ItemNavegacao {
  rota: string;
  rotulo: string;
  icone: LucideIcon;
  descricao: string;
}

export const gruposNavegacao: { titulo: string; itens: ItemNavegacao[] }[] = [
  {
    titulo: 'Visão geral',
    itens: [
      { rota: '/', rotulo: 'Dashboard', icone: LayoutDashboard, descricao: 'Indicadores de projetos, horas e faturamento.' },
    ],
  },
  {
    titulo: 'Operação',
    itens: [
      { rota: '/clientes', rotulo: 'Clientes', icone: Users, descricao: 'Cadastro de clientes e seus contatos.' },
      { rota: '/projetos', rotulo: 'Projetos', icone: Briefcase, descricao: 'Projetos, prazos, valores e status.' },
      { rota: '/horas', rotulo: 'Controle de horas', icone: Timer, descricao: 'Cronômetro e lançamentos de horas trabalhadas.' },
      { rota: '/suporte', rotulo: 'Suporte', icone: LifeBuoy, descricao: 'Atendimentos de suporte e sua cobrança.' },
    ],
  },
  {
    titulo: 'Gestão',
    itens: [
      { rota: '/financeiro', rotulo: 'Financeiro', icone: Wallet, descricao: 'Cobranças, pagamentos recebidos e valores pendentes.' },
      { rota: '/relatorios', rotulo: 'Relatórios', icone: FileText, descricao: 'Relatórios com exportação em PDF e CSV.' },
      { rota: '/backup', rotulo: 'Backup', icone: DatabaseBackup, descricao: 'Backup manual, restauração e lixeira.' },
    ],
  },
];


