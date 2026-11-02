/**
 * Atualiza e corrige as métricas na aba 'Métricas e Resumo' 
 * baseando-se estritamente na aba 'Progresso Diário'.
 */
function atualizarMetricasNaPlanilha(ss) {
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  let abaMetricas = ss.getSheetByName("Métricas e Resumo");

  if (!abaProgresso || !abaMetricas) return;

  const dados = abaProgresso.getDataRange().getValues();
  if (dados.length <= 1) {
    abaMetricas.getRange("B2").setValue(0);
    abaMetricas.getRange("B3").setValue(0);
    abaMetricas.getRange("B4").setValue(0);
    return;
  }

  dados.shift(); // Remove o cabeçalho
  let total = dados.length;
  let concluidas = 0;
  let pendentes = 0;

  dados.forEach(linha => {
    // Coluna 6 (índice 5) é o Status na aba Progresso Diário
    let status = String(linha[5] || 'Pendente').trim();
    if (status === 'Concluído') {
      concluidas++;
    } else {
      pendentes++;
    }
  });

  // Grava os valores corretos nas células da aba de Métricas
  abaMetricas.getRange("B2").setValue(total);
  abaMetricas.getRange("B3").setValue(concluidas);
  abaMetricas.getRange("B4").setValue(pendentes);
}

/**
 * Disparado AUTOMATICAMENTE quando o site faz uma requisição GET
 */
function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // EXECUTA A ROTINA DE MÉTRICAS LOGO NA CHEGADA DA REQUISIÇÃO DO SITE
    atualizarMetricasNaPlanilha(ss);

    // O restante do código de leitura...
    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");
    // ... (continua a montagem do JSON para o site)