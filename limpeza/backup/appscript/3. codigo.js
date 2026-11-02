/**
 * ==============================================================================
 * CENTRAL DE TAREFAS - GOOGLE APPS SCRIPT (GRAVAÇÃO E FORMATAÇÃO DIRETA)
 * ==============================================================================
 */

/**
 * Aplica autofit nativo do Google Sheets em todas as colunas da aba inteira.
 */
function aplicarAutofitTabelaInteira(aba) {
  let ultimaColuna = aba.getLastColumn();
  if (ultimaColuna > 0) {
    for (let c = 1; c <= ultimaColuna; c++) {
      aba.autoResizeColumn(c);
    }
  }
}

/**
 * Converte minutos para o formato limpo: 0 ou Xm Ys (ex: 5m, 15m 30s)
 */
function formatarTempoMinutosParaTexto(minutos) {
  if (isNaN(minutos) || minutos <= 0) return "0";
  let totalSegundos = Math.round(minutos * 60);
  let m = Math.floor(totalSegundos / 60);
  let s = totalSegundos % 60;

  if (m > 0 && s > 0) return m + "m " + s + "s";
  if (m > 0) return m + "m";
  return s + "s";
}

/**
 * Converte segundos em string no formato "HH:mm:ss"
 */
function segundosParaHHMMSS(totalSegundos) {
  if (isNaN(totalSegundos) || totalSegundos < 0) return "00:00:00";
  let h = Math.floor(totalSegundos / 3600);
  let m = Math.floor((totalSegundos % 3600) / 60);
  let s = Math.floor(totalSegundos % 60);
  return String(h).padStart(2, '0') + ":" + String(m).padStart(2, '0') + ":" + String(s).padStart(2, '0');
}

/**
 * Calcula a diferença em minutos entre duas horas no formato HH:mm:ss
 */
function calcularDiferencaMinutosApenasHora(hInicio, hFim) {
  try {
    let p1 = String(hInicio).split(':');
    let p2 = String(hFim).split(':');
    if (p1.length < 2 || p2.length < 2) return 0;

    let min1 = parseInt(p1[0]) * 60 + parseInt(p1[1]) + (p1[2] ? parseInt(p1[2]) / 60 : 0);
    let min2 = parseInt(p2[0]) * 60 + parseInt(p2[1]) + (p2[2] ? parseInt(p2[2]) / 60 : 0);

    let diff = min2 - min1;
    return diff > 0 ? diff : 0;
  } catch (e) {
    return 0;
  }
}

/**
 * Verifica e lança automaticamente as missões base para a data de hoje sem duplicar.
 */
function verificarELancarMissoesDoDia(ss) {
  let abaMissao = ss.getSheetByName("Missões");
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  if (!abaMissao || !abaProgresso) return;

  let dataHojeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

  let ultLinhaMissoes = abaMissao.getLastRow();
  if (ultLinhaMissoes <= 1) return;
  let dadosMissoesBase = abaMissao.getRange(2, 1, ultLinhaMissoes - 1, abaMissao.getLastColumn()).getValues();

  let ultLinhaProg = abaProgresso.getLastRow();
  let houveLancamento = false;

  dadosMissoesBase.forEach(mBase => {
    let idOriginal = String(mBase[0]).trim();
    let titulo = mBase[1];
    let comodo = mBase[2];
    let tempoEstimado = mBase[3];
    let prioridade = mBase[4];

    if (idOriginal !== "") {
      let jaLancadaHoje = false;
      
      if (ultLinhaProg > 1) {
        let dadosProg = abaProgresso.getRange(2, 1, ultLinhaProg - 1, 2).getValues();
        for (let p = 0; p < dadosProg.length; p++) {
          let pId = String(dadosProg[p][0]).trim();
          let pData = String(dadosProg[p][1]).trim();
          if (pId === idOriginal && pData === dataHojeStr) {
            jaLancadaHoje = true;
            break;
          }
        }
      }

      if (!jaLancadaHoje) {
        abaProgresso.appendRow([idOriginal, dataHojeStr, titulo, comodo, tempoEstimado, prioridade, "Pendente", "", "", "0"]);
        houveLancamento = true;
      }
    }
  });

  if (houveLancamento) {
    aplicarAutofitTabelaInteira(abaProgresso);
  }
}

/**
 * Recalcula e atualiza as métricas e formatações na hora da leitura ou escrita.
 */
