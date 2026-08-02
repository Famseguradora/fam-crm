# Integração AxiMobius ← FAM CRM

**Para o Claude Code que trabalha no AxiMobius.** Este documento é o contrato completo
de leitura do CRM da FAM Seguradora. Leia inteiro antes de escrever a primeira linha:
a seção *Armadilhas* contém três regras de negócio que não estão no schema e que, se
ignoradas, produzem números errados que parecem certos.

Autor: Marco Aurélio Dragone (dono dos dois sistemas). Data: 01/08/2026.

---

## 1. A regra que governa tudo

**O AxiMobius LÊ o CRM. Nunca escreve.**

Não é um acordo de cavalheiros, é uma garantia mecânica em três camadas:

| Camada | O que impede |
|---|---|
| API | Nenhuma rota `/api/axi/*` exporta POST, PUT, PATCH ou DELETE. O Next.js responde `405` automaticamente. |
| Banco | A role `aximobius_ro` tem `GRANT SELECT` e nada mais. `INSERT/UPDATE/DELETE/TRUNCATE` foram revogados nominalmente. |
| RLS | As policies criadas para ela são `FOR SELECT`. Não existe policy de escrita que a inclua. |

Se uma análise do AxiMobius concluir que um dado do CRM está errado, **o AxiMobius não
corrige**. Ele reporta, e um humano decide e altera no CRM. Isso vale até segunda ordem
do Marco.

Tudo que o AxiMobius criar, derivar, enriquecer ou inferir vive **no banco dele**.

---

## 2. Credenciais

O Marco entrega o conteúdo de um arquivo `.env.aximobius.local` com todos os valores
preenchidos. Copie-os para o `.env` do AxiMobius. **Não commite** esse arquivo.

```bash
# .env do AxiMobius
FAM_CRM_URL=https://fam-crm-five.vercel.app   # produção do CRM na Vercel
FAM_CRM_TOKEN=<token de 43 caracteres>        # o Marco fornece

# Só se for usar o caminho SQL direto (seção 8)
FAM_CRM_PG_HOST=db.xungscboxfkegbyhrnmc.supabase.co
FAM_CRM_PG_PORT=5432
FAM_CRM_PG_DATABASE=postgres
FAM_CRM_PG_USER=aximobius_ro
FAM_CRM_PG_PASSWORD=<o Marco fornece>
```

### Teste antes de escrever qualquer código

```bash
# 1. Sem token: TEM que dar 401. Se responder dados, pare e avise o Marco.
curl -i "$FAM_CRM_URL/api/axi/schema" | head -1

# 2. Com token: tem que dar 200 e listar as tabelas.
curl -s -H "Authorization: Bearer $FAM_CRM_TOKEN" "$FAM_CRM_URL/api/axi/schema" | head -c 300
```

Se o passo 2 devolver `503`, a variável `AXI_API_TOKEN` não está configurada no servidor
do CRM: avise o Marco, não é problema do seu lado.

Autenticação em toda chamada:

```
Authorization: Bearer <FAM_CRM_TOKEN>
```

Sem header → `401`. Token errado → `403`. Token não configurado no servidor → `503`
(a API fecha, nunca abre por omissão).

---

## 3. Comece por aqui

```bash
curl -H "Authorization: Bearer $FAM_CRM_TOKEN" \
     "$FAM_CRM_URL/api/axi/schema"
```

`GET /api/axi/schema` é auto-descritivo: devolve todas as tabelas expostas, as colunas
**lidas do Postgres em tempo real**, a contagem de linhas de cada uma, as regras de
negócio e a lista de endpoints. Se este documento e o `/schema` divergirem, **o
`/schema` está certo** — ele é gerado pelo banco, este texto é escrito à mão.

---

## 4. Os quatro endpoints

### `GET /api/axi/schema`
O contrato. Sem parâmetros. Chame no início de cada sincronização para detectar
mudanças estruturais no CRM.

### `GET /api/axi/dados`
O cavalo de carga. Serve carga completa e delta incremental.

| Parâmetro | Obrigatório | Descrição |
|---|---|---|
| `tabela` | sim | Nome exato. Fora da whitelist → `400`. |
| `desde` | não | ISO 8601. **Ausente = carga completa. Presente = só o que mudou.** |
| `cursor` | não | Offset da paginação. Use o `proximo_cursor` da resposta anterior. |
| `limite` | não | Padrão 1000, máximo 5000. |

