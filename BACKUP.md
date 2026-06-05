# Backup do FAM CRM (Supabase Free)

Backup **completo** do banco em **Node (sem instalar nada)**, gravando na pasta de
Infraestrutura da FAM (SharePoint). Roda **1x por dia em Segunda, Quarta e Sexta**,
às 08:00 — e se o PC estiver desligado nesse horário, roda **na primeira vez que
ligar naquele dia**. Mantém **3 gerações** (Seg, Qua, Sex = 3 linhas de defesa).
Sem impacto de performance: faz apenas leitura e o banco do CRM é pequeno.

> **Cada backup é a base INTEIRA.** Toda execução copia *todas* as tabelas e
> *todas* as linhas do zero — é uma fotografia completa e independente do banco.
> NÃO é incremental, NÃO guarda "só o que mudou". Segunda = base inteira;
> Quarta = base inteira; Sexta = base inteira.

> **Lembrete:** o backup precisa de um computador ligado para executar (a pasta de
> rede só *armazena*). Hoje quem executa é o seu PC, uma vez em cada dia Seg/Qua/Sex.

> ✅ **Já está configurado e rodando.** A tarefa agendada `FAM CRM - Backup DB`
> foi criada e testada (execução pelo Agendador retornou sucesso). O primeiro
> backup já está na pasta de destino. Gatilho: **Seg/Qua/Sex, 1x/dia, 08:00** (ou ao ligar).

## Como funciona
- **O quê:** exporta os DADOS de todas as tabelas do schema `public` para um
  arquivo gzipado e datado: `fam-crm-backup-AAAA-MM-DD.json.gz`.
- **Schema/DDL:** já versionado no repositório (`supabase-schema.sql` +
  `supabase-whatsapp.sql`). Backup = dados; estrutura = repo. Juntos = restauração completa.
- **Destino:** `...\FAM SEGURADORA - Documentos\Infraestrutura\Backup - Dashboard FAM`
  (sincroniza pro SharePoint/nuvem → cópia offsite automática).
- **Rotação:** mantém só os 3 `.json.gz` mais recentes.
- **Log:** `backup.log` na pasta de destino registra cada execução.
- **Credenciais:** lidas do `.env.local` do projeto (nada de segredo nos scripts).

**Arquivos:**
- `scripts/backup-db.mjs` — faz o backup (exporta + gzip + rotação + log).
- `scripts/restore-db.mjs` — restaura os dados a partir de um `.json.gz`.
- `scripts/register-backup-task.ps1` — (re)cria a tarefa agendada.
- `scripts/backup-storage.mjs` — (opcional) backup dos anexos do bucket `fam-anexos`.

> **Tabelas:** `dashboard_config` e `comite_votos` ainda não existem na produção
> (são estruturas futuras) e são automaticamente ignoradas. Quando forem criadas,
> entram no backup sozinhas.

---

## Comandos do dia a dia
```powershell
cd C:\Users\MarcoDragoneFAMSEGUR\fam-crm

# Rodar um backup manual agora
node scripts\backup-db.mjs

# Rodar pela tarefa agendada / ver status / ver log
Start-ScheduledTask -TaskName "FAM CRM - Backup DB"
Get-ScheduledTaskInfo -TaskName "FAM CRM - Backup DB"
Get-Content "C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documentos\Infraestrutura\Backup - Dashboard FAM\backup.log" -Tail 15
```

## (Opcional) Incluir os anexos do bucket `fam-anexos`
O backup cobre o banco; os arquivos enviados ficam no Storage. Para incluí-los:
```powershell
$dest = "C:\Users\MarcoDragoneFAMSEGUR\FAM Seguradora\FAM SEGURADORA - Documentos\Infraestrutura\Backup - Dashboard FAM"
$env:SUPABASE_URL = "https://[ref].supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<service_role key de Settings -> API>"
node scripts\backup-storage.mjs "$dest\fam-crm-anexos-$(Get-Date -f yyyy-MM-dd)"
```

---

## Como restaurar

1. **Crie/abra o projeto Supabase de destino** e aplique o schema no SQL Editor,
   nesta ordem: `supabase-schema.sql` e depois `supabase-whatsapp.sql`.
2. **Carregue os dados** do backup desejado (o mais recente, o anterior, ou o
   anterior a esse). Primeiro um *dry-run* (não grava nada):
   ```powershell
   node scripts\restore-db.mjs "<...>\fam-crm-backup-AAAA-MM-DD.json.gz"
   ```
   Conferindo as contagens, rode de verdade:
   ```powershell
   node scripts\restore-db.mjs "<...>\fam-crm-backup-AAAA-MM-DD.json.gz" --yes
   ```
   > Por padrão restaura no projeto do `.env.local`. Para restaurar em **outro**
   > projeto, defina antes: `$env:TARGET_SUPABASE_URL` e `$env:TARGET_SUPABASE_SERVICE_ROLE_KEY`.
3. **Anexos** (se houver `fam-crm-anexos-*.tar.gz`): extraia e re-envie os arquivos ao bucket `fam-anexos`.
4. Se restaurou num projeto novo, atualize `.env.local` (`NEXT_PUBLIC_SUPABASE_URL` e chaves) para apontar pro novo projeto.

---

## Manutenção / observações
- **Confirme que o OneDrive/SharePoint está sincronizando** a pasta de destino —
  é o que leva o backup pra nuvem (cópia offsite).
- A tarefa roda no seu usuário, 1x por dia em Seg/Qua/Sex; "executar se perdido"
  garante que rode na primeira vez que o PC ligar naquele dia.
- **Backups são minúsculos (~49 KB).** Se quiser mais margem de histórico, dá pra
  guardar muito mais dias: altere `KEEP` no topo de `scripts/backup-db.mjs`
  (ex.: `KEEP = 14` para duas semanas — custaria menos de 1 MB).
- Para um servidor sempre-ligado da FAM no futuro (rodar às 03:00 sem depender do
  seu PC), basta copiar o projeto lá e rodar `scripts\register-backup-task.ps1`.
- Para alterar a frequência: `powershell -File scripts\register-backup-task.ps1 -StartAt 07:00 -EveryHours 1 -ForHours 13 -TestNow`.