function atualizarPlanilhaEMetricas(ss) {
  let abaProgresso = ss.getSheetByName("Progresso Diário");
  let abaPonto = ss.getSheetByName("Registro de Ponto");
  let abaMetricas = ss.getSheetByName("Métricas e Resumo");
  let abaMissao = ss.getSheetByName("Missões");

  if (!abaProgresso) return;

  if (abaMissao) aplicarAutofitTabelaInteira(abaMissao);

  let cabecalhoProg = abaProgresso.getRange(1, 1, 1, abaProgresso.getLastColumn()).getValues()[0];
  if (cabecalhoProg.length < 2 || cabecalhoProg[1] !== "Data") {
    abaProgresso.insertColumnAfter(1);
    abaProgresso.getRange(1, 2).setValue("Data").setBackground("#231a42").setFontColor("#ffffff").setFontWeight("bold");
  }

  let ultimaLinhaProg = abaProgresso.getLastRow();
  let totalMissoes = 0;
  let concluidas = 0;
  let pendentes = 0;
  let creditosPorDia = {};
  let dataHojeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");

  if (ultimaLinhaProg > 1) {
    let dadosProg = abaProgresso.getRange(2, 1, ultimaLinhaProg - 1, abaProgresso.getLastColumn()).getValues();
    
    dadosProg.forEach((linha, index) => {
      let id = String(linha[0]).trim();
      if (id !== "" && !isNaN(id)) {
        totalMissoes++;
        
        let celData = abaProgresso.getRange(index + 2, 2);
        let valorData = String(linha[1] || "").trim();
        if (!valorData || valorData === "") {
          celData.setValue(dataHojeStr);
          valorData = dataHojeStr;
        }
        celData.setNumberFormat("@").setHorizontalAlignment("center");

        let statusIdx = 5;
        for(let idx = 0; idx < linha.length; idx++) {
          let vStr = String(linha[idx]).trim();
          if(vStr === "Concluído" || vStr === "Pendente" || vStr === "Em Andamento") {
            statusIdx = idx;
            break;
          }
        }
        
        let status = String(linha[statusIdx] || 'Pendente').trim();
        let tempoEstimadoMin = parseFloat(linha[4]) || 0; 
        let horaInicioCompleta = String(linha[statusIdx + 1] || "").trim();
        let horaTerminoCompleta = String(linha[statusIdx + 2] || "").trim();
        let creditoMissaoMin = 0;

        let celInicio = abaProgresso.getRange(index + 2, statusIdx + 2);
        let celTermino = abaProgresso.getRange(index + 2, statusIdx + 3);

        if (horaInicioCompleta.includes(" ")) horaInicioCompleta = horaInicioCompleta.split(" ")[1];
        if (horaTerminoCompleta.includes(" ")) horaTerminoCompleta = horaTerminoCompleta.split(" ")[1];

        celInicio.setValue(horaInicioCompleta).setHorizontalAlignment("center");
        celTermino.setValue(horaTerminoCompleta).setHorizontalAlignment("center");

        if (status === 'Concluído') {
          concluidas++;
          if (horaInicioCompleta && horaTerminoCompleta) {
            let tempoRealMin = calcularDiferencaMinutosApenasHora(horaInicioCompleta, horaTerminoCompleta);
            let ganho = tempoEstimadoMin - tempoRealMin;
            if (ganho > 0) creditoMissaoMin = Number(ganho.toFixed(2));
          }

          let dataDia = valorData.includes("/") ? valorData : dataHojeStr;
          if (!creditosPorDia[dataDia]) creditosPorDia[dataDia] = 0;
          creditosPorDia[dataDia] += creditoMissaoMin;
        } else {
          pendentes++;
        }

        let textoCredito = formatarTempoMinutosParaTexto(creditoMissaoMin);
        let linhaPlanilha = index + 2;
        let colUltima = abaProgresso.getLastColumn();
        
        abaProgresso.getRange(linhaPlanilha, colUltima).setValue(textoCredito).setHorizontalAlignment("center");
        abaProgresso.getRange(linhaPlanilha, 5).setHorizontalAlignment("center");
        abaProgresso.getRange(linhaPlanilha, 6).setHorizontalAlignment("center");
      }
    });
  }
  aplicarAutofitTabelaInteira(abaProgresso);

  let totalHorasTrabalhadasMinutos = 0;
  let saldoTotalCreditosDescansoMinutos = 0;

  if (abaPonto && abaPonto.getLastRow() > 1) {
    abaPonto.getRange(1, 6).setValue("Tempo Trabalhado");
    abaPonto.getRange(1, 7).setValue("Créditos");

    let ultimaLinhaPonto = abaPonto.getLastRow();
    let dadosPonto = abaPonto.getRange(2, 1, ultimaLinhaPonto - 1, 8).getValues();
    
    dadosPonto.forEach((linha, index) => {
      let idTurno = String(linha[0]).trim();
      if (idTurno !== "" && !isNaN(idTurno)) {
        let dataTurno = String(linha[1] || "").trim();
        let duracaoMinutosTurno = parseFloat(linha[4]) || 0;
        
        totalHorasTrabalhadasMinutos += duracaoMinutosTurno;

        let creditosDoDiaMin = creditosPorDia[dataTurno] || 0;
        let saldoLiquidoMin = Math.max(0, creditosDoDiaMin);
        saldoTotalCreditosDescansoMinutos += saldoLiquidoMin;

        let linhaPlanilha = index + 2;
        abaPonto.getRange(linhaPlanilha, 2).setNumberFormat("@").setHorizontalAlignment("center");
        abaPonto.getRange(linhaPlanilha, 6).setValue(segundosParaHHMMSS(Math.round(duracaoMinutosTurno * 60))).setHorizontalAlignment("center");
        abaPonto.getRange(linhaPlanilha, 7).setValue(formatarTempoMinutosParaTexto(saldoLiquidoMin)).setHorizontalAlignment("center");
      }
    });
    aplicarAutofitTabelaInteira(abaPonto);
  }

  if (abaMetricas) {
    abaMetricas.clear();
    abaMetricas.getRange("A1:C1").setValues([["Indicador / Métrica", "Valor", "Descrição"]]);
    abaMetricas.getRange("A1:C1").setBackground("#231a42").setFontColor("#ffffff").setFontWeight("bold").setHorizontalAlignment("center");

    let tabelaValores = [
      ["Total de Missões Cadastradas", totalMissoes, "Volume total de tarefas na base"],
      ["Missões Concluídas", concluidas, "Tarefas finalizadas"],
      ["Missões Pendentes", pendentes, "Aguardando execução"],
      ["Total de Horas Trabalhadas", segundosParaHHMMSS(Math.round(totalHorasTrabalhadasMinutos * 60)), "Soma de todos os turnos"],
      ["Saldo de Crédito de Descanso", formatarTempoMinutosParaTexto(saldoTotalCreditosDescansoMinutos), "Créditos liberados para folga"]
    ];

    abaMetricas.getRange(2, 1, tabelaValores.length, 3).setValues(tabelaValores);
    abaMetricas.getRange(2, 2, tabelaValores.length, 1).setHorizontalAlignment("center");
    aplicarAutofitTabelaInteira(abaMetricas);
  }
}

