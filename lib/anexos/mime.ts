// Tipo do arquivo deduzido pela extensão.
//
// Existe porque há duas portas de upload no CRM e elas não podem discordar: o
// navegador (AnexosSection) às vezes manda `file.type` vazio, e o anexo que sai
// de dentro de um e-mail não tem tipo nenhum — o .msg guarda só o nome. Sem tipo,
// o Storage grava tudo como `application/octet-stream` e o PDF abre como download
// em vez de abrir na tela.
export function mimePorNome(nome: string): string {
  const ext = nome.split('.').pop()?.toLowerCase()
  const map: Record<string, string> = {
    pdf: 'application/pdf', html: 'text/html', htm: 'text/html',
    doc: 'application/msword',
    docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    xls: 'application/vnd.ms-excel',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xlsm: 'application/vnd.ms-excel.sheet.macroEnabled.12',
    ppt: 'application/vnd.ms-powerpoint',
    pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg',
    gif: 'image/gif', txt: 'text/plain', csv: 'text/csv',
    xml: 'application/xml', json: 'application/json',
    zip: 'application/zip', rar: 'application/vnd.rar', '7z': 'application/x-7z-compressed',
    msg: 'application/vnd.ms-outlook', eml: 'message/rfc822',
    mp4: 'video/mp4', mp3: 'audio/mpeg',
  }
  return (ext && map[ext]) || 'application/octet-stream'
}