```jsonc
{
  "ok": true,
  "tabela": "operacoes",
  "modo": "delta",                  // ou "completo"
  "total": 37,                      // total do FILTRO, não da tabela
  "retornadas": 37,
  "cursor": 0,
  "proximo_cursor": null,           // null = acabou; senão, repita com este valor
  "marca_dagua": "2026-08-01T14:23:11.000Z",  // guarde para o próximo `desde`
  "dados": [ /* ... */ ]
}
```

> **Só guarde a `marca_dagua` quando `proximo_cursor` for `null`.** Guardar no meio da
> paginação faz a próxima sincronização começar adiante do que você realmente recebeu,
> e as linhas do intervalo somem para sempre.

### `GET /api/axi/historico`
A trilha temporal. **É o endpoint mais importante para o AxiMobius**: sem ele você só
tem uma fotografia do agora, e não existe análise preditiva sobre foto estática.

| Parâmetro | Descrição |
|---|---|
| `desde` | ISO 8601, filtra por `mudou_em`. |
| `tabela` | Filtra a entidade (ex.: `operacoes`). |
| `campo` | Filtra o campo (ex.: `status`). |
| `registro_id` | Toda a vida de um registro específico. |
| `apos_id` | Paginação keyset. Use `proximo_apos_id` da resposta anterior. |
| `limite` | Padrão 1000, máximo 5000. |

Cada linha é **um campo que mudou**:

```jsonc
{
  "id": 1874,
  "tabela": "operacoes",
  "registro_id": "8f3c...",
  "acao": "update",              // insert | update | delete
  "campo": "status",             // null em insert/delete
  "valor_antes": "Em Análise",
  "valor_depois": "Comitê",
  "snapshot": null,              // preenchido só em insert/delete
  "usuario_email": "...",        // null se veio de script/API
  "mudou_em": "2026-07-14T11:02:33.000Z"
}
```

### `GET /api/axi/kpis`
Números canônicos. **Use este endpoint sempre que o AxiMobius for exibir um número que
também aparece numa tela do CRM.** Ver seção 6.

| Parâmetro | Descrição |
|---|---|
| `de`, `ate` | `YYYY-MM` inclusive. Mês de referência = `data_emissao` ou, se nulo, `data_entrada`. |
| `status` | Filtra por status da operação. |
| `incluir_inativas` | `true` inclui operações inativas. **Quebra a paridade com as telas.** Padrão `false`. |

---

## 5. O modelo de dados

```
corretoras (93)
    │  1:N
    ▼
tomadores (447) ──1:N──► socios (72)
    │  1:N
    ▼
operacoes (200) ──1:N──► comite_votos, comite_comentarios, anexos
    │
    └── produto_id ──► produtos ──1:N──► modalidades
```

**Cadeia de negócio:** a corretora traz o tomador, o tomador contrata operações de
seguro garantia. Cada operação passa por uma esteira de status (`status_fluxo_operacao`),
pode ir a Comitê, receber votos de diretores e terminar emitida.

Tabelas expostas: `operacoes`, `tomadores`, `corretoras`, `socios`, `produtos`,
`modalidades`, `metas_negocio`, `comite_votos`, `comite_votos_historico`,
`comite_comentarios`, `status_fluxo_operacao`, `status_fluxo_tomador`, `anexos`,
`usuarios`, `audit_log`, `fam_historico`.

**Campos com dado pessoal** (`cnpj`, `documento` de sócios, `email`, `telefone`,
`endereco`): estão disponíveis porque os dois sistemas são da FAM, mas trate-os com
o cuidado que merecem. `anexos` expõe só metadados — o conteúdo dos arquivos não sai
do CRM.

---

## 6. Armadilhas (leia antes de somar qualquer coisa)

Estas três regras já causaram bug em produção no CRM. Não estão no schema.

### 6.1 O LMG tem teto de R$ 80 milhões

`operacoes.lmg` guarda o valor **real** cadastrado, sem teto. Toda fórmula da FAM
aplica `min(lmg, 80.000.000)`. Somar `lmg` cru infla a exposição.

`premio_previsto` **já nasce com o teto aplicado** (é coluna gerada no banco), então
essa some direto.

### 6.2 `vigencia_anos` não está necessariamente em anos