/**
 * Retorna o esquema estrutural completo da planilha
 */
function obterEsquemaPlanilha() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const abas = ss.getSheets();
  let esquema = [];

  abas.forEach(aba => {
    let nomeAba = aba.getName();
    let ultimaLinha = aba.getLastRow();
    let ultimaColuna = aba.getLastColumn();
    let cabecalhos = [];
    let tiposDados = [];

    if (ultimaColuna > 0) {
      cabecalhos = aba.getRange(1, 1, 1, ultimaColuna).getValues()[0];
      if (ultimaLinha > 1) {
        let amostra = aba.getRange(2, 1, Math.min(ultimaLinha - 1, 5), ultimaColuna).getValues();
        for (let c = 0; c < ultimaColuna; c++) {
          let tipoInferido = "Texto";
          for (let r = 0; r < amostra.length; r++) {
            let val = amostra[r][c];
            if (typeof val === "number") {
              tipoInferido = "Número";
              break;
            } else if (val instanceof Date) {
              tipoInferido = "Data/Hora";
              break;
            }
          }
          tiposDados.push(tipoInferido);
        }
      } else {
        cabecalhos.forEach(() => tiposDados.push("Vazio"));
      }
    }

    esquema.push({
      nomeAba: nomeAba,
      totalLinhas: ultimaLinha,
      totalColunas: ultimaColuna,
      colunas: cabecalhos.map((col, index) => ({
        posicao: index + 1,
        cabecalho: col || `Coluna ${index + 1}`,
        tipoDetectado: tiposDados[index] || "Desconhecido"
      }))
    });
  });

  return esquema;
}

