# Backup do FAM CRM (Supabase Free)

Backup automatico do banco na **nuvem do GitHub Actions** — roda **Segunda / Quarta / Sexta as 03:00 (BRT)** e mantem **3 geracoes** (3 linhas de defesa, cada uma de um dia diferente). Funciona mesmo com a internet do escritorio fora ou o PC desligado.

- `.github/workflows/backup-db.yml` — workflow agendado.
- `scripts/backup-storage.mjs` — backup dos arquivos do bucket `fam-anexos` (anexos das operacoes).

---

## Setup (so 1 vez — ~5 min, precisa do painel do Supabase)

### 1. Confirmar que o repositorio e privado
GitHub -> Settings -> General. Os backups contem dados de clientes; o repo **tem que ser privado**.

### 2. Pegar a URI de conexao (Session Pooler)
No painel do Supabase: **Settings -> Database -> Connection string -> aba "Session pooler" -> URI**.
Formato:
```
postgresql://postgres.[ref]:[SENHA]@aws-0-[regiao].pooler.supabase.com:5432/postgres
```
> Use a **Session pooler** (IPv4). NAO use a "Direct connection" — ela e IPv6 e falha no GitHub Actions.

### 3. Cadastrar os secrets
GitHub -> **Settings -> Secrets and variables -> Actions -> New repository secret**:

| Secret | Obrigatorio? | Valor |
|---|---|---|
| `SUPABASE_DB_URL` | **Sim** | A URI do passo 2 |
| `BACKUP_PASSPHRASE` | Recomendado | Uma senha forte — criptografa os backups (AES256). **Guarde-a**, sem ela nao da pra restaurar. |
| `SUPABASE_URL` | Para anexos | `https://[ref].supabase.co` |
| `SUPABASE_SERVICE_ROLE_KEY` | Para anexos | Settings -> API -> `service_role` key |

### 4. Conferir a versao do Postgres
Supabase -> Settings -> Infrastructure. Se for **PG 15** (e nao 17), trocar `postgresql-client-17` por `postgresql-client-15` em `.github/workflows/backup-db.yml`.

### 5. Testar agora (sem esperar a agenda)
GitHub -> aba **Actions** -> **Backup Supabase DB** -> **Run workflow**.
Deve terminar verde e gerar um artifact `fam-crm-backup-...` (arquivo `.sql.gz`, ou `.sql.gz.gpg` se usou senha).

---

## Como esta a protecao

- **Agenda:** Seg/Qua/Sex 03:00 BRT (`cron: 0 6 * * 1,3,5` em UTC).
- **3 geracoes:** retencao de 8 dias + 3 execucoes/semana => sempre os 3 ultimos backups disponiveis (ex.: sexta tem sexta + quarta + segunda).
- **Bonus:** rodar 3x/semana mantem o projeto "ativo" e evita a pausa por inatividade (7 dias) do tier gratuito.
- **Performance:** banco pequeno + so leitura + madrugada = impacto desprezivel, sem travar escrita.

---

## Como restaurar

1. GitHub -> **Actions** -> abrir a execucao desejada (a mais recente, a anterior, ou a anterior a essa) -> baixar o artifact.
2. Se estiver criptografado (`.gpg`), descriptografar:
   ```bash
   gpg --batch --yes --passphrase "SUA_SENHA" --decrypt fam-crm-backup-AAAA-MM-DD.sql.gz.gpg > fam-crm-backup-AAAA-MM-DD.sql.gz
   ```
3. Descompactar:
   ```bash
   gunzip fam-crm-backup-AAAA-MM-DD.sql.gz
   ```
4. Restaurar (num projeto Supabase novo, ou no mesmo se o reset for intencional):
   ```bash
   psql "postgresql://postgres.[ref]:[SENHA]@aws-0-[regiao].pooler.supabase.com:5432/postgres" -f fam-crm-backup-AAAA-MM-DD.sql
   ```
5. Anexos (se houver `fam-crm-anexos-...tar.gz`): `tar -xzf` e re-enviar os arquivos para o bucket `fam-anexos`.
6. Se restaurou num projeto novo, atualizar `.env.local` / secrets do CRM (`NEXT_PUBLIC_SUPABASE_URL` e chaves) para apontar pro novo projeto.

> **Dica:** teste a restauracao uma vez num projeto Supabase de teste para garantir que o backup funciona de verdade.
