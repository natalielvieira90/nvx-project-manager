/**
 * Logotipo oficial NVX Digital (arquivo vetorial do manual da marca, versão horizontal para
 * fundos escuros). Não redesenhar nem recompor: use sempre o arquivo em src/assets/marca.
 * Redução mínima da versão horizontal em tela: 150 px de largura.
 */
import logoHorizontal from '../assets/marca/nvx-horizontal-cor-fundo-escuro.svg';

export function Logo({ compacto = false }: { compacto?: boolean }) {
  return (
    <div className="flex flex-col items-start">
      <img src={logoHorizontal} alt="NVX Digital" width={compacto ? 150 : 164} height={compacto ? 37 : 40} className="block" />
      {!compacto && (
        // Respeita a área de proteção do logotipo (1/4 da altura do símbolo) antes do nome do produto.
        <span className="rotulo mt-3 text-[10px] text-lavanda-300">Project Manager</span>
      )}
    </div>
  );
}
