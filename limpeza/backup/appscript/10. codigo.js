/**
 * ==============================================================================
 * CENTRAL DE TAREFAS - GOOGLE APPS SCRIPT (COMUNICACAO E GATILHOS DIRETOS)
 * ==============================================================================
 */

function setupAplicacaoLimpeza() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const COR_ROXO_HEADER = "#231a42";
  const COR_TEXTO_HEADER = "#ffffff";

  // 1. ABA "Missões" (Mestre de Cadastro)
  let abaMissoes = ss.getSheetByName("Missões");
  if (!abaMissoes) {
    abaMissoes = ss.insertSheet("Missões");
  } else {
    abaMissoes.clear();
  }

  const cabecalhoMissoes = [["ID", "Título da Missão", "Cômodo", "Tempo Est. (min)", "Prioridade"]];
  abaMissoes.getRange("A1:E1").setValues(cabecalhoMissoes);
  abaMissoes.getRange("A1:E1").setBackground(COR_ROXO_HEADER).setFontColor(COR_TEXTO_HEADER).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  const dadosMestre = [
    [1000, "Lavar louça e limpar balcão", "Cozinha", 20, "Alta"],
    [1001, "Higienizar vaso e pia", "Banheiro", 30, "Alta"],
    [1002, "Tirar o lixo da casa", "Quarto", 10, "Média"],
    [1003, "Aspirar e passar pano na sala", "Sala", 25, "Média"],
    [1004, "Organizar corredor", "Corredor", 15, "Baixa"],
    [1005, "Lavar roupas", "Lavanderia", 40, "Média"],
    [1006, "Limpar quintal", "Quintal", 30, "Baixa"]
  ];
  abaMissoes.getRange(2, 1, dadosMestre.length, 5).setValues(dadosMestre);
  abaMissoes.getRange("A2:A500").setNumberFormat("0");
  abaMissoes.setFrozenRows(1);

  // 2. ABA "Progresso Diário"
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  if (!abaProgresso) {
    abaProgresso = ss.insertSheet("Progresso Diário");
  } else {
    abaProgresso.clear();
  }

  const cabecalhoProgresso = [["ID", "Título da Missão", "Cômodo", "Tempo Est. (min)", "Prioridade", "Status", "Hora de Início", "Hora de Término"]];
  abaProgresso.getRange("A1:H1").setValues(cabecalhoProgresso);
  abaProgresso.getRange("A1:H1").setBackground(COR_ROXO_HEADER).setFontColor(COR_TEXTO_HEADER).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");

  const progressoInicial = dadosMestre.map(m => [m[0], m[1], m[2], m[3], m[4], "Pendente", "", ""]);
  abaProgresso.getRange(2, 1, progressoInicial.length, 8).setValues(progressoInicial);
  abaProgresso.getRange("F2:F500").setDataValidation(SpreadsheetApp.newDataValidation().requireValueInList(["Pendente", "Em Andamento", "Concluído"], true).build());
  abaProgresso.getRange("A2:A500").setNumberFormat("0");
  abaProgresso.getRange("G2:H500").setNumberFormat("@");
  abaProgresso.setFrozenRows(1);

  // 3. ABA "Registro de Ponto"
  let abaPonto = ss.getSheetByName("Registro de Ponto");
  if (!abaPonto) {
    abaPonto = ss.insertSheet("Registro de Ponto");
  } else {
    abaPonto.clear();
  }

  const cabecalhoPonto = [["ID Turno", "Data", "Hora Entrada", "Hora Saída", "Duração (Minutos)", "Tempo Trabalhado (Horas)", "Créditos de Descanso (Min)", "Status do Turno"]];
  abaPonto.getRange("A1:H1").setValues(cabecalhoPonto);
  abaPonto.getRange("A1:H1").setBackground(COR_ROXO_HEADER).setFontColor(COR_TEXTO_HEADER).setFontWeight("bold").setHorizontalAlignment("center").setVerticalAlignment("middle");
  abaPonto.setFrozenRows(1);

  // 4. ABA "Métricas e Resumo"
  let abaMetricas = ss.getSheetByName("Métricas e Resumo");
  if (!abaMetricas) {
    abaMetricas = ss.insertSheet("Métricas e Resumo");
  } else {
    abaMetricas.clear();
  }
  abaMetricas.getRange("A1:D1").merge().setValue("PAINEL DE DESEMPENHO").setBackground(COR_ROXO_HEADER).setFontColor(COR_TEXTO_HEADER).setFontWeight("bold").setFontSize(12).setHorizontalAlignment("center");

  const kpis = [
    ["Métrica", "Valor", "Unidade", "Descrição"],
    ["Total de Missões Cadastradas", "=COUNTA('Progresso Diário'!A2:A)", "Qtd", "Volume total"],
    ["Missões Concluídas", '=COUNTIF(\'Progresso Diário\'!F2:F, "Concluído")', "Qtd", "Finalizadas"],
    ["Missões Pendentes", '=COUNTIF(\'Progresso Diário\'!F2:F, "Pendente")', "Qtd", "Pendentes"],
    ["Total de Horas Trabalhadas", '=SUM(\'Registro de Ponto\'!F2:F)', "Horas", "Soma de turnos"],
    ["Saldo de Crédito de Descanso", '=SUM(\'Registro de Ponto\'!G2:G)', "Minutos", "Créditos"]
  ];
  abaMetricas.getRange(2, 1, kpis.length, 4).setValues(kpis);
  abaMetricas.getRange("A2:D2").setBackground("#3b2d6b").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");
  abaMetricas.setFrozenRows(1);

  for (let s of ss.getSheets()) {
    for (let col = 1; col <= s.getLastColumn(); col++) { s.autoResizeColumn(col); }
  }

  const abaPadrao = ss.getSheetByName("Página1") || ss.getSheetByName("Sheet1");
  if (abaPadrao && ss.getSheets().length > 1) {
    try { ss.deleteSheet(abaPadrao); } catch(e) {}
  }
}