O valor está **na unidade de `periodicidade_vigencia`**. Se `periodicidade_vigencia`
for `"Meses"`, então `vigencia_anos = 22` significa **22 meses**, não 22 anos.

Esse exato erro exibiu "22 anos" em 29% da carteira antes de ser corrigido. A conversão
correta:

```ts
function anosVigencia(o) {
  if (o.vigencia_dias != null) return Number(o.vigencia_dias) / 365
  const v = Number(o.vigencia_anos ?? 1)
  if (o.periodicidade_vigencia === 'Meses') return v / 12
  if (o.periodicidade_vigencia === 'Dias' || o.periodicidade_vigencia === 'Data') return v / 365
  return v
}
```

**Prefira sempre `vigencia_dias` quando não for nulo** — dividir por 365 já captura o
ano bissexto.

### 6.3 As telas só contam operações ativas

Todas as telas do CRM (cockpit de Corretoras, Operações, Dashboard, KPIs por Mês)
carregam operações com `.eq('ativo', true)`. Se o AxiMobius somar tudo, os números não
batem com o que o Diretor vê. `/api/axi/kpis` já aplica esse recorte.

### 6.4 Não reimplemente a Taxa Média

Há **duas** taxas, e elas respondem perguntas diferentes:

| | Fórmula | Quando usar |
|---|---|---|
| **Ponderada** | `Σ(taxa × mín(lmg,80M) × mín(anosVig,1)) ÷ Σ mín(lmg,80M)` | Taxa efetiva da carteira, base anual. Leva prazo. |
| **Mensal** | `Σ(taxa × mín(lmg,80M)) ÷ Σ mín(lmg,80M)` | Taxa praticada no mês (competência). Não leva prazo. |

Estas fórmulas têm **fonte única** em `lib/corretoras/agregacoes.ts` no repositório do
CRM. `/api/axi/kpis` roda esse mesmo código. Reimplementar do lado do AxiMobius garante
que um dia os dois sistemas mostrem taxas diferentes para o mesmo mês, e ninguém saiba
qual está certa.

Para modelo preditivo e cruzamento livre, use os dados brutos de `/api/axi/dados`.
Para "quanto foi o prêmio de julho", use `/api/axi/kpis`.

---

## 7. Estratégia de sincronização recomendada

O CRM inteiro tem **4,3 MB**. Cabe folgadamente no banco do AxiMobius. A arquitetura
certa é: **replique tudo e analise localmente.**

Vantagens: latência de consulta praticamente zero, nenhuma carga analítica no banco de
produção do CRM, e liberdade total de SQL, joins, window functions e modelos.

```
1ª execução  →  carga completa de cada tabela  (~4 MB, poucos segundos)
depois       →  a cada 5-15 min, delta por `desde`  (normalmente 0 a 50 linhas)
sempre       →  histórico incremental por `apos_id`
```

### Cliente pronto (TypeScript)

```ts
// lib/fam-crm.ts no AxiMobius
const BASE = process.env.FAM_CRM_URL!
const TOKEN = process.env.FAM_CRM_TOKEN!

async function chamar(caminho: string) {
  const r = await fetch(`${BASE}${caminho}`, {
    headers: { Authorization: `Bearer ${TOKEN}` },
    cache: 'no-store',
  })
  if (!r.ok) throw new Error(`FAM CRM ${r.status}: ${(await r.json()).erro ?? r.statusText}`)
  return r.json()
}

/**
 * Puxa uma tabela inteira, seguindo a paginação até o fim.
 * `desde` ausente = carga completa; presente = só o que mudou.
 * Devolve também a marca d'água, que só é válida porque percorremos TUDO.
 */
export async function puxarTabela(tabela: string, desde?: string) {
  const linhas: any[] = []
  let cursor: number | null = 0
  let marca: string | null = null

  while (cursor !== null) {
    const qs = new URLSearchParams({ tabela, cursor: String(cursor), limite: '1000' })
    if (desde) qs.set('desde', desde)
    const r = await chamar(`/api/axi/dados?${qs}`)
    linhas.push(...r.dados)
    cursor = r.proximo_cursor
    if (cursor === null) marca = r.marca_dagua   // só no fim, senão perde linhas
  }
  return { linhas, marca }
}

/** Trilha temporal, paginada por keyset. */
export async function puxarHistorico(aposId = 0, filtros: Record<string, string> = {}) {
  const eventos: any[] = []
  let apos: number | null = aposId

  while (apos !== null) {
    const qs = new URLSearchParams({ ...filtros, apos_id: String(apos), limite: '1000' })
    const r = await chamar(`/api/axi/historico?${qs}`)
    eventos.push(...r.dados)
    apos = r.proximo_apos_id
  }
  return eventos
}

export const kpis = (de?: string, ate?: string) =>
  chamar(`/api/axi/kpis${de || ate ? `?${new URLSearchParams({ ...(de && { de }), ...(ate && { ate }) })}` : ''}`)
```

