'use client'

import type { SocioNode as SocioNodeType } from '@/types'
import { fmtDocumentoSocio } from '@/lib/relatorio-socios'

interface Props {
  node: SocioNodeType
  onAdd?: (parentSocioId: string) => void
  onEdit?: (node: SocioNodeType) => void
  onDelete?: (node: SocioNodeType) => void
  readOnly?: boolean
}

// Nó recursivo do organograma. Renderiza o card do sócio e, abaixo, seus filhos
// (que também são <SocioNode>), com linhas conectoras desenhadas via CSS.
export default function SocioNode({ node, onAdd, onEdit, onDelete, readOnly }: Props) {
  const temFilhos = node.filhos.length > 0
  const pct = node.percentual != null ? `${Number(node.percentual).toLocaleString('pt-BR')}%` : null
  const ehPJ = node.tipo_pessoa === 'PJ' || (node.tipo_pessoa == null && (node.documento ?? '').replace(/\D/g, '').length > 11)

  return (
    <li className="org-subtree">
      <div className={`org-node${ehPJ ? ' org-node-pj' : ''}`}>
        <div className="org-node-top">
          <span className="org-node-badge">{ehPJ ? '🏢 PJ' : '👤 PF'}</span>
        </div>
        {pct && <span className="org-node-pct">{pct}</span>}
        <div className="org-node-nome" title={node.nome_razao_social}>{node.nome_razao_social}</div>
        <div className="org-node-doc">{fmtDocumentoSocio(node.documento, node.tipo_pessoa)}</div>

        {!readOnly && (
          <div className="org-node-actions" data-html2canvas-ignore="true">
            <button type="button" className="org-act org-act-add" title="Adicionar sócio deste" onClick={() => onAdd?.(node.id)}>＋</button>
            <button type="button" className="org-act org-act-edit" title="Editar" onClick={() => onEdit?.(node)}>✏️</button>
            <button type="button" className="org-act org-act-del" title="Excluir (e toda a sub-árvore)" onClick={() => onDelete?.(node)}>✕</button>
          </div>
        )}
      </div>

      {temFilhos && (
        <ul className="org-children">
          {node.filhos.map((filho) => (
            <SocioNode
              key={filho.id}
              node={filho}
              onAdd={onAdd}
              onEdit={onEdit}
              onDelete={onDelete}
              readOnly={readOnly}
            />
          ))}
        </ul>
      )}
    </li>
  )
}
