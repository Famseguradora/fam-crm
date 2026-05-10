export default function HomePage() {
  return (
    <div>
      <div style={{ fontSize: 20, fontWeight: 700, color: '#102040', marginBottom: 4 }}>
        Painel Executivo
      </div>
      <div style={{ fontSize: 13, color: '#6080a0', marginBottom: 24 }}>
        Dashboard em desenvolvimento — próxima etapa
      </div>
      <div style={{
        background: 'white', borderRadius: 12, padding: '40px 24px',
        border: '2px dashed #a0c0e8', textAlign: 'center',
        boxShadow: '0 2px 12px rgba(30,64,128,.08)',
      }}>
        <div style={{ fontSize: 48, marginBottom: 12 }}>📊</div>
        <div style={{ fontSize: 18, fontWeight: 700, color: '#1a3560', marginBottom: 8 }}>
          Dashboard
        </div>
        <div style={{ fontSize: 14, color: '#6080a0' }}>
          Será construído na próxima etapa, após Login e Cadastros.
        </div>
      </div>
    </div>
  )
}