### Rotina de sincronização

```ts
const TABELAS = ['corretoras','tomadores','socios','operacoes','produtos','modalidades',
                 'metas_negocio','comite_votos','comite_comentarios','usuarios',
                 'status_fluxo_operacao','status_fluxo_tomador','anexos']

export async function sincronizar(db) {
  for (const t of TABELAS) {
    const { marca_dagua: ultima } = await db.marcaDagua(t)   // null na 1ª vez
    const { linhas, marca } = await puxarTabela(t, ultima ?? undefined)
    if (linhas.length) {
      await db.upsert(`crm_${t}`, linhas)                    // conflito em `id`
      if (marca) await db.salvarMarcaDagua(t, marca)
    }
  }

  const ultimoId = await db.ultimoEventoHistorico()
  const eventos = await puxarHistorico(ultimoId)
  if (eventos.length) await db.inserir('crm_historico', eventos)
}
```

**Exclusões:** o delta por `updated_at` não vê o que foi apagado. Detecte exclusões pelo
histórico: `GET /api/axi/historico?campo=&...` com `acao = 'delete'`, ou compare os `id`
na carga completa (barata, 4 MB) uma vez por dia.

### Schema de destino sugerido

Espelhe as tabelas com prefixo `crm_`, guardando o `id` original como chave, e mantenha
uma tabela de controle:

```sql
create table crm_sync_controle (
  tabela        text primary key,
  marca_dagua   timestamptz,
  ultimo_evento bigint default 0,
  sincronizado_em timestamptz default now()
);
```

---

## 8. Caminho alternativo: SQL direto

Para exploração ad-hoc, existe o usuário `aximobius_ro` com `SELECT` no schema `public`
e no schema `axi`. Conexão Postgres normal.

> **Use com parcimônia.** Toda consulta aqui roda no banco de produção do CRM. Para
> análise recorrente ou pesada, replique e consulte localmente (seção 7).

Views prontas em `axi`:

| View | Serve para |
|---|---|
| `axi.vw_operacoes` | Operações com tomador, corretora e produto já resolvidos (evita 4 joins). |
| `axi.vw_status_transicoes` | Funil real: cada mudança de status com de/para e **dias de permanência**. |
| `axi.vw_tomadores` | Tomadores com corretora e contagem de operações/sócios. |
| `axi.vw_corretoras` | Corretoras com contagem de tomadores e operações. |
| `axi.vw_linha_do_tempo` | Todo evento em ordem cronológica, com flags `afeta_valor` e `e_mudanca_de_status`. |

```sql
-- Tempo médio em cada etapa do funil
select status_de, count(*) as vezes, round(avg(dias_no_status),1) as dias_medios
from axi.vw_status_transicoes
where tabela = 'operacoes' and dias_no_status is not null
group by status_de
order by dias_medios desc;

-- Operações paradas há mais de 15 dias
select registro_id, status_para, mudou_em,
       round(extract(epoch from (now() - mudou_em))/86400, 1) as dias_parada
from axi.vw_status_transicoes
where tabela = 'operacoes' and proxima_mudanca_em is null
  and mudou_em < now() - interval '15 days'
order by dias_parada desc;
```

---

## 9. Sobre o histórico

`fam_historico` é gravada por **trigger no banco** — nada escapa, nem script, nem SQL
direto, nem a própria API. Uma linha por campo alterado.

**Cobertura temporal — três regimes distintos:**

| Período | Origem | Qualidade |
|---|---|---|
| a partir de 01/08/2026 | trigger no banco | **completa**: todas as tabelas, nada escapa (nem script, nem SQL direto) |
| 02/06/2026 a 31/07/2026 | semeada do `audit_log` | parcial: só `operacoes`, `tomadores`, `socios`, `avisos`, e só o que passou pela tela |
| 10/05 a 01/06/2026 | **não existe** | use `created_at`; ver abaixo |

Volume atual: **2.336 eventos**, dos quais **223 são transições de status de operações**.

### A lacuna inicial, e por que ela existe

O CRM nasceu em **10/05/2026**. O `audit_log` só foi criado em **02/06/2026**, junto com
a liberação de exclusão de operações para todos os usuários — a auditoria veio como
resposta a esse risco, não com o sistema. Entre as duas datas há **3 semanas sem trilha
de mudanças**, e elas pegam boa parte da carga inicial:

| | Criados antes de 02/06/2026 | % da base |
|---|---|---|
| Corretoras | 74 de 93 | 79,6% |
| Tomadores | 336 de 447 | 75,2% |
| Operações | 87 de 200 | 43,5% |

**O que continua disponível:** o `created_at` de todo registro, desde 11/05/2026. Análise
de originação, volume e sazonalidade de entrada funciona para a série inteira.

**O que não existe:** as mudanças sofridas por esses registros naquelas 3 semanas. Uma
operação que entrou em 14/05 e mudou de status em 20/05 não tem esse trânsito registrado
em lugar nenhum, e não há como reconstruí-lo. Para esses 87 registros, o funil só é
observável a partir de 02/06/2026.

Atenuante: aquele período foi de **carga inicial** (migração da base anterior), com
registros entrando em lote e mexendo pouco. O período de operação real do CRM está
coberto.

### Regra para modelagem

Trate **02/06/2026** e **01/08/2026** como quebras de regime. Antes de cada uma, a
ausência de evento **não prova** ausência de mudança — prova apenas ausência de captura.
Nunca calcule "tempo médio em status" ou "taxa de conversão por etapa" misturando os três
regimes sem normalizar pela janela observável, ou os registros antigos vão parecer
estáveis por artefato de instrumentação, não por comportamento.

---

## 10. Checklist de implantação

- [ ] Marco forneceu `FAM_CRM_URL` e `FAM_CRM_TOKEN`
- [ ] `GET /api/axi/schema` responde 200
- [ ] Chamada sem token responde 401 (confirma que a API está protegida)
- [ ] Tabelas `crm_*` criadas no banco do AxiMobius
- [ ] `crm_sync_controle` criada
- [ ] Carga completa rodou e os totais batem com `/api/axi/schema` (200 operações, 447 tomadores, 93 corretoras)
- [ ] Delta rodou uma segunda vez e trouxe 0 linhas (prova que a marca d'água funciona)
- [ ] Histórico importado (2.336+ eventos)
- [ ] KPIs do AxiMobius conferidos contra `/api/axi/kpis` para o mesmo período
- [ ] Agendamento da sincronização configurado (5 a 15 min)
- [ ] Nenhum código do AxiMobius faz POST/PUT/PATCH/DELETE no CRM

---

## 11. Erros da API

| Status | Significado | O que fazer |
|---|---|---|
| `400` | Parâmetro inválido (tabela fora da whitelist, `desde` malformado, período errado) | Corrija a chamada. A mensagem em `erro` diz o quê. |
| `401` | Header `Authorization` ausente | Envie o Bearer. |
| `403` | Token incorreto | Confira `FAM_CRM_TOKEN`. |
| `405` | Tentou escrever | **Esperado.** A API é somente leitura. |
| `500` | Falha ao ler o banco | Tente de novo; se persistir, avise o Marco. |
| `503` | `AXI_API_TOKEN` não configurado no servidor do CRM | Avise o Marco: falta a env var na Vercel. |

Todo erro vem como `{ "ok": false, "erro": "mensagem em português" }`.

---

## 12. Quando o CRM mudar

O CRM está em desenvolvimento ativo. Para não quebrar:

- Chame `/api/axi/schema` no início de cada sincronização e compare com o que você
  conhece. Coluna nova aparece sozinha; tabela nova precisa ser adicionada à whitelist
  no CRM (peça ao Marco).
- Nunca dependa de uma coluna existir sem checar. Use `?? null`.
- Se um KPI do AxiMobius divergir do CRM, **o CRM é a verdade**. Investigue a sua
  fórmula antes de reportar bug.