/**
 * Comunicação Web - GET
 */
function doGet(e) {
  try {
    const params = e && e.parameter ? e.parameter : {};
    const ss = SpreadsheetApp.getActiveSpreadsheet();

    verificarELancarMissoesDoDia(ss);
    atualizarPlanilhaEMetricas(ss);

    if (params.acao === "esquema") {
      return ContentService.createTextOutput(JSON.stringify({
        status: "success",
        esquema: obterEsquemaPlanilha()
      })).setMimeType(ContentService.MimeType.JSON);
    }

    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");

    if (!abaProgresso) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Aba Progresso Diário não encontrada." })).setMimeType(ContentService.MimeType.JSON);
    }

    const dadosProgresso = abaProgresso.getDataRange().getValues();
    dadosProgresso.shift();

    const missoes = dadosProgresso.map(linha => {
      let statusClean = String(linha[6] || 'Pendente').trim();
      let horaInicioVal = String(linha[7] || '').trim();
      if (horaInicioVal.includes(" ")) horaInicioVal = horaInicioVal.split(" ")[1];

      return {
        id: Number(linha[0]),
        data: String(linha[1] || ''),
        titulo: linha[2],
        comodo: linha[3],
        tempoEstimado: Number(linha[4]),
        prioridade: linha[5],
        status: String(linha[6] || statusClean),
        horaInicio: horaInicioVal,
        horaTermino: String(linha[8] || ''),
        creditos: String(linha[9] || '0'),
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
          tempoTrabalhado: String(linha[5] || '00:00:00'),
          creditos: String(linha[6] || '0'),
          status: String(linha[7] || "").trim()
        };
      }).filter(t => t.id !== "" && !isNaN(t.id));
    }

    let abaMetricas = ss.getSheetByName("Métricas e Resumo");
    let totalConcluidas = 0;
    if (abaMetricas && abaMetricas.getLastRow() > 1) {
      let valM = abaMetricas.getRange("B3").getValue();
      if (!isNaN(valM)) totalConcluidas = Number(valM);
    }

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

/**
 * Comunicação Web - POST
 */
