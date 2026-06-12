'use client'

import type { Socio, SocioNode as SocioNodeType } from '@/types'
import { maskCNPJ } from '@/lib/utils'
import { fmtDocumentoSocio } from '@/lib/relatorio-socios'
import SocioNode from '@/components/SocioNode'

interface Props {
  tomadorNome: string
  tomadorDoc: string | null
  arvore: SocioNodeType[]
  diretores: Socio[]
  readOnly?: boolean
  onAddSocio?: (parentSocioId: string) => void
  onEditSocio?: (n: SocioNodeType) => void
  onDeleteSocio?: (n: SocioNodeType) => void
  onEditDiretor?: (d: Socio) => void
  onDeleteDiretor?: (d: Socio) => void
}

// Desenho completo do organograma: TOMADOR (raiz) → árvore de sócios,
// e o grupo OPCIONAL de Diretores (ligado por linha pontilhada).
// Usado tanto no editor (com handlers) quanto no relatório (readOnly).
export default function OrganogramaView({
  tomadorNome, tomadorDoc, arvore, diretores, readOnly,
  onAddSocio, onEditSocio, onDeleteSocio, onEditDiretor, onDeleteDiretor,
}: Props) {
  return (
    <div className="org-wrapper">
      <ul className="org-tree">
        <li className="org-subtree">
          <div className="org-node org-node-raiz">
            <div className="org-node-top"><span className="org-node-badge" style={{ background: '#e8b84b', color: '#102040' }}>🏛️ TOMADOR</span></div>
            <div className="org-node-nome">{tomadorNome}</div>
            <div className="org-node-doc">{tomadorDoc ? maskCNPJ(tomadorDoc) : '—'}</div>
          </div>
          {arvore.length > 0 && (
            <ul className="org-children">
              {arvore.map(node => (
                <SocioNode key={node.id} node={node} readOnly={readOnly}
                  onAdd={onAddSocio} onEdit={onEditSocio} onDelete={onDeleteSocio} />
              ))}
            </ul>
          )}
        </li>
      </ul>

      {diretores.length > 0 && (
        <div className="org-diretores">
          <div className="org-diretores-head">⚖️ Diretores — assinam como responsáveis</div>
          <div className="org-diretores-cards">
            {diretores.map(d => (
              <div key={d.id} className="org-diretor-card">
                <div className="org-diretor-icon">👔</div>
                <div className="org-diretor-nome">{d.nome_razao_social}</div>
                {d.cargo && <div className="org-diretor-cargo">{d.cargo}</div>}
                <div className="org-diretor-doc">{fmtDocumentoSocio(d.documento, d.tipo_pessoa)}</div>
                {!readOnly && (
                  <div className="org-diretor-actions" data-html2canvas-ignore="true">
                    <button type="button" className="org-act org-act-edit" title="Editar" onClick={() => onEditDiretor?.(d)}>✏️</button>
                    <button type="button" className="org-act org-act-del" title="Excluir" onClick={() => onDeleteDiretor?.(d)}>✕</button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