function verificarECriarAbas(ss) {
  let abaMissoes = ss.getSheetByName("Missões");
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  let abaPonto = ss.getSheetByName("Registro de Ponto");
  if (!abaMissoes || !abaProgresso || !abaPonto) {
    setupAplicacaoLimpeza();
  }
}

function sincronizarMissoesComProgresso(ss) {
  const abaMissoes = ss.getSheetByName("Missões");
  const abaProgresso = ss.getSheetByName("Progresso Diário");
  if (!abaMissoes || !abaProgresso) return;

  const uLinhaMissoes = abaMissoes.getLastRow();
  if (uLinhaMissoes <= 1) return;

  const dadosMestre = abaMissoes.getRange(2, 1, uLinhaMissoes - 1, 5).getValues();
  
  let progressoIds = [];
  if (abaProgresso.getLastRow() > 1) {
    let vals = abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, 1).getValues();
    vals.forEach(r => progressoIds.push(String(r[0])));
  }

  dadosMestre.forEach(m => {
    if (!progressoIds.includes(String(m[0]))) {
      abaProgresso.appendRow([m[0], m[1], m[2], m[3], m[4], "Pendente", "", ""]);
    }
  });
}

function doGet(e) {
  try {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    verificarECriarAbas(ss);
    sincronizarMissoesComProgresso(ss);

    const abaProgresso = ss.getSheetByName("Progresso Diário");
    const abaPonto = ss.getSheetByName("Registro de Ponto");

    const dadosProgresso = abaProgresso.getDataRange().getValues();
    dadosProgresso.shift();

    const missoes = dadosProgresso.map(linha => {
      let statusClean = String(linha[5] || 'Pendente').trim();
      return {
        id: Number(linha[0]),
        titulo: linha[1],
        comodo: linha[2],
        tempoEstimado: Number(linha[3]),
        prioridade: linha[4],
        status: statusClean,
        horaInicio: String(linha[6] || ''),
        horaTermino: String(linha[7] || ''),
        estadoMissao: statusClean === 'Concluído' ? 'Concluído' : (statusClean === 'Em Andamento' ? 'EmAndamento' : 'Pendente')
      };
    }).filter(m => m.id !== "" && !isNaN(m.id));

    let turnos = [];
    if (abaPonto && abaPonto.getLastRow() > 1) {
      const dadosPonto = abaPonto.getDataRange().getValues();
      dadosPonto.shift();
      turnos = dadosPonto.map(linha => {
        let dataFormatada = linha[1];
        if (dataFormatada instanceof Date) {
          dataFormatada = Utilities.formatDate(dataFormatada, Session.getScriptTimeZone(), "dd/MM/yyyy");
        } else {
          dataFormatada = String(dataFormatada || '');
        }

        return {
          id: Number(linha[0]),
          data: dataFormatada || "",
          entrada: linha[2] ? String(linha[2]).trim() : "",
          saida: linha[3] ? String(linha[3]).trim() : "",
          duracao: linha[4] !== "" && !isNaN(linha[4]) ? Number(linha[4]) : "",
          status: String(linha[7] || "").trim()
        };
      }).filter(t => t.id !== "" && !isNaN(t.id));
    }

    let totalConcluidas = missoes.filter(m => m.status === 'Concluído').length;

    return ContentService.createTextOutput(JSON.stringify({ 
      status: "success", 
      missoes: missoes, 
      turnos: turnos,
      estatisticas: { concluidas: totalConcluidas, totalSegundos: 0 }
    })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}

function doPost(e) {
  try {
    let conteudo = {};
    if (e && e.postData && e.postData.contents) {
      conteudo = JSON.parse(e.postData.contents);
    } else {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload vazio ou inválido." })).setMimeType(ContentService.MimeType.JSON);
    }

    const ss = SpreadsheetApp.getActiveSpreadsheet();
    verificarECriarAbas(ss);

    if (conteudo.acao === "adicionarMissao" || conteudo.acao === "cadastrar") {
      const abaMissoes = ss.getSheetByName("Missões");
      const abaProgresso = ss.getSheetByName("Progresso Diário");
      
      let proximoId = 1000;
      let todosIds = [];
      
      if (abaMissoes && abaMissoes.getLastRow() > 1) {
        let vals = abaMissoes.getRange(2, 1, abaMissoes.getLastRow() - 1, 1).getValues();
        vals.forEach(r => { let n = parseInt(r[0], 10); if(!isNaN(n)) todosIds.push(n); });
      }
      if (abaProgresso && abaProgresso.getLastRow() > 1) {
        let vals = abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, 1).getValues();
        vals.forEach(r => { let n = parseInt(r[0], 10); if(!isNaN(n)) todosIds.push(n); });
      }

      if (todosIds.length > 0) {
        proximoId = Math.max(...todosIds) + 1;
      }

      abaMissoes.appendRow([proximoId, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade]);
      abaProgresso.appendRow([proximoId, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade, "Pendente", "", ""]);

      const l1 = abaMissoes.getLastRow();
      const l2 = abaProgresso.getLastRow();
      abaMissoes.getRange(l1, 1).setNumberFormat("0");
      abaProgresso.getRange(l2, 1).setNumberFormat("0");

      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: proximoId })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "editarMissao") {
      const abaProgresso = ss.getSheetByName("Progresso Diário");
      const abaMissoes = ss.getSheetByName("Missões");

      [abaProgresso, abaMissoes].forEach(aba => {
        if (!aba) return;
        const dados = aba.getDataRange().getValues();
        for (let i = 1; i < dados.length; i++) {
          if (String(dados[i][0]) === String(conteudo.id)) {
            aba.getRange(i + 1, 2).setValue(conteudo.titulo);
            aba.getRange(i + 1, 3).setValue(conteudo.comodo);
            aba.getRange(i + 1, 4).setValue(conteudo.tempoEstimado);
            aba.getRange(i + 1, 5).setValue(conteudo.prioridade);
            break;
          }
        }
      });
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "atualizarEstadoMissao") {
      const abaProgresso = ss.getSheetByName("Progresso Diário");
      const dados = abaProgresso.getDataRange().getValues();
      const horaInicioStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          if (conteudo.estadoMissao === 'EmAndamento') {
            abaProgresso.getRange(i + 1, 6).setValue("Em Andamento");
            if (!dados[i][6]) {
              abaProgresso.getRange(i + 1, 7).setNumberFormat("@").setValue(horaInicioStr);
            }
          }
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "concluirMissao") {
      const abaProgresso = ss.getSheetByName("Progresso Diário");
      const dados = abaProgresso.getDataRange().getValues();
      const horaTerminoStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.getRange(i + 1, 6).setValue("Concluído");
          if (!dados[i][6]) {
            abaProgresso.getRange(i + 1, 7).setNumberFormat("@").setValue(horaTerminoStr);
          }
          abaProgresso.getRange(i + 1, 8).setNumberFormat("@").setValue(horaTerminoStr);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirMissao") {
      const abaProgresso = ss.getSheetByName("Progresso Diário");
      const dados = abaProgresso.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.deleteRow(i + 1);
          break;
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "baterPonto") {
      const abaPonto = ss.getSheetByName("Registro de Ponto");
      
      if (conteudo.status === "ENTRADA") {
        const ultimaLinha = abaPonto.getLastRow();
        let proximoId = 1000;
        if (ultimaLinha > 1) {
          const ultimoId = abaPonto.getRange(ultimaLinha, 1).getValue();
          proximoId = !isNaN(ultimoId) && ultimoId !== "" ? Number(ultimoId) + 1 : 1000;
        }

        const dataAtual = new Date();
        const dataApenasData = Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const horaEntradaStr = Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "HH:mm:ss");

        abaPonto.appendRow([proximoId, dataApenasData, horaEntradaStr, "", "", "", "", "Em Serviço"]);
        const lIndex = abaPonto.getLastRow();
        abaPonto.getRange(lIndex, 1).setNumberFormat("0");
        abaPonto.getRange(lIndex, 2).setNumberFormat("@");
        abaPonto.getRange(lIndex, 3).setNumberFormat("@");
      } else if (conteudo.status === "SAIDA") {
        const dados = abaPonto.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (String(dados[i][7]).trim() === "Em Serviço") {
            const linha = i + 1;
            const minutos = Math.round((conteudo.duracaoSegundos || 0) / 60);
            const horaSaidaStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");

            abaPonto.getRange(linha, 4).setNumberFormat("@").setValue(horaSaidaStr);
            abaPonto.getRange(linha, 5).setNumberFormat("0").setValue(minutos);
            abaPonto.getRange(linha, 6).setNumberFormat("0,00").setValue(`=E${linha}/60`);
            abaPonto.getRange(linha, 7).setNumberFormat("0,00").setValue(`=E${linha}*0,5`);
            abaPonto.getRange(linha, 8).setValue("Encerrado");
            break;
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirLote") {
      const tipo = conteudo.tipo;
      const idsParaExcluir = (conteudo.ids || []).map(id => String(id));

      if (tipo === "progresso") {
        const abaProgresso = ss.getSheetByName("Progresso Diário");
        const dados = abaProgresso.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) {
            abaProgresso.deleteRow(i + 1);
          }
        }
      } else if (tipo === "turnos") {
        const abaPonto = ss.getSheetByName("Registro de Ponto");
        const dados = abaPonto.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) {
            abaPonto.deleteRow(i + 1);
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "limparDados") {
      const escopo = conteudo.escopo;
      if (escopo === "progresso" || escopo === "tudo") {
        const abaProgresso = ss.getSheetByName("Progresso Diário");
        if (abaProgresso && abaProgresso.getLastRow() > 1) {
          abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, abaProgresso.getLastColumn()).clearContent();
        }
      }
      if (escopo === "ponto" || escopo === "tudo") {
        const abaPonto = ss.getSheetByName("Registro de Ponto");
        if (abaPonto && abaPonto.getLastRow() > 1) {
          abaPonto.getRange(2, 1, abaPonto.getLastRow() - 1, abaPonto.getLastColumn()).clearContent();
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Ação não reconhecida." })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}