function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Payload vazio." })).setMimeType(ContentService.MimeType.JSON);
    }

    const conteudo = JSON.parse(e.postData.contents);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let abaProgresso = ss.getSheetByName("Progresso Diário");
    let abaPonto = ss.getSheetByName("Registro de Ponto");
    let abaMissoes = ss.getSheetByName("Missões");

    if (conteudo.acao === "adicionarMissao" || conteudo.acao === "cadastrar") {
      let proximoId = 1000;
      let todosIds = [];
      if (abaProgresso && abaProgresso.getLastRow() > 1) {
        let vals = abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, 1).getValues();
        vals.forEach(r => { let n = parseInt(r[0], 10); if(!isNaN(n)) todosIds.push(n); });
      }
      if (todosIds.length > 0) proximoId = Math.max(...todosIds) + 1;

      let dataHojeStr = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "dd/MM/yyyy");
      abaProgresso.appendRow([proximoId, dataHojeStr, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade, "Pendente", "", "", "0"]);
      if (abaMissoes) abaMissoes.appendRow([proximoId, conteudo.titulo, conteudo.comodo, conteudo.tempoEstimado, conteudo.prioridade]);
      abaProgresso.getRange(abaProgresso.getLastRow(), 1).setNumberFormat("0");

      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success", id: proximoId })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "editarMissao") {
      if (abaProgresso && abaProgresso.getLastRow() > 1) {
        let dadosProg = abaProgresso.getDataRange().getValues();
        for (let i = 1; i < dadosProg.length; i++) {
          if (String(dadosProg[i][0]) === String(conteudo.id)) {
            abaProgresso.getRange(i + 1, 3).setValue(conteudo.titulo); 
            abaProgresso.getRange(i + 1, 4).setValue(conteudo.comodo); 
            abaProgresso.getRange(i + 1, 5).setValue(conteudo.tempoEstimado); 
            abaProgresso.getRange(i + 1, 6).setValue(conteudo.prioridade); 
          }
        }
      }

      if (abaMissoes && abaMissoes.getLastRow() > 1) {
        let dadosMissoes = abaMissoes.getDataRange().getValues();
        for (let j = 1; j < dadosMissoes.length; j++) {
          if (String(dadosMissoes[j][0]) === String(conteudo.id)) {
            abaMissoes.getRange(j + 1, 2).setValue(conteudo.titulo); 
            abaMissoes.getRange(j + 1, 3).setValue(conteudo.comodo); 
            abaMissoes.getRange(j + 1, 4).setValue(conteudo.tempoEstimado); 
            abaMissoes.getRange(j + 1, 5).setValue(conteudo.prioridade); 
            break;
          }
        }
      }

      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "atualizarEstadoMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      const horaInicioStr = conteudo.horaExata || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          for(let c=1; c<=dados[i].length; c++) {
            let val = String(abaProgresso.getRange(i + 1, c).getValue()).trim();
            if(val === "Pendente" || val === "Em Andamento") {
              if (conteudo.estadoMissao === 'EmAndamento') {
                abaProgresso.getRange(i + 1, c).setValue("Em Andamento");
                abaProgresso.getRange(i + 1, c + 1).setNumberFormat("@").setValue(horaInicioStr);
              }
              break;
            }
          }
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "concluirMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      const horaTerminoStr = conteudo.horaExata || Utilities.formatDate(new Date(), Session.getScriptTimeZone(), "HH:mm:ss");
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          for(let c=1; c<=dados[i].length; c++) {
            let val = String(abaProgresso.getRange(i + 1, c).getValue()).trim();
            if(val === "Pendente" || val === "Em Andamento") {
              abaProgresso.getRange(i + 1, c).setValue("Concluído");
              let celInicio = abaProgresso.getRange(i + 1, c + 1);
              if (!celInicio.getValue()) {
                celInicio.setNumberFormat("@").setValue(horaTerminoStr);
              }
              abaProgresso.getRange(i + 1, c + 2).setNumberFormat("@").setValue(horaTerminoStr);
              break;
            }
          }
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirMissao") {
      const dados = abaProgresso.getDataRange().getValues();
      for (let i = 1; i < dados.length; i++) {
        if (String(dados[i][0]) === String(conteudo.id)) {
          abaProgresso.deleteRow(i + 1);
          break;
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "baterPonto") {
      if (conteudo.status === "ENTRADA") {
        const ultimaLinha = abaPonto.getLastRow();
        let proximoId = 1000;
        if (ultimaLinha > 1) {
          const ultimoId = abaPonto.getRange(ultimaLinha, 1).getValue();
          proximoId = !isNaN(ultimoId) && ultimoId !== "" ? Number(ultimoId) + 1 : 1000;
        }
        const dataAtual = new Date();
        const dataApenasData = Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "dd/MM/yyyy");
        const horaEntradaStr = conteudo.horaExata || Utilities.formatDate(dataAtual, Session.getScriptTimeZone(), "HH:mm:ss");

        abaPonto.appendRow([proximoId, dataApenasData, horaEntradaStr, "", "", "00:00:00", "0", "Em Serviço"]);
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
            abaPonto.getRange(linha, 8).setValue("Encerrado");
            break;
          }
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "excluirLote") {
      const tipo = conteudo.tipo;
      const idsParaExcluir = (conteudo.ids || []).map(id => String(id));
      if (tipo === "progresso") {
        const dados = abaProgresso.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) abaProgresso.deleteRow(i + 1);
        }
      } else if (tipo === "turnos") {
        const dados = abaPonto.getDataRange().getValues();
        for (let i = dados.length - 1; i >= 1; i--) {
          if (idsParaExcluir.includes(String(dados[i][0]))) abaPonto.deleteRow(i + 1);
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    if (conteudo.acao === "limparDados") {
      const escopo = conteudo.escopo;
      if (escopo === "progresso" || escopo === "tudo") {
        if (abaProgresso && abaProgresso.getLastRow() > 1) {
          abaProgresso.getRange(2, 1, abaProgresso.getLastRow() - 1, abaProgresso.getLastColumn()).clearContent();
        }
      }
      if (escopo === "ponto" || escopo === "tudo") {
        if (abaPonto && abaPonto.getLastRow() > 1) {
          abaPonto.getRange(2, 1, abaPonto.getLastRow() - 1, abaPonto.getLastColumn()).clearContent();
        }
      }
      atualizarPlanilhaEMetricas(ss);
      return ContentService.createTextOutput(JSON.stringify({ status: "success" })).setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "Ação não reconhecida." })).setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() })).setMimeType(ContentService.MimeType.JSON);
  }
